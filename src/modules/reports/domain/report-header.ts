import { formatPercent, toPercent, ABSENCE_PLACEHOLDER } from '@/lib/decimal'
import { AUSENTE, formatarData, formatarDataHora, formatarFracao } from '@/lib/format'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  ESTRUTURA COMUM DE RELATÓRIO — FR-102, FR-106, FR-107, FR-166
 * ===========================================================================
 *
 * Este arquivo define **o documento**, não o conteúdo. Os cinco relatórios de
 * `application/` produzem sempre a mesma forma — cabeçalho + seções de colunas e
 * linhas — e é por isso que CSV, XLSX e a folha de impressão podem ser escritos uma
 * única vez, sem que nenhum deles saiba de qual relatório veio o que está escrevendo.
 *
 * Três decisões governam o arquivo:
 *
 *  1. **A célula carrega o texto já formatado.** O percentual nasce aqui de
 *     `toPercent` + `formatPercent`, exatamente as funções que a tela usa. É essa
 *     partilha, e não uma convenção de revisão, que faz o relatório coincidir com a
 *     tela até a última casa decimal (FR-107).
 *
 *  2. **Ausência é um estado da célula.** `numero: null` com texto de travessão. Nenhum
 *     caminho deste arquivo produz `0`, `0%` ou string vazia para dado inexistente
 *     (Const. I). O `numero` existe apenas para contagens inteiras — o percentual
 *     atravessa como texto, para que a planilha não o rearredonde por conta própria.
 *
 *  3. **Domínio puro** (Const. VI): sem Prisma, sem Next, sem `@/server`. O cabeçalho
 *     recebe quem é o solicitante por parâmetro; quem o descobre é a camada de
 *     aplicação.
 */

export const TIPOS_RELATORIO = [
  'geral',
  'escola',
  'turma',
  'habilidade',
  'individual',
] as const

export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number]

export const ROTULO_TIPO: Readonly<Record<TipoRelatorio, string>> = {
  geral: 'Relatório geral da avaliação',
  escola: 'Relatório da escola',
  turma: 'Relatório da turma',
  habilidade: 'Relatório da habilidade',
  individual: 'Relatório individual do estudante',
}

/** Converte o segmento da URL em tipo válido. Devolve `null` — quem decide o 404 é a rota. */
export function normalizarTipoRelatorio(valor: string): TipoRelatorio | null {
  const encontrado = TIPOS_RELATORIO.find((t) => t === valor)
  return encontrado ?? null
}

// ---------------------------------------------------------------------------
// Célula
// ---------------------------------------------------------------------------

/**
 * Uma célula do relatório.
 *
 * `texto` é o que a folha impressa e o CSV mostram; `numero` só é preenchido para
 * **contagem inteira**, e serve para que a planilha receba um número de verdade em vez
 * de texto. Percentual nunca preenche `numero`: ele já foi arredondado para apresentação
 * e reabri-lo como decimal na planilha criaria uma segunda verdade para o mesmo valor.
 */
export type Celula = Readonly<{
  texto: string
  numero: number | null
}>

export const CELULA_AUSENTE: Celula = { texto: ABSENCE_PLACEHOLDER, numero: null }

/** Texto livre. `null` e string vazia são ausência, e saem como travessão. */
export function celulaTexto(valor: string | null | undefined): Celula {
  if (valor === null || valor === undefined || valor.trim() === '') return CELULA_AUSENTE
  return { texto: valor, numero: null }
}

/** Contagem inteira. `null` é ausência — jamais `0` (Const. I). */
export function celulaInteiro(valor: number | null | undefined): Celula {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return CELULA_AUSENTE
  }
  return { texto: String(valor), numero: valor }
}

/**
 * Percentual derivado de `Σ acertos ÷ Σ itens`.
 *
 * A conversão é a mesma da tela — `toPercent` seguido de `formatPercent` —, incluindo o
 * `ROUND_HALF_UP` e as duas casas. Denominador não positivo devolve travessão.
 */
