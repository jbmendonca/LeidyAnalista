import { ImportStatus, Prisma, ResolutionKind } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { conflito, naoEncontrado } from '@/server/http-errors'
import { logger } from '@/server/logger'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { recalcularDenominadoresDeReferencia } from '@/modules/skills/application/resolve-reference-items'
import { reconciliarEstudantes } from './resolve-students'
import { gerarCodigoUnico } from '@/modules/students/domain/unique-code'
import { toPercent } from '@/lib/decimal'
import type { AuthContext } from '@/server/authorization'
import { assertSchoolInScope } from '@/server/authorization'
import type { ParsedSkillResult } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  CONFIRMAÇÃO DA IMPORTAÇÃO — passos 10 a 13 do pipeline
 * ===========================================================================
 *
 * Promove o estágio para as tabelas finais **numa única transação**. Falha em
 * qualquer ponto reverte tudo e leva a `FAILED`, sem estado parcial (FR-083).
 *
 * O que se grava é exatamente o que a pré-visualização mostrou: o estágio não
 * é reprocessado, é promovido. Não existe caminho em que o usuário aprove uma
 * leitura e o sistema persista outra.
 */

type DadosEstagio = {
  codigoTurmaNormalizado: string
  nomeOriginal: string
  nomeNormalizado: string
  avaliado: boolean
  nivelOriginal: string
  nivelNormalizado: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | null
  codigoUnico: string | null
  habilidades: Record<string, ParsedSkillResult>
  turma: string
  anoEscolar: string
}

export type OpcoesConfirmacao = Readonly<{
  /**
   * Ação explícita do usuário para cadastrar os estudantes que o arquivo traz
   * e a base não tem (FR-172). Sem isso a confirmação é recusada, em vez de
   * descartar linhas em silêncio.
   */
  cadastrarNaoEncontrados?: boolean
  /** Vínculos decididos individualmente para os casos de homônimo (FR-176). */
  vinculosManuais?: Readonly<Record<number, string>>
}>

export type ResultadoConfirmacao = Readonly<{
  importId: string
  persistidos: number
  estudantesCriados: number
  turmasCriadas: number
}>

