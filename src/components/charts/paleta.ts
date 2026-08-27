/**
 * Paleta dos gráficos.
 *
 * Os valores são literais, não `var(--cor-…)`, porque o Recharts pinta o SVG
 * por atributo de apresentação (`fill`, `stroke`), onde a função `var()` não é
 * substituída. Manter os literais aqui, num só arquivo, evita que cada gráfico
 * invente o próprio tom — e mantém a correspondência com os tokens de
 * `globals.css`, que são a fonte da verdade do contraste.
 *
 * As duas escalas são deliberadamente distintas entre si:
 *
 *   - **Nível de aprendizagem** é a classificação OFICIAL da fonte:
 *     verde / âmbar / vermelho.
 *   - **Faixa analítica** é critério DO SISTEMA:
 *     petróleo / laranja-queimado / vinho.
 *
 * Confundir as duas na tela seria confundir o que a rede mediu com o que o
 * sistema convencionou (Const. III).
 */

export const COR_NIVEL = {
  ADEQUADO: 'rgb(25 135 84)',
  INTERMEDIARIO: 'rgb(138 101 0)',
  DEFASAGEM: 'rgb(176 42 55)',
  SEM_NIVEL: 'rgb(118 124 135)',
} as const

export const COR_FAIXA = {
  SATISFATORIO: 'rgb(11 95 128)',
  ATENCAO: 'rgb(168 91 0)',
  FRAGILIDADE: 'rgb(142 36 101)',
} as const

export const COR = {
  primaria: 'rgb(27 78 143)',
  primariaTenue: 'rgb(231 239 249)',
  texto: 'rgb(22 24 29)',
  textoSuave: 'rgb(84 91 102)',
  borda: 'rgb(216 219 224)',
  bordaForte: 'rgb(118 124 135)',
  superficie: 'rgb(255 255 255)',
  /** Ausência de dado: hachura neutra, nunca uma cor de desempenho. */
  ausente: 'rgb(198 202 209)',
} as const

export function corDaFaixa(faixa: string | null | undefined): string {
  if (faixa === 'FRAGILIDADE') return COR_FAIXA.FRAGILIDADE
  if (faixa === 'ATENCAO') return COR_FAIXA.ATENCAO
  if (faixa === 'SATISFATORIO') return COR_FAIXA.SATISFATORIO
  return COR.ausente
}

export function corDoNivel(nivel: string | null | undefined): string {
  if (nivel === 'ADEQUADO') return COR_NIVEL.ADEQUADO
  if (nivel === 'INTERMEDIARIO') return COR_NIVEL.INTERMEDIARIO
  if (nivel === 'DEFASAGEM') return COR_NIVEL.DEFASAGEM
  return COR_NIVEL.SEM_NIVEL
}

/**
 * Rótulo por extenso de cada faixa. Toda cor no gráfico vem acompanhada de
 * texto — nenhum significado depende só do matiz (Const. VIII, WCAG 1.4.1).
 */
export const ROTULO_FAIXA: Readonly<Record<string, string>> = {
  FRAGILIDADE: 'Fragilidade',
  ATENCAO: 'Atenção',
  SATISFATORIO: 'Satisfatório',
}

export const ROTULO_NIVEL: Readonly<Record<string, string>> = {
  ADEQUADO: 'Adequado',
  INTERMEDIARIO: 'Intermediário',
  DEFASAGEM: 'Defasagem',
  SEM_NIVEL: 'Sem nível informado',
}