export function celulaPercentual(fracao: MaybeFraction): Celula {
  const percentual = toPercent(fracao)
  if (percentual === null) return CELULA_AUSENTE
  return { texto: formatPercent(percentual), numero: null }
}

/** `"18 / 22"`. Ausência de qualquer um dos lados anula a fração inteira. */
export function celulaFracao(fracao: MaybeFraction): Celula {
  if (fracao === null) return CELULA_AUSENTE
  return { texto: formatarFracao(fracao.acertos, fracao.itens), numero: null }
}

/** Fração válida, ou `null` quando o denominador não é positivo. Nunca `0/0`. */
export function fracaoOuAusencia(
  numerador: number | null | undefined,
  denominador: number | null | undefined,
): MaybeFraction {
  if (numerador === null || numerador === undefined) return null
  if (denominador === null || denominador === undefined) return null
  if (denominador <= 0) return null
  return { acertos: numerador, itens: denominador }
}

// ---------------------------------------------------------------------------
// Seção
// ---------------------------------------------------------------------------

export type ColunaRelatorio = Readonly<{
  chave: string
  rotulo: string
  /** Alinhamento à direita na folha e largura mínima na planilha. */
  numerica: boolean
}>

export type SecaoRelatorio = Readonly<{
  id: string
  titulo: string
  descricao: string | null
  colunas: readonly ColunaRelatorio[]
  linhas: readonly (readonly Celula[])[]
  /** Nota de rodapé da seção — por exemplo, a razão de um denominador. */
  nota: string | null
}>

export function coluna(chave: string, rotulo: string, numerica = false): ColunaRelatorio {
  return { chave, rotulo, numerica }
}

export function secao(entrada: {
  id: string
  titulo: string
  colunas: readonly ColunaRelatorio[]
  linhas: readonly (readonly Celula[])[]
  descricao?: string
  nota?: string
}): SecaoRelatorio {
  return {
    id: entrada.id,
    titulo: entrada.titulo,
    descricao: entrada.descricao ?? null,
    colunas: entrada.colunas,
    linhas: entrada.linhas,
    nota: entrada.nota ?? null,
  }
}

/** Seção de pares rótulo/valor — resumos e identificações. */
export const COLUNAS_RESUMO: readonly ColunaRelatorio[] = [
  coluna('indicador', 'Indicador'),
  coluna('valor', 'Valor', true),
]

export function linhaResumo(rotulo: string, valor: Celula): readonly Celula[] {
  return [celulaTexto(rotulo), valor]
}

// ---------------------------------------------------------------------------
// Cabeçalho — FR-106, FR-166
// ---------------------------------------------------------------------------

export type RecorteDeFiltro = Readonly<{ rotulo: string; valor: string }>

export type LinhaCabecalho = Readonly<{ rotulo: string; valor: string }>

export type EntradaCabecalho = Readonly<{
  tipo: TipoRelatorio
  avaliacao: Readonly<{
    id: string
    nome: string
    ano: number
    ciclo: string
    componenteCurricular: string
    dataAplicacao: Date | null
  }>
  /** `null` significa "todas as escolas do escopo do solicitante" — nunca "nenhuma". */
  escola: Readonly<{
    nome: string
    codigo: string
    municipio: string
    estado: string
  }> | null
  recorte: readonly RecorteDeFiltro[]
  /** Versão de `AnalyticalSettings` vigente no instante da geração (FR-166). */
  configuracao: Readonly<{
    versao: number
    fragilidadeMaxTexto: string
    atencaoMaxTexto: string
  }>
  geradoEm: Date
  /**
   * Identificado por `userId` e papel — nunca por nome ou e-mail. O relatório circula
   * fora do sistema, e a regra de não levar PII para fora vale também para quem pediu.
   */
  solicitante: Readonly<{ userId: string; papel: string }>
  versaoNominal: boolean
  rotuloVersao: string
}>

export type CabecalhoRelatorio = Readonly<{
  tipo: TipoRelatorio
  titulo: string
  subtitulo: string
  linhas: readonly LinhaCabecalho[]
  versaoNominal: boolean
  rotuloVersao: string
  geradoEmTexto: string
}>

