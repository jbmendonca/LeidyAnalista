import { ImportStatus, ResolutionKind, type Prisma } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { lerArquivoGuardado } from '@/modules/imports/infra/file-storage'
import { lerArquivo } from '@/modules/imports/infra/table-reader'
import { proporMapeamento } from '@/modules/imports/infra/header-mapping'
import {
  detectarColisoesNoArquivo,
  validarLinha,
  type LinhaBruta,
  type LinhaInterpretada,
} from '@/modules/imports/domain/row-validation'
import { validateSkillDenominators } from '@/modules/imports/domain/validate-denominators'
import {
  contarPorSeveridade,
  criarInconsistencia,
  type Inconsistencia,
} from '@/modules/imports/domain/severity'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import { normalizeClassCode } from '@/modules/classes/domain/normalize-class-code'
import { normalizarCodigoUnico } from '@/modules/students/domain/unique-code'
import { conflito } from '@/server/http-errors'
import { logger } from '@/server/logger'

/**
 * Passos 4 a 9 do pipeline: mapeia, interpreta, valida e grava no ESTÁGIO.
 *
 * REGRA CENTRAL: nada aqui escreve em `AssessmentStudentResult` nem em
 * `StudentSkillResult`. O que se grava é `ImportRow` — o que o sistema
 * entendeu do arquivo —, e ele é descartável. Nenhum resultado de avaliação
 * existe antes da confirmação explícita do usuário (FR-051).
 *
 * O estágio também garante que **o conjunto exibido na pré-visualização é
 * exatamente o conjunto gravado**: a confirmação promove o que está aqui, sem
 * reprocessar o arquivo (R-007).
 */

export type ResultadoValidacao = Readonly<{
  importId: string
  totalRows: number
  evaluatedRows: number
  notEvaluatedRows: number
  classCount: number
  skillCount: number
  errorCount: number
  warningCount: number
  bloqueada: boolean
}>

