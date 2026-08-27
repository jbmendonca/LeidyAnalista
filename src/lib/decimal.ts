import Decimal from 'decimal.js'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * Borda de conversão e formatação numérica do sistema.
 *
 * Contrato:
 * specs/001-painel-analise-leitura/contracts/domain-functions.md#funções-auxiliares-de-borda
 *
 * Const. II — o inteiro é a fonte de verdade; nenhum percentual trafega como `number`.
 * Const. I — ausência nunca se apresenta como `0%`; sai como travessão.
 *
 * A configuração global de `Decimal` não é alterada em lugar nenhum: mexer nela seria efeito
 * colateral sobre todo o processo.
 */

/** Travessão exibido no lugar de todo dado ausente (FR-031, FR-093). */
export const ABSENCE_PLACEHOLDER = '—'

const HUNDRED = new Decimal(100)

/**
 * Única conversão fração → percentual do sistema. **Sem arredondamento**: o valor devolvido
 * carrega toda a precisão de `Decimal`, e quem arredonda é `formatPercent`.
 *
 * Devolve `null` para ausência de resultado e para denominador não positivo — jamais zero.
 */
export function toPercent(f: MaybeFraction): Decimal | null {
  if (f === null) return null
  if (f.itens <= 0) return null
  return new Decimal(f.acertos).times(HUNDRED).dividedBy(f.itens)
}

/**
 * Única formatação de percentual para exibição. Arredonda aqui e só aqui (FR-063), com
 * `ROUND_HALF_UP` explícito — o modo não fica a cargo da implementação de ICU.
 *
 * `formatPercent(new Decimal('66.666...'))` → `"66,67%"`; ausência → `"—"`.
 */
export function formatPercent(
  value: Decimal | null | undefined,
  fractionDigits = 2,
): string {
  if (value === null || value === undefined) return ABSENCE_PLACEHOLDER

  const rounded = value.toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP)
  const formatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  // `toFixed` de Decimal produz sempre notação posicional — nunca exponencial, nunca `number`.
  const literal = rounded.toFixed(fractionDigits) as Intl.StringNumericLiteral
  return `${formatter.format(literal)}%`
}

/** Formata uma contagem inteira em pt-BR. Ausência sai como travessão, nunca como `0`. */
export function formatInteger(value: number | null): string {
  if (value === null) return ABSENCE_PLACEHOLDER
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
}
