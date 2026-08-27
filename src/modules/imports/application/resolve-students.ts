import { ResolutionKind } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { criarInconsistencia, type Inconsistencia } from '@/modules/imports/domain/severity'

/**
 * Reconciliação com a base cadastral — FR-171 a FR-176.
 *
 * Ordem, e ela importa:
 *   1. código único presente no arquivo  -> vínculo direto, sem intervenção (FR-138)
 *   2. candidato único na turma          -> PROPOSTO, aguarda confirmação humana (FR-141)
 *   3. nada disso                        -> não cadastrado (FR-172)
 *
 * **O sistema nunca vincula sozinho por nome** (FR-142). Um candidato único
 * vira proposta, não vínculo: o usuário confirma na pré-visualização — em
 * bloco quando os vínculos são inequívocos, um a um quando há homônimo na
 * turma (FR-176). Confirmar em bloco continua sendo decisão humana; o que a
 * regra proíbe é o sistema decidir por conta própria.
 */

export type PropostaVinculo = Readonly<{
  rowNumber: number
  nomeOriginal: string
  codigoTurma: string
  studentId: string | null
  uniqueCode: string | null
  kind: ResolutionKind
  /** Mais de um cadastrado com o mesmo nome na turma: exige decisão individual. */
  ambiguo: boolean
  candidatos: readonly { studentId: string; uniqueCode: string; nomeOriginal: string }[]
}>

export type ResultadoReconciliacao = Readonly<{
  propostas: readonly PropostaVinculo[]
  inconsistencias: readonly Inconsistencia[]
  ausentesNoArquivo: readonly { studentId: string; uniqueCode: string; nomeOriginal: string }[]
}>

type LinhaParaVincular = Readonly<{
  rowNumber: number
  codigoTurmaNormalizado: string
  nomeOriginal: string
  nomeNormalizado: string
  codigoUnico: string | null
}>

