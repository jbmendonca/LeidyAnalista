import type { ParseOutcome } from './types'

/**
 * Interpreta o valor bruto de uma célula de habilidade no formato `acertos / itens`.
 *
 * Contrato: specs/001-painel-analise-leitura/contracts/domain-functions.md#parseskillresult
 *
 * Função pura: sem I/O, sem estado, sem relógio.
 */

/** Apenas dígitos. Sinal, ponto, vírgula e expoente ficam de fora por construção. */
const ONLY_DIGITS = /^\d+$/

const SEPARATOR = '/'

/** Ausência: os três campos `null` juntos. Jamais zero (Const. I, FR-031). */
const ABSENT: ParseOutcome = {
  ok: true,
  value: { valorOriginal: null, acertos: null, itensPossiveis: null },
}

function invalid(originalValue: string): ParseOutcome {
  return { ok: false, code: 'SKILL_VALUE_INVALID', originalValue }
}

function overMax(originalValue: string): ParseOutcome {
  return { ok: false, code: 'SKILL_VALUE_OVER_MAX', originalValue }
}

/**
 * Aceita `"1 / 1"`, `"1/1"`, `" 1 / 2 "`, `"1 /2"`. Trata `""`, `"   "`, `null` e `undefined`
 * como ausência. Rejeita qualquer outra forma.
 *
 * Invariante de aceitação (FR-032): `acertos >= 0 && itensPossiveis > 0 && acertos <= itensPossiveis`.
 *
 * `valorOriginal` devolve a string exatamente como recebida (FR-030), não a forma normalizada.
 */
export function parseSkillResult(raw: string | null | undefined): ParseOutcome {
  if (raw === null || raw === undefined) return ABSENT

  const trimmed = raw.trim()
  if (trimmed === '') return ABSENT

  // Exatamente um separador. `indexOf`/`slice` são totais — nada de acesso indexado opcional.
  const separator = trimmed.indexOf(SEPARATOR)
  if (separator === -1 || trimmed.lastIndexOf(SEPARATOR) !== separator) {
    return invalid(raw)
  }

  const acertosRaw = trimmed.slice(0, separator).trim()
  const itensRaw = trimmed.slice(separator + 1).trim()
  if (!ONLY_DIGITS.test(acertosRaw) || !ONLY_DIGITS.test(itensRaw)) return invalid(raw)

  const acertos = Number.parseInt(acertosRaw, 10)
  const itens = Number.parseInt(itensRaw, 10)

  // Const. II — o inteiro é a fonte de verdade; um valor fora do alcance exato não é inteiro.
  if (!Number.isSafeInteger(acertos) || !Number.isSafeInteger(itens)) return invalid(raw)

  if (itens <= 0) return invalid(raw)
  if (acertos > itens) return overMax(raw)

  return { ok: true, value: { valorOriginal: raw, acertos, itensPossiveis: itens } }
}
