/**
 * Deriva a forma normalizada do nome, usada em busca, detecção de duplicidade e sugestão de
 * vinculação assistida (FR-034, FR-141).
 *
 * Contrato: specs/001-painel-analise-leitura/contracts/domain-functions.md#normalizestudentname
 *
 * O nome original nunca é alterado: esta função produz um campo adicional, jamais um substituto,
 * e a forma normalizada não é exibida em nenhuma tela.
 *
 * Função pura: sem I/O, sem estado, sem relógio.
 */

const INNER_WHITESPACE = /\s+/g

/** Marcas de combinação produzidas pela decomposição `NFD`. */
const DIACRITICS = /\p{Diacritic}/gu

/**
 * Transformações nesta ordem: remoção de espaços das extremidades → colapso de espaços internos
 * múltiplos em um → maiúsculas → decomposição `NFD` e remoção de diacríticos.
 *
 * `"  José   da Silva  "` → `"JOSE DA SILVA"`.
 */
export function normalizeStudentName(name: string): string {
  return name
    .trim()
    .replace(INNER_WHITESPACE, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
}