export async function confirmImport(
  ctx: AuthContext,
  importId: string,
  opcoes: OpcoesConfirmacao = {},
): Promise<ResultadoConfirmacao> {
  const registro = await prisma.import.findUnique({
    where: { id: importId },
    select: {
      id: true,
      assessmentId: true,
      schoolId: true,
      status: true,
      fileHash: true,
      fileName: true,
    },
  })
  if (!registro) throw naoEncontrado('Importação')
  assertSchoolInScope(ctx, registro.schoolId)

  if (registro.status === ImportStatus.COMPLETED) {
    throw conflito('Esta importação já foi confirmada.')
  }
  if (registro.status !== ImportStatus.READY) {
    throw conflito('A importação precisa ser validada antes da confirmação.')
  }

  // ERROR pendente impede a confirmação — FR-040.
  const erros = await prisma.importIssue.count({
    where: { importId, severity: 'ERROR' },
  })
  if (erros > 0) {
    throw conflito(
      `A importação possui ${erros} inconsistência(s) crítica(s). Corrija o arquivo e reenvie.`,
    )
  }

  const estagio = await prisma.importRow.findMany({
    where: { importId },
    orderBy: { rowNumber: 'asc' },
  })
  if (estagio.length === 0) {
    throw conflito('Não há linhas para confirmar.')
  }

  const linhas = estagio.map((r) => ({
    rowNumber: r.rowNumber,
    dados: r.parsedData as unknown as DadosEstagio,
  }))

  const { propostas } = await reconciliarEstudantes(
    registro.schoolId,
    linhas.map((l) => ({
      rowNumber: l.rowNumber,
      codigoTurmaNormalizado: l.dados.codigoTurmaNormalizado,
      nomeOriginal: l.dados.nomeOriginal,
      nomeNormalizado: l.dados.nomeNormalizado,
      codigoUnico: l.dados.codigoUnico,
    })),
  )

  const porLinha = new Map(propostas.map((p) => [p.rowNumber, p]))
  const manuais = opcoes.vinculosManuais ?? {}

  // Ambíguos sem decisão individual bloqueiam: escolher um homônimo por conta
  // própria seria exatamente a mesclagem que FR-142 proíbe.
  const ambiguosPendentes = propostas.filter(
    (p) => p.ambiguo && manuais[p.rowNumber] === undefined,
  )
  if (ambiguosPendentes.length > 0) {
    throw conflito(
      `${ambiguosPendentes.length} vínculo(s) exigem decisão individual por haver homônimos na turma.`,
    )
  }

  const naoEncontrados = propostas.filter(
    (p) => p.studentId === null && !p.ambiguo && manuais[p.rowNumber] === undefined,
  )
  if (naoEncontrados.length > 0 && !opcoes.cadastrarNaoEncontrados) {
    throw conflito(
      `${naoEncontrados.length} estudante(s) do arquivo não constam do cadastro. ` +
        'Cadastre-os na pré-visualização ou corrija o arquivo antes de confirmar.',
    )
  }

  await prisma.import.update({
    where: { id: importId },
    data: { status: ImportStatus.PROCESSING },
  })

  try {
    const resultado = await prisma.$transaction(
      async (tx) => {
        const catalogo = await tx.skill.findMany({ select: { id: true, shortCode: true } })
        const idPorShortCode = new Map(catalogo.map((s) => [s.shortCode, s.id]))

        // --- turmas ---------------------------------------------------------
        const codigosTurma = [
          ...new Set(linhas.map((l) => l.dados.codigoTurmaNormalizado)),
        ]
        const turmasExistentes = await tx.class.findMany({
          where: { schoolId: registro.schoolId, externalCode: { in: codigosTurma } },
          select: { id: true, externalCode: true },
        })
        const turmaPorCodigo = new Map(turmasExistentes.map((t) => [t.externalCode, t.id]))
        let turmasCriadas = 0

        for (const codigo of codigosTurma) {
          if (turmaPorCodigo.has(codigo)) continue
          const modelo = linhas.find((l) => l.dados.codigoTurmaNormalizado === codigo)
          const nova = await tx.class.create({
            data: {
              schoolId: registro.schoolId,
              externalCode: codigo,
              name: modelo?.dados.turma ?? codigo,
              anoEscolar: modelo?.dados.anoEscolar ?? '',
            },
            select: { id: true },
          })
          turmaPorCodigo.set(codigo, nova.id)
          turmasCriadas++
        }

        // --- estudantes -----------------------------------------------------
        let estudantesCriados = 0
        const studentIdPorLinha = new Map<number, string>()

        for (const l of linhas) {
          const manual = manuais[l.rowNumber]
          if (manual) {
            studentIdPorLinha.set(l.rowNumber, manual)
            continue
          }

          const p = porLinha.get(l.rowNumber)
          if (p?.studentId) {
            studentIdPorLinha.set(l.rowNumber, p.studentId)
            continue
          }

          // Criação por ação explícita do usuário (FR-143, FR-172).
          const classId = turmaPorCodigo.get(l.dados.codigoTurmaNormalizado)
          if (!classId) throw new Error(`Turma não resolvida: ${l.dados.codigoTurmaNormalizado}`)

          const novo = await criarEstudanteComCodigo(tx, {
            schoolId: registro.schoolId,
            classId,
            nomeOriginal: l.dados.nomeOriginal,
            nomeNormalizado: l.dados.nomeNormalizado,
          })
          studentIdPorLinha.set(l.rowNumber, novo.id)
          estudantesCriados++

          await registrarAuditoria(tx, {
            action: 'STUDENT_CREATE',
            userId: ctx.userId,
            entityType: 'Student',
            entityId: novo.id,
            schoolId: registro.schoolId,
            metadata: { uniqueCode: novo.uniqueCode, importId, origem: 'IMPORTACAO' },
          })
        }

        // --- resultados -----------------------------------------------------
        let persistidos = 0

        for (const l of linhas) {
          const studentId = studentIdPorLinha.get(l.rowNumber)
          const classId = turmaPorCodigo.get(l.dados.codigoTurmaNormalizado)
          if (!studentId || !classId) continue

          const { avaliado, habilidades } = l.dados

          // Const. I e FR-059: o não avaliado não recebe totais. Zero aqui
          // seria a distorção que o produto existe para evitar — e a CHECK
          // constraint do banco recusaria de qualquer forma.
          let acertosTotais: number | null = null
          let itensTotais: number | null = null

          if (avaliado) {
            let somaAcertos = 0
            let somaItens = 0
            let temResultado = false
            for (const r of Object.values(habilidades)) {
              if (r.acertos !== null && r.itensPossiveis !== null) {
                somaAcertos += r.acertos
                somaItens += r.itensPossiveis
                temResultado = true
              }
            }
            if (temResultado && somaItens > 0) {
              acertosTotais = somaAcertos
              itensTotais = somaItens
            }
          }

          const percentualGeral =
            acertosTotais !== null && itensTotais !== null
              ? toPercent({ acertos: acertosTotais, itens: itensTotais })
              : null

          const resultado = await tx.assessmentStudentResult.create({
            data: {
              assessmentId: registro.assessmentId,
              schoolId: registro.schoolId,
              classId,
              studentId,
              importId,
              avaliado,
              nivelOriginal: l.dados.nivelOriginal,
              nivelNormalizado: avaliado ? l.dados.nivelNormalizado : null,
              acertosTotais,
              itensTotais,
              percentualGeral:
                percentualGeral === null
                  ? null
                  : new Prisma.Decimal(percentualGeral.toFixed(4)),
            },
            select: { id: true },
          })

          const skillRows: Prisma.StudentSkillResultCreateManyInput[] = []
          for (const [shortCode, r] of Object.entries(habilidades)) {
            const skillId = idPorShortCode.get(shortCode)
            if (!skillId) continue

            const percentual =
              r.acertos !== null && r.itensPossiveis !== null
                ? toPercent({ acertos: r.acertos, itens: r.itensPossiveis })
                : null

            skillRows.push({
              resultId: resultado.id,
              skillId,
              valorOriginal: r.valorOriginal,
              acertos: r.acertos,
              itensPossiveis: r.itensPossiveis,
              percentual:
                percentual === null ? null : new Prisma.Decimal(percentual.toFixed(4)),
            })
          }

          if (skillRows.length > 0) {
            await tx.studentSkillResult.createMany({ data: skillRows })
          }
          persistidos++
        }

        // --- denominadores de referência (FR-161) ----------------------------
        await recalcularDenominadoresDeReferencia(tx, registro.assessmentId)

        await tx.importRow.updateMany({
          where: { importId },
          data: { resolutionKind: ResolutionKind.CODE },
        })

        await tx.import.update({
          where: { id: importId },
          data: { status: ImportStatus.COMPLETED, confirmedAt: new Date() },
        })

        await registrarAuditoria(tx, {
          action: 'IMPORT_CONFIRM',
          userId: ctx.userId,
          entityType: 'Import',
          entityId: importId,
          schoolId: registro.schoolId,
          assessmentId: registro.assessmentId,
          metadata: {
            fileHash: registro.fileHash,
            persistidos,
            estudantesCriados,
            turmasCriadas,
          },
        })

        return { importId, persistidos, estudantesCriados, turmasCriadas }
      },
      { timeout: 120_000, maxWait: 15_000 },
    )

    logger.info('importação confirmada', {
      importId,
      persistidos: resultado.persistidos,
    })
    return resultado
  } catch (erro) {
    await prisma.import.update({
      where: { id: importId },
      data: {
        status: ImportStatus.FAILED,
        failedAt: new Date(),
        failureReason: erro instanceof Error ? erro.message : 'Falha desconhecida',
      },
    })
    logger.error('falha na confirmação da importação', { importId })
    throw erro
  }
}

/**
 * Cria o estudante com código único. Em colisão de unicidade tenta de novo —
 * o espaço é grande, mas quem garante a unicidade é a restrição do banco, não
 * a aleatoriedade.
 */
async function criarEstudanteComCodigo(
  tx: Tx,
  dados: {
    schoolId: string
    classId: string
    nomeOriginal: string
    nomeNormalizado: string
  },
): Promise<{ id: string; uniqueCode: string }> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const uniqueCode = gerarCodigoUnico()
    try {
      return await tx.student.create({
        data: { ...dados, uniqueCode },
        select: { id: true, uniqueCode: true },
      })
    } catch (erro) {
      const colisao =
        erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
      if (!colisao) throw erro
    }
  }
  throw new Error('Não foi possível gerar um código único após 5 tentativas.')
}

type Tx = Prisma.TransactionClient