export async function reconciliarEstudantes(
  schoolId: string,
  linhas: readonly LinhaParaVincular[],
): Promise<ResultadoReconciliacao> {
  const inconsistencias: Inconsistencia[] = []
  const propostas: PropostaVinculo[] = []

  const codigosDoArquivo = linhas
    .map((l) => l.codigoUnico)
    .filter((c): c is string => c !== null)

  const porCodigo = new Map(
    (
      await prisma.student.findMany({
        where: { uniqueCode: { in: codigosDoArquivo } },
        select: {
          id: true,
          uniqueCode: true,
          schoolId: true,
          nomeOriginal: true,
        },
      })
    ).map((e) => [e.uniqueCode, e]),
  )

  const turmasDoArquivo = [
    ...new Set(linhas.map((l) => l.codigoTurmaNormalizado).filter(Boolean)),
  ]

  const cadastrados = await prisma.student.findMany({
    where: {
      schoolId,
      active: true,
      class: { externalCode: { in: turmasDoArquivo } },
    },
    select: {
      id: true,
      uniqueCode: true,
      nomeOriginal: true,
      nomeNormalizado: true,
      class: { select: { externalCode: true } },
    },
  })

  // Índice turma+nome -> candidatos. Vários candidatos significam homônimos
  // cadastrados, o que torna o vínculo por nome impossível (FR-176).
  const porTurmaNome = new Map<string, typeof cadastrados>()
  for (const c of cadastrados) {
    const chave = `${c.class.externalCode} ${c.nomeNormalizado}`
    porTurmaNome.set(chave, [...(porTurmaNome.get(chave) ?? []), c])
  }

  const usados = new Set<string>()

  for (const l of linhas) {
    // --- 1. por código único ------------------------------------------------
    if (l.codigoUnico) {
      const achado = porCodigo.get(l.codigoUnico)

      if (!achado) {
        // Criar estudante novo aqui faria a falha de vínculo passar
        // despercebida. Bloqueia (FR-139).
        inconsistencias.push(
          criarInconsistencia('UNKNOWN_UNIQUE_CODE', {
            rowNumber: l.rowNumber,
            column: 'Código único',
            originalValue: l.codigoUnico,
          }),
        )
        propostas.push(proposta(l, null, null, ResolutionKind.UNRESOLVED, false, []))
        continue
      }

      if (achado.schoolId !== schoolId) {
        // Transferência real ou código trocado: exige confirmação (FR-140).
        inconsistencias.push(
          criarInconsistencia('CODE_FROM_OTHER_SCHOOL', {
            rowNumber: l.rowNumber,
            column: 'Código único',
            originalValue: l.codigoUnico,
          }),
        )
      }

      usados.add(achado.id)
      propostas.push(
        proposta(l, achado.id, achado.uniqueCode, ResolutionKind.CODE, false, []),
      )
      continue
    }

    // --- 2. candidato na turma ----------------------------------------------
    const candidatos = porTurmaNome.get(`${l.codigoTurmaNormalizado} ${l.nomeNormalizado}`) ?? []

    if (candidatos.length === 1) {
      const c = candidatos[0]!
      usados.add(c.id)
      propostas.push(
        proposta(l, c.id, c.uniqueCode, ResolutionKind.ASSISTED, false, [
          { studentId: c.id, uniqueCode: c.uniqueCode, nomeOriginal: c.nomeOriginal },
        ]),
      )
      continue
    }

    if (candidatos.length > 1) {
      inconsistencias.push(
        criarInconsistencia('STUDENT_NOT_REGISTERED', {
          rowNumber: l.rowNumber,
          column: 'Estudante',
          originalValue: l.nomeOriginal,
          detalhe:
            'Há homônimos cadastrados nesta turma. Informe o código único no arquivo ou confirme o vínculo individualmente.',
        }),
      )
      propostas.push(
        proposta(
          l,
          null,
          null,
          ResolutionKind.UNRESOLVED,
          true,
          candidatos.map((c) => ({
            studentId: c.id,
            uniqueCode: c.uniqueCode,
            nomeOriginal: c.nomeOriginal,
          })),
        ),
      )
      continue
    }

    // --- 3. não cadastrado --------------------------------------------------
    inconsistencias.push(
      criarInconsistencia('STUDENT_NOT_REGISTERED', {
        rowNumber: l.rowNumber,
        column: 'Estudante',
        originalValue: l.nomeOriginal,
        detalhe: 'Cadastre o estudante na pré-visualização ou corrija o arquivo.',
      }),
    )
    propostas.push(proposta(l, null, null, ResolutionKind.NEW, false, []))
  }

  // --- cadastrados ausentes do arquivo (FR-173) -----------------------------
  const ausentesNoArquivo = cadastrados
    .filter((c) => !usados.has(c.id))
    .map((c) => ({
      studentId: c.id,
      uniqueCode: c.uniqueCode,
      nomeOriginal: c.nomeOriginal,
    }))

  for (const ausente of ausentesNoArquivo) {
    inconsistencias.push(
      criarInconsistencia('REGISTERED_STUDENT_ABSENT', {
        column: 'Estudante',
        originalValue: ausente.uniqueCode,
        detalhe: 'Cadastrado na turma e sem linha no arquivo.',
      }),
    )
  }

  return { propostas, inconsistencias, ausentesNoArquivo }
}

function proposta(
  l: LinhaParaVincular,
  studentId: string | null,
  uniqueCode: string | null,
  kind: ResolutionKind,
  ambiguo: boolean,
  candidatos: readonly { studentId: string; uniqueCode: string; nomeOriginal: string }[],
): PropostaVinculo {
  return {
    rowNumber: l.rowNumber,
    nomeOriginal: l.nomeOriginal,
    codigoTurma: l.codigoTurmaNormalizado,
    studentId,
    uniqueCode,
    kind,
    ambiguo,
    candidatos,
  }
}