export async function runValidation(importId: string): Promise<ResultadoValidacao> {
  const registro = await prisma.import.findUniqueOrThrow({
    where: { id: importId },
    select: {
      id: true,
      assessmentId: true,
      schoolId: true,
      fileName: true,
      fileHash: true,
      storagePath: true,
      status: true,
    },
  })

  if (registro.status === ImportStatus.COMPLETED) {
    throw conflito('Esta importação já foi confirmada.')
  }
  if (!registro.storagePath) {
    throw conflito('O arquivo desta importação já foi expurgado e não pode ser revalidado.')
  }

  await prisma.import.update({
    where: { id: importId },
    data: { status: ImportStatus.VALIDATING },
  })

  // Estágio anterior é descartado: revalidar é recomeçar, não acumular.
  await prisma.importRow.deleteMany({ where: { importId } })
  await prisma.importIssue.deleteMany({ where: { importId } })

  const inconsistencias: Inconsistencia[] = []

  const buffer = await lerArquivoGuardado(registro.storagePath)
  const tabela = lerArquivo(buffer, registro.fileName)
  const mapa = proporMapeamento(tabela.cabecalhos)

  // Habilidades do arquivo que não estão no catálogo — WARNING (FR-041).
  const catalogo = await prisma.skill.findMany({ select: { id: true, shortCode: true } })
  const porShortCode = new Map(catalogo.map((s) => [s.shortCode, s.id]))

  const shortCodesDoArquivo = Object.keys(mapa.habilidades)
  for (const shortCode of shortCodesDoArquivo) {
    if (!porShortCode.has(shortCode)) {
      inconsistencias.push(
        criarInconsistencia('SKILL_NOT_IN_CATALOG', {
          column: shortCode,
          detalhe: 'Os resultados desta coluna não serão importados.',
        }),
      )
    }
  }
  if (shortCodesDoArquivo.length === 0) {
    inconsistencias.push(
      criarInconsistencia('SKILL_COLUMN_MISSING', {
        detalhe: 'Nenhuma coluna de habilidade foi reconhecida no arquivo.',
      }),
    )
  }

  const conhecidas = shortCodesDoArquivo.filter((c) => porShortCode.has(c))

  // --- interpreta cada linha -------------------------------------------------
  const campo = (linha: readonly string[], nome: string): string => {
    const indice = mapa.campos[nome]
    return indice === undefined ? '' : (linha[indice] ?? '')
  }

  const linhas: LinhaInterpretada[] = []

  tabela.linhas.forEach((linha, i) => {
    const habilidades: Record<string, string> = {}
    for (const shortCode of conhecidas) {
      const indice = mapa.habilidades[shortCode]
      habilidades[shortCode] = indice === undefined ? '' : (linha[indice] ?? '')
    }

    const codigoBruto = campo(linha, 'codigoUnico')

    const bruta: LinhaBruta = {
      rowNumber: i + 2, // +1 do cabeçalho, +1 pela contagem base 1
      rede: campo(linha, 'rede'),
      anoEscolar: campo(linha, 'anoEscolar'),
      componenteCurricular: campo(linha, 'componenteCurricular'),
      estado: campo(linha, 'estado'),
      municipio: campo(linha, 'municipio'),
      codigoTurma: campo(linha, 'codigoTurma'),
      turma: campo(linha, 'turma'),
      estudante: campo(linha, 'estudante'),
      avaliado: campo(linha, 'avaliado'),
      nivelAprendizagem: campo(linha, 'nivelAprendizagem'),
      ...(codigoBruto.trim()
        ? { codigoUnico: normalizarCodigoUnico(codigoBruto) }
        : {}),
      habilidades,
    }

    const { linha: interpretada, inconsistencias: doLinha } = validarLinha(
      bruta,
      normalizeStudentName,
      normalizeClassCode,
    )
    linhas.push(interpretada)
    inconsistencias.push(...doLinha)
  })

  // --- colisões dentro do arquivo (FR-147, FR-151, FR-152) -------------------
  inconsistencias.push(...detectarColisoesNoArquivo(linhas))

  // --- colisões contra a avaliação (FR-148) ---------------------------------
  inconsistencias.push(...(await detectarColisoesNaAvaliacao(registro.assessmentId, linhas)))

  // --- denominadores divergentes (FR-046) -----------------------------------
  const entradasDenominador = linhas.flatMap((l) =>
    Object.entries(l.habilidades)
      .filter(([, r]) => r.itensPossiveis !== null)
      .map(([shortCode, r]) => ({
        rowNumber: l.rowNumber,
        skillId: shortCode,
        itens: r.itensPossiveis as number,
      })),
  )
  const relatorio = validateSkillDenominators(entradasDenominador)
  for (const [shortCode, apurado] of relatorio.bySkill) {
    for (const divergente of apurado.divergentRows) {
      inconsistencias.push(
        criarInconsistencia('DENOMINATOR_DIVERGENT', {
          rowNumber: divergente.rowNumber,
          column: shortCode,
          originalValue: String(divergente.found),
          detalhe: `Predominante nesta avaliação: ${apurado.referenceItems} itens.`,
        }),
      )
    }
    if (apurado.tiebreak) {
      inconsistencias.push(
        criarInconsistencia('DENOMINATOR_DIVERGENT', {
          column: shortCode,
          detalhe: `Empate na apuração; adotado o maior denominador (${apurado.referenceItems}).`,
        }),
      )
    }
  }

  // --- arquivo já importado (R-006) -----------------------------------------
  const jaImportado = await prisma.import.findFirst({
    where: {
      id: { not: importId },
      assessmentId: registro.assessmentId,
      schoolId: registro.schoolId,
      fileHash: registro.fileHash,
      status: ImportStatus.COMPLETED,
    },
    select: { id: true, createdAt: true },
  })
  if (jaImportado) {
    inconsistencias.push(
      criarInconsistencia('FILE_ALREADY_IMPORTED', {
        detalhe: `Importação anterior em ${jaImportado.createdAt.toLocaleDateString('pt-BR')}.`,
      }),
    )
  }

  // --- grava estágio e inconsistências --------------------------------------
  const linhasBloqueadas = new Set(
    inconsistencias.filter((i) => i.severity === 'ERROR' && i.rowNumber).map((i) => i.rowNumber),
  )

  const dadosEstagio: Prisma.ImportRowCreateManyInput[] = linhas.map((l) => ({
    importId,
    rowNumber: l.rowNumber,
    rawData: l as unknown as Prisma.InputJsonValue,
    parsedData: {
      codigoTurmaNormalizado: l.codigoTurmaNormalizado,
      nomeOriginal: l.nomeOriginal,
      nomeNormalizado: l.nomeNormalizado,
      avaliado: l.avaliado,
      nivelOriginal: l.nivelOriginal,
      nivelNormalizado: l.nivelNormalizado,
      codigoUnico: l.codigoUnico,
      habilidades: l.habilidades,
      turma: l.turma,
      anoEscolar: l.anoEscolar,
    } as unknown as Prisma.InputJsonValue,
    resolutionKind: ResolutionKind.UNRESOLVED,
    blocked: linhasBloqueadas.has(l.rowNumber),
  }))

  await prisma.importRow.createMany({ data: dadosEstagio })
  await prisma.importIssue.createMany({
    data: inconsistencias.map((i) => ({
      importId,
      code: i.code,
      severity: i.severity,
      message: i.message,
      ...(i.rowNumber !== undefined ? { rowNumber: i.rowNumber } : {}),
      ...(i.column !== undefined ? { column: i.column } : {}),
      ...(i.originalValue !== undefined ? { originalValue: i.originalValue } : {}),
    })),
  })

  const { errors, warnings } = contarPorSeveridade(inconsistencias)
  const avaliados = linhas.filter((l) => l.avaliado).length
  const turmas = new Set(linhas.map((l) => l.codigoTurmaNormalizado).filter(Boolean)).size

  const resultado: ResultadoValidacao = {
    importId,
    totalRows: linhas.length,
    evaluatedRows: avaliados,
    notEvaluatedRows: linhas.length - avaliados,
    classCount: turmas,
    skillCount: conhecidas.length,
    errorCount: errors,
    warningCount: warnings,
    bloqueada: errors > 0,
  }

  await prisma.import.update({
    where: { id: importId },
    data: {
      status: ImportStatus.READY,
      totalRows: resultado.totalRows,
      evaluatedRows: resultado.evaluatedRows,
      notEvaluatedRows: resultado.notEvaluatedRows,
      classCount: resultado.classCount,
      skillCount: resultado.skillCount,
      errorCount: resultado.errorCount,
      warningCount: resultado.warningCount,
    },
  })

  logger.info('validação de importação concluída', {
    importId,
    totalRows: resultado.totalRows,
    errorCount: errors,
    warningCount: warnings,
  })

  return resultado
}

