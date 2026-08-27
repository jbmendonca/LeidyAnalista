import Decimal from 'decimal.js'

import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * Faixa **analítica** do sistema.
 *
 * Deliberadamente sem qualquer relação com `LearningLevel` (Adequado / Intermediário /
 * Defasagem), que é a classificação oficial da fonte: nomes distintos, valores distintos,
 * origem distinta. Nenhuma função de domínio produz, altera ou infere o nível oficial
 * (Const. III, FR-112).
 */
export type AnalyticalBand = 'FRAGILIDADE' | 'ATENCAO' | 'SATISFATORIO'

/**
 * Limites das faixas analíticas, ambos exclusivos no limite superior.
 *
 * Vêm sempre de `AnalyticalSettings` e **nunca** de constante no código (FR-111) — por
 * isso são parâmetro obrigatório desta função.
 */
export type AnalyticalBands = Readonly<{
  /** Limite superior exclusivo de FRAGILIDADE, em pontos percentuais. Ex.: 60. */
  fragilidadeMax: Decimal
  /** Limite superior exclusivo de ATENCAO, em pontos percentuais. Ex.: 80. */
  atencaoMax: Decimal
}>

/**
 * Classificação analítica de um resultado de habilidade (FR-109).
 *
 * | Condição                                    | Retorno       |
 * |---------------------------------------------|---------------|
 * | `percentual < fragilidadeMax`               | FRAGILIDADE   |
 * | `fragilidadeMax <= percentual < atencaoMax` | ATENCAO       |
 * | `percentual >= atencaoMax`                  | SATISFATORIO  |
 * | `result === null`                           | `null`        |
 *
 * A comparação é exata e sem arredondamento algum: em vez de dividir `acertos / itens`
 * — divisão que decimal.js resolveria com precisão finita — multiplicam-se os dois lados
 * da desigualdade por `itens`, que é positivo por invariante de `Fraction`. Assim
 * `acertos × 100 < limite × itens` é aritmética exata, equivalente termo a termo à
 * comparação de percentuais. Um resultado de `3 / 5` (60% exato) é ATENCAO com
 * `fragilidadeMax = 60`, e a fronteira não depende de como o número seria exibido.
 */
export function classifyAnalyticalSkillResult(
  result: MaybeFraction,
  bands: AnalyticalBands,
): AnalyticalBand | null {
  if (result === null) return null

  const acertosEmEscala = new Decimal(result.acertos).times(100)

  if (acertosEmEscala.lessThan(bands.fragilidadeMax.times(result.itens))) {
    return 'FRAGILIDADE'
  }

  if (acertosEmEscala.lessThan(bands.atencaoMax.times(result.itens))) {
    return 'ATENCAO'
  }

  return 'SATISFATORIO'
}
