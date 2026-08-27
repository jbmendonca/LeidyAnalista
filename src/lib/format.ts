/**
 * Formatação de apresentação em português do Brasil.
 *
 * Const. I — ausência nunca se apresenta como `0`, `0%` ou string vazia: sai como travessão.
 * Toda função deste módulo devolve `AUSENTE` para `null`, `undefined` e para valor numérico
 * não finito (`NaN`, `Infinity`), que só poderia chegar aqui por defeito a montante.
 *
 * Este módulo é de **interface**: roda no cliente e por isso não importa `decimal.js`. O
 * percentual derivado de `Decimal` continua sendo responsabilidade exclusiva de
 * `src/lib/decimal.ts` (`formatPercent`) — `formatarPercentualDeNumero` existe apenas para
 * valores que já chegam à camada visual como `number` (participação, cobertura, proporções
 * de contagem), nunca para desempenho calculado.
 *
 * A equivalência entre `AUSENTE` daqui e `ABSENCE_PLACEHOLDER` de `decimal.ts` é travada por
 * teste, para que as duas metades do sistema não divirjam em silêncio.
 */

/** Travessão exibido no lugar de todo dado ausente. Espelha `ABSENCE_PLACEHOLDER`. */
export const AUSENTE = '—'

const LOCALIDADE = 'pt-BR'
const FUSO = 'America/Sao_Paulo'

// Os formatadores de `Intl` são caros de construir e imutáveis: instanciados uma vez.
const numero = new Intl.NumberFormat(LOCALIDADE)

const data = new Intl.DateTimeFormat(LOCALIDADE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: FUSO,
})

const dataHora = new Intl.DateTimeFormat(LOCALIDADE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: FUSO,
})

const percentuais = new Map<number, Intl.NumberFormat>()

function formatadorPercentual(casas: number): Intl.NumberFormat {
  const emCache = percentuais.get(casas)
  if (emCache) return emCache

  const criado = new Intl.NumberFormat(LOCALIDADE, {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
  percentuais.set(casas, criado)
  return criado
}

function ausente(valor: unknown): valor is null | undefined {
  return valor === null || valor === undefined
}

/** Data válida? `new Date('x')` produz um `Date` cujo `getTime()` é `NaN`. */
function dataInvalida(d: Date): boolean {
  return Number.isNaN(d.getTime())
}

/**
 * Data no formato `dd/MM/aaaa`.
 *
 * Fixada em `America/Sao_Paulo`: sem o fuso explícito, um `Date` gravado em UTC apareceria
 * um dia antes para quem lê à noite — e datas de aplicação de avaliação não podem escorregar.
 */
export function formatarData(d: Date | null | undefined): string {
  if (ausente(d) || dataInvalida(d)) return AUSENTE
  return data.format(d)
}

/** Data e hora no formato `dd/MM/aaaa HH:mm`, relógio de 24 horas. */
export function formatarDataHora(d: Date | null | undefined): string {
  if (ausente(d) || dataInvalida(d)) return AUSENTE
  // `Intl` separa data e hora com vírgula em pt-BR; a norma do painel é o espaço.
  return dataHora.format(d).replace(', ', ' ')
}

/** Número em padrão pt-BR: ponto como separador de milhar, vírgula como decimal. */
export function formatarNumero(n: number | null | undefined): string {
  if (ausente(n) || !Number.isFinite(n)) return AUSENTE
  return numero.format(n)
}

/**
 * Fração `acertos / itens` como `"2 / 3"`.
 *
 * Const. II — os dois inteiros permanecem visíveis lado a lado. É esta exibição que permite
 * ao leitor conferir de onde saiu o percentual, em vez de aceitá-lo por confiança.
 *
 * Ausência de qualquer um dos dois lados anula a fração inteira: exibir `"2 / —"` sugeriria
 * que o numerador ainda significa alguma coisa sem denominador.
 */
export function formatarFracao(
  acertos: number | null | undefined,
  itens: number | null | undefined,
): string {
  if (ausente(acertos) || ausente(itens)) return AUSENTE
  if (!Number.isFinite(acertos) || !Number.isFinite(itens)) return AUSENTE
  return `${numero.format(acertos)} / ${numero.format(itens)}`
}

/**
 * Percentual já expresso em pontos percentuais (`66.666…` → `"66,67%"`).
 *
 * Não substitui `formatPercent` de `src/lib/decimal.ts`: use esta função apenas quando o
 * valor chega à camada visual como `number` — nunca para converter uma fração de acertos.
 */
export function formatarPercentualDeNumero(
  n: number | null | undefined,
  casas = 2,
): string {
  if (ausente(n) || !Number.isFinite(n)) return AUSENTE
  return `${formatadorPercentual(casas).format(n)}%`
}
