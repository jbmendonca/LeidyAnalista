import { prisma } from '@/server/prisma'
import { naoEncontrado } from '@/server/http-errors'
import { assertSchoolInScope, type AuthContext } from '@/server/authorization'
import { podeVerNomes } from '@/server/nominal-data'
import { NOME_SUPRIMIDO } from '@/server/nominal-data'

/**
 * Pré-visualização — FR-049, FR-050.
 *
 * Lê EXCLUSIVAMENTE do estágio (`ImportRow` e `ImportIssue`). Nenhuma consulta
 * daqui toca resultado de avaliação, porque nenhum existe ainda.
 *
 * A amostra mostra o valor original ao lado do interpretado: é o que permite
 * ao usuário conferir que o sistema entendeu o arquivo como ele esperava,
 * antes de qualquer gravação.
 */

export type ResumoPreVisualizacao = Readonly<{
  importId: string
  arquivo: string
  escola: string
  avaliacao: string
  registrosEncontrados: number
  registrosAvaliados: number
  registrosNaoAvaliados: number
  turmasIdentificadas: number
  habilidadesIdentificadas: number
  inconsistenciasCriticas: number
  alertas: number
  podeConfirmar: boolean
}>

export type LinhaAmostra = Readonly<{
  rowNumber: number
  estudante: string
  codigoTurma: string
  avaliado: boolean
  nivelOriginal: string
  habilidades: readonly {
    shortCode: string
    valorOriginal: string | null
    interpretado: string
  }[]
  bloqueada: boolean
}>

export async function getPreview(
  ctx: AuthContext,
  importId: string,
  opcoes: { amostra?: number; pagina?: number } = {},
): Promise<{
  resumo: ResumoPreVisualizacao
  amostra: readonly LinhaAmostra[]
  inconsistenciasPorTipo: readonly {
    code: string
    severity: string
    message: string
    quantidade: number
  }[]
}> {
  const registro = await prisma.import.findUnique({
    where: { id: importId },
    select: {
      id: true,
      fileName: true,
      schoolId: true,
      totalRows: true,
      evaluatedRows: true,
      notEvaluatedRows: true,
      classCount: true,
      skillCount: true,
      errorCount: true,
      warningCount: true,
      school: { select: { name: true } },
      assessment: { select: { nome: true } },
    },
  })
  if (!registro) throw naoEncontrado('Importação')
  assertSchoolInScope(ctx, registro.schoolId)

  const tamanho = opcoes.amostra ?? 20
  const pagina = opcoes.pagina ?? 0

  const linhas = await prisma.importRow.findMany({
    where: { importId },
    orderBy: { rowNumber: 'asc' },
    skip: pagina * tamanho,
    take: tamanho,
  })

  const mostrarNomes = podeVerNomes(ctx)

  const amostra: LinhaAmostra[] = linhas.map((r) => {
    const d = r.parsedData as unknown as {
      nomeOriginal: string
      codigoTurmaNormalizado: string
      avaliado: boolean
      nivelOriginal: string
      habilidades: Record<
        string,
        { valorOriginal: string | null; acertos: number | null; itensPossiveis: number | null }
      >
    }

    return {
      rowNumber: r.rowNumber,
      estudante: mostrarNomes ? d.nomeOriginal : NOME_SUPRIMIDO,
      codigoTurma: d.codigoTurmaNormalizado,
      avaliado: d.avaliado,
      nivelOriginal: d.nivelOriginal,
      habilidades: Object.entries(d.habilidades)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([shortCode, v]) => ({
          shortCode,
          valorOriginal: v.valorOriginal,
          // Ausência aparece como travessão — nunca como 0 (Const. I).
          interpretado:
            v.acertos === null || v.itensPossiveis === null
              ? '—'
              : `${v.acertos} de ${v.itensPossiveis}`,
        })),
      bloqueada: r.blocked,
    }
  })

  const agrupadas = await prisma.importIssue.groupBy({
    by: ['code', 'severity', 'message'],
    where: { importId },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  })

  return {
    resumo: {
      importId: registro.id,
      arquivo: registro.fileName,
      escola: registro.school.name,
      avaliacao: registro.assessment.nome,
      registrosEncontrados: registro.totalRows,
      registrosAvaliados: registro.evaluatedRows,
      registrosNaoAvaliados: registro.notEvaluatedRows,
      turmasIdentificadas: registro.classCount,
      habilidadesIdentificadas: registro.skillCount,
      inconsistenciasCriticas: registro.errorCount,
      alertas: registro.warningCount,
      podeConfirmar: registro.errorCount === 0,
    },
    amostra,
    inconsistenciasPorTipo: agrupadas.map((g) => ({
      code: g.code,
      severity: g.severity,
      message: g.message,
      quantidade: g._count._all,
    })),
  }
}
