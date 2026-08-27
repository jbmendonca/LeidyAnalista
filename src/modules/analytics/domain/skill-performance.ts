import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * Entrada de um estudante para uma habilidade num recorte.
 *
 * `avaliado` é explícito de propósito: torna impossível chamar
 * {@link calculateSkillPerformance} sem decidir o que fazer com os não avaliados.
 */
export type SkillPerformanceEntry = Readonly<{
  avaliado: boolean
  result: MaybeFraction
}>

/**
 * Desempenho consolidado de uma habilidade num recorte (FR-057).
 *
 * - Considera **exclusivamente** entradas com `avaliado === true` (FR-059). Estudante não
 *   avaliado não entra no numerador nem no denominador (Const. V).
 * - Ignora resultados `null` dentro dos avaliados — ausência não é zero (Const. I).
 * - Denominadores divergentes entre estudantes somam normalmente: `Σ itens` absorve a
 *   variação sem tratamento especial (FR-157).
 * - Retorna `null` quando não há nenhum item possível no recorte — nunca zero (FR-065).
 *
 * O resultado é a fração `Σ acertos / Σ itens`, nunca a média simples dos percentuais
 * (Const. II) e nunca o percentual já dividido (R-001).
 */
export function calculateSkillPerformance(
  entries: readonly SkillPerformanceEntry[],
): MaybeFraction {
  let acertos = 0
  let itens = 0

  for (const entry of entries) {
    if (!entry.avaliado) continue

    const result = entry.result
    if (result === null) continue

    acertos += result.acertos
    itens += result.itens
  }

  if (itens === 0) return null

  return { acertos, itens }
}
