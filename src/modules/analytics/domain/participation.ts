/**
 * Contagens de participação. Não é taxa: a divisão é da borda de apresentação, pela mesma
 * razão das demais funções do núcleo (R-001).
 */
export type ParticipationCounts = Readonly<{
  total: number
  avaliados: number
  naoAvaliados: number
}>

/**
 * Participação (FR-061).
 *
 * O denominador é **todo registro importado**, inclusive os não avaliados (FR-060) — esta
 * é a única métrica do sistema em que eles entram, e a contrapartida exata da regra que os
 * mantém fora de todo denominador de desempenho (Const. V).
 */
export function calculateParticipationRate(
  entries: readonly { avaliado: boolean }[],
): ParticipationCounts {
  let avaliados = 0

  for (const entry of entries) {
    if (entry.avaliado) avaliados += 1
  }

  const total = entries.length

  return { total, avaliados, naoAvaliados: total - avaliados }
}