/**
 * Chave já existente na avaliação — FR-148.
 *
 * Bloqueante: um segundo resultado para o mesmo estudante na mesma avaliação
 * dupla-contaria a criança. Substituir uma carga exige excluir a anterior
 * (FR-153).
 */
async function detectarColisoesNaAvaliacao(
  assessmentId: string,
  linhas: readonly LinhaInterpretada[],
): Promise<Inconsistencia[]> {
  const existentes = await prisma.assessmentStudentResult.findMany({
    where: { assessmentId },
    select: {
      student: { select: { nomeNormalizado: true } },
      class: { select: { externalCode: true } },
    },
  })

  if (existentes.length === 0) return []

  const chaves = new Set(
    existentes.map((e) => `${e.class.externalCode} ${e.student.nomeNormalizado}`),
  )

  const saida: Inconsistencia[] = []
  for (const l of linhas) {
    if (!l.nomeNormalizado || !l.codigoTurmaNormalizado) continue
    if (chaves.has(`${l.codigoTurmaNormalizado} ${l.nomeNormalizado}`)) {
      saida.push(
        criarInconsistencia('DUPLICATE_KEY_IN_ASSESSMENT', {
          rowNumber: l.rowNumber,
          column: 'Estudante',
          originalValue: l.nomeOriginal,
        }),
      )
    }
  }
  return saida
}
