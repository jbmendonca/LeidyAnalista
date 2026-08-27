/**
 * Código único do estudante — FR-128 a FR-131.
 *
 * Três propriedades importam:
 *
 *  1. **Não derivado de dado pessoal.** É aleatório. Um código derivado do
 *     nome revelaria o nome a quem visse o código, e o código aparece em
 *     exportações e em log, onde nome não pode aparecer (FR-131, FR-009).
 *  2. **Transcritível à mão.** A rede vai copiar esses códigos para a planilha
 *     da avaliação seguinte. O alfabeto exclui os pares que se confundem na
 *     escrita: 0/O, 1/I/L, 2/Z, 5/S, 8/B.
 *  3. **Permanente.** Uma vez atribuído, não muda, não é reutilizado e não é
 *     regenerado a cada importação (FR-129). Esta função só é chamada na
 *     criação do cadastro.
 */

/** 26 símbolos, sem pares visualmente ambíguos. */
const ALFABETO = '34679ACDEFGHJKMNPQRTUVWXY'

const COMPRIMENTO = 10
const GRUPO = 5

/**
 * Espaço de 25^10 ≈ 9,5 × 10^13 combinações. Para uma rede com 10^5
 * estudantes, a probabilidade de colisão fica na casa de 10^-4 — e mesmo assim
 * a unicidade é garantida pela restrição do banco, não pela aleatoriedade.
 */
export function gerarCodigoUnico(
  aleatorio: (n: number) => Uint8Array = bytesSeguros,
): string {
  const bytes = aleatorio(COMPRIMENTO)
  let saida = ''

  for (let i = 0; i < COMPRIMENTO; i++) {
    if (i > 0 && i % GRUPO === 0) saida += '-'
    // O viés do módulo é desprezível aqui: 256 mod 25 = 6, o que desequilibra
    // seis símbolos em menos de 3%. Irrelevante para identificador, e o custo
    // de rejeitar amostras não se justifica.
    const indice = (bytes[i] ?? 0) % ALFABETO.length
    saida += ALFABETO[indice]
  }

  return saida
}

function bytesSeguros(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  globalThis.crypto.getRandomValues(buf)
  return buf
}

/** Formato canônico: 5 símbolos, hífen, 5 símbolos. Ex.: "A7K3M-QX9DF". */
export function ehCodigoUnicoValido(codigo: string): boolean {
  const padrao = new RegExp(
    `^[${ALFABETO}]{${GRUPO}}-[${ALFABETO}]{${COMPRIMENTO - GRUPO}}$`,
  )
  return padrao.test(codigo)
}

/**
 * Normaliza um código digitado ou colado pelo usuário: remove espaços, aplica
 * maiúsculas e recoloca o hífen. Não corrige símbolo ambíguo — corrigir
 * silenciosamente poderia apontar para outro estudante.
 */
export function normalizarCodigoUnico(entrada: string): string {
  const limpo = entrada.trim().toUpperCase().replace(/[\s-]/g, '')
  if (limpo.length !== COMPRIMENTO) return limpo
  return `${limpo.slice(0, GRUPO)}-${limpo.slice(GRUPO)}`
}
