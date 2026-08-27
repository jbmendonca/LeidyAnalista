import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * Desempenho geral do estudante (FR-056).
 *
 * Soma acertos e itens **apenas** das habilidades com resultado. Entradas `null` são
 * ignoradas — jamais contadas como zero (Const. I).
 *
 * Retorna a fração, nunca o percentual: a divisão pertence à borda de apresentação
 * (R-001). Nunca calcula média de percentuais (FR-058, Const. II).
 *
 * Retorna `null` quando não há nenhum item possível — nunca `{ acertos: 0, itens: 0 }`,
 * que confundiria ausência com desempenho zero.
 */
export function calculateStudentPerformance(
  results: readonly MaybeFraction[],
): MaybeFraction {
  let acertos = 0
  let itens = 0

  for (const result of results) {
    if (result === null) continue
    acertos += result.acertos
    itens += result.itens
  }

  if (itens === 0) return null

  return { acertos, itens }
}