/** `"60.00"` do `Decimal` do banco vira `"60,00"` — pt-BR também no limite (FR-108). */
function decimalPtBr(literal: string): string {
  return literal.replace('.', ',')
}

function descreverFaixas(configuracao: EntradaCabecalho['configuracao']): string {
  const fragilidade = decimalPtBr(configuracao.fragilidadeMaxTexto)
  const atencao = decimalPtBr(configuracao.atencaoMaxTexto)
  return (
    `versão ${configuracao.versao} — ` +
    `Fragilidade < ${fragilidade}%; ` +
    `Atenção de ${fragilidade}% a < ${atencao}%; ` +
    `Satisfatório >= ${atencao}%`
  )
}

function descreverRecorte(recorte: readonly RecorteDeFiltro[]): string {
  if (recorte.length === 0) return 'Sem filtros adicionais'
  return recorte.map((r) => `${r.rotulo}: ${r.valor}`).join(' · ')
}

/**
 * Cabeçalho obrigatório de todo relatório — FR-106 e FR-166.
 *
 * As oito linhas não são decoração: um relatório que circula em reunião pedagógica sem
 * dizer de qual avaliação veio, sob qual recorte, com quais faixas e em que momento é um
 * número solto que qualquer leitor pode atribuir ao que quiser. O rótulo de versão
 * (nominal ou agregada) fecha a lista porque explica ao leitor por que os nomes podem não
 * estar ali — o dado existe, a permissão é que não (FR-007a).
 */
export function montarCabecalhoRelatorio(entrada: EntradaCabecalho): CabecalhoRelatorio {
  const { avaliacao, escola, configuracao, solicitante } = entrada

  const linhas: LinhaCabecalho[] = [
    {
      rotulo: 'Avaliação',
      valor: `${avaliacao.nome} — ${avaliacao.ano} · ${avaliacao.ciclo} · ${avaliacao.componenteCurricular}`,
    },
    { rotulo: 'Data de aplicação', valor: formatarData(avaliacao.dataAplicacao) },
    {
      rotulo: 'Escola',
      valor: escola
        ? `${escola.nome} (${escola.codigo}) — ${escola.municipio}/${escola.estado}`
        : 'Todas as escolas do escopo do solicitante',
    },
    { rotulo: 'Recorte de filtros', valor: descreverRecorte(entrada.recorte) },
    { rotulo: 'Faixas analíticas vigentes', valor: descreverFaixas(configuracao) },
    { rotulo: 'Gerado em', valor: formatarDataHora(entrada.geradoEm) },
    {
      rotulo: 'Solicitante',
      valor: `${solicitante.papel} · identificador ${solicitante.userId}`,
    },
    { rotulo: 'Versão do relatório', valor: entrada.rotuloVersao },
  ]

  return {
    tipo: entrada.tipo,
    titulo: ROTULO_TIPO[entrada.tipo],
    subtitulo: escola ? escola.nome : avaliacao.nome,
    linhas,
    versaoNominal: entrada.versaoNominal,
    rotuloVersao: entrada.rotuloVersao,
    geradoEmTexto: formatarDataHora(entrada.geradoEm),
  }
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export type RelatorioMontado = Readonly<{
  tipo: TipoRelatorio
  cabecalho: CabecalhoRelatorio
  secoes: readonly SecaoRelatorio[]
  /** Sem extensão: cada escritor acrescenta a sua. */
  nomeArquivo: string
  /** `false` quando os nomes foram suprimidos na consulta (FR-007a). */
  nominal: boolean
}>

/** `relatorio-turma-2026-08-27-1432`. Sem nome de criança, nem no nome do arquivo. */
export function nomeDeArquivo(tipo: TipoRelatorio, geradoEm: Date): string {
  const iso = geradoEm.toISOString()
  const data = iso.slice(0, 10)
  const hora = iso.slice(11, 16).replace(':', '')
  return `relatorio-${tipo}-${data}-${hora}`
}

/** Travessão de referência, reexportado para que os escritores não redefinam o seu. */
export { AUSENTE as TRAVESSAO }
