import Decimal from 'decimal.js'

import { prisma } from '@/server/prisma'
import { formatPercent, toPercent } from '@/lib/decimal'
import { AUSENTE, formatarFracao } from '@/lib/format'
import {
  classifyAnalyticalSkillResult,
  type AnalyticalBand,
  type AnalyticalBands,
} from '@/modules/analytics/domain/classify'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  MAPA DE CALOR — FR-094 a FR-097
 * ===========================================================================
 *
 * A matriz estudante × habilidade é a tela em que a Constituição I corre mais
 * risco: uma grade densa convida a preencher o buraco com `0` só para o
 * desenho fechar. Aqui a ausência é um estado próprio da célula
 * (`temResultado: false`), com travessão no texto e tratamento visual distinto
 * do zero — que é resultado legítimo e continua colorido como Fragilidade
 * (FR-097).
 *
 * A cor **nunca** carrega significado sozinha (FR-096): toda célula sai daqui
 * com a fração e o percentual já formatados em texto, além de um rótulo
 * acessível completo. O componente apenas pinta o que este módulo escreveu.
 *
 * Este arquivo também é o dono do carregamento das faixas analíticas vigentes.
 * Ele é a folha da árvore de dependências da camada de aplicação de analytics
 * — `class-dashboard` e `student-record` importam daqui, e nada daqui importa
 * deles — de modo que a leitura de `AnalyticalSettings` tenha um único ponto
 * sem criar ciclo entre os módulos.
 */

/** Rótulo textual de cada faixa. Espelha `FaixaBadge`; a cor jamais responde sozinha. */
export const ROTULO_FAIXA: Readonly<Record<AnalyticalBand, string>> = {
  FRAGILIDADE: 'Fragilidade',
  ATENCAO: 'Atenção',
  SATISFATORIO: 'Satisfatório',
}

/**
 * Faixas analíticas em vigor, lidas de `AnalyticalSettings`.
 *
 * `bands` é para cálculo; os campos `*Texto` são para exibição e para a
 * consulta SQL de fragilidade, que recebe o limite como literal numérico.
 */
export type FaixasVigentes = Readonly<{
  version: number
  bands: AnalyticalBands
  fragilidadeMaxTexto: string
  atencaoMaxTexto: string
}>

/** Recorte serializável das faixas, seguro para atravessar até o componente. */
export type FaixasParaExibicao = Readonly<{
  version: number
  fragilidadeMaxTexto: string
  atencaoMaxTexto: string
}>

/** Aceita apenas decimal posicional não negativo. Ver comentário em `numeroLiteral`. */
const LITERAL_NUMERICO = /^\d{1,3}(\.\d{1,4})?$/

/**
 * `estudantesEmFragilidadePorHabilidade` interpola o limite em SQL cru. O valor vem do
 * banco, não do usuário, mas a interpolação sem validação é o tipo de brecha que sobrevive
 * a refatorações — a checagem custa nada e fecha a porta de vez.
 */
function numeroLiteral(valor: { toFixed(casas: number): string }): string {
  const literal = valor.toFixed(2)
  if (!LITERAL_NUMERICO.test(literal)) {
    throw new Error(
      `Limite de faixa analítica em formato inesperado: ${literal}. ` +
        'Corrija a configuração antes de prosseguir.',
    )
  }
  return literal
}

/**
 * Lê as faixas analíticas vigentes — FR-111, FR-162 a FR-167.
 *
 * `AnalyticalSettings` nunca sofre UPDATE: cada alteração insere uma versão nova, e a
 * vigente é a de maior `effectiveFrom`. Não existe valor padrão em código: sem configuração
 * o sistema falha alto, porque adotar "60/80" silenciosamente transformaria um limite
 * configurável em constante escondida, exatamente o que FR-111 proíbe.
 */
export async function carregarFaixasAnaliticas(): Promise<FaixasVigentes> {
  const config = await prisma.analyticalSettings.findFirst({
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    select: { version: true, fragilidadeMax: true, atencaoMax: true },
  })

  if (!config) {
    throw new Error(
      'Nenhuma configuração analítica cadastrada. As faixas são configuráveis e não ' +
        'possuem valor padrão em código (FR-111): execute a semeadura inicial.',
    )
  }

  const fragilidadeMaxTexto = numeroLiteral(config.fragilidadeMax)
  const atencaoMaxTexto = numeroLiteral(config.atencaoMax)

  return {
    version: config.version,
    bands: {
      fragilidadeMax: new Decimal(fragilidadeMaxTexto),
      atencaoMax: new Decimal(atencaoMaxTexto),
    },
    fragilidadeMaxTexto,
    atencaoMaxTexto,
  }
}

/** Só o que atravessa até o componente. Nenhum `Decimal` cruza a fronteira. */
export function faixasParaExibicao(faixas: FaixasVigentes): FaixasParaExibicao {
  return {
    version: faixas.version,
    fragilidadeMaxTexto: faixas.fragilidadeMaxTexto,
    atencaoMaxTexto: faixas.atencaoMaxTexto,
  }
}

/** Coluna do mapa: uma habilidade da avaliação. */
export type ColunaHabilidade = Readonly<{
  skillId: string
  shortCode: string
  referenceCode: string
  descricao: string
}>

/** Resultado bruto de uma habilidade, como veio do banco. `null` é ausência. */
export type ResultadoDeHabilidade = Readonly<{
  valorOriginal: string | null
  acertos: number | null
  itensPossiveis: number | null
}>

/** Linha de entrada do mapa. O nome já chega com a supressão nominal aplicada. */
export type EntradaEstudanteMapa = Readonly<{
  studentId: string
  uniqueCode: string
  nomeOriginal: string
  avaliado: boolean
  resultadosPorHabilidade: ReadonlyMap<string, ResultadoDeHabilidade>
}>

/**
 * Célula pronta para desenho. Todos os campos são serializáveis: o mapa é
 * renderizado por componente de cliente (virtualização), e nenhum `Decimal`
 * pode atravessar essa fronteira.
 */
export type CelulaMapaCalor = Readonly<{
  skillId: string
  shortCode: string
  referenceCode: string
  descricao: string
  /** `false` é ausência de resultado — distinta de resultado zero (FR-097). */
  temResultado: boolean
  acertos: number | null
  itens: number | null
  /** `"1 / 2"`, ou travessão. Sempre ao lado do percentual (FR-127). */
  fracaoTexto: string
  /** `"50,00%"`, ou travessão. Derivado com `Decimal`, jamais com `Number`. */
  percentualTexto: string
  /** String exatamente como veio da fonte, quando houver (FR-030). */
  valorOriginal: string | null
  faixa: AnalyticalBand | null
  /** `title` e `aria-label` da célula: FR-095 em uma frase. */
  rotuloAcessivel: string
}>

export type LinhaMapaCalor = Readonly<{
  studentId: string
  uniqueCode: string
  nomeOriginal: string
  avaliado: boolean
  celulas: readonly CelulaMapaCalor[]
}>

export type MapaDeCalor = Readonly<{
  habilidades: readonly ColunaHabilidade[]
  linhas: readonly LinhaMapaCalor[]
  /** Quantas células têm resultado. Zero aqui significa mapa vazio, não desempenho zero. */
  celulasComResultado: number
}>

/** Converte o registro do banco em fração — ou em ausência, nunca em zero. */
function fracaoDe(resultado: ResultadoDeHabilidade | undefined): MaybeFraction {
  if (!resultado) return null
  const { acertos, itensPossiveis } = resultado
  if (acertos === null || itensPossiveis === null) return null
  if (itensPossiveis <= 0) return null
  return { acertos, itens: itensPossiveis }
}

function montarCelula(
  nomeEstudante: string,
  avaliado: boolean,
  habilidade: ColunaHabilidade,
  resultado: ResultadoDeHabilidade | undefined,
  bands: AnalyticalBands,
): CelulaMapaCalor {
  const fracao = avaliado ? fracaoDe(resultado) : null
  const faixa = classifyAnalyticalSkillResult(fracao, bands)

  const fracaoTexto =
    fracao === null ? AUSENTE : formatarFracao(fracao.acertos, fracao.itens)
  const percentualTexto = formatPercent(toPercent(fracao))

  const identificacao = `${habilidade.shortCode} (${habilidade.referenceCode})`

  const rotuloAcessivel =
    fracao === null
      ? [
          `${nomeEstudante} — ${identificacao}:`,
          avaliado
            ? 'sem resultado registrado para esta habilidade.'
            : 'estudante não avaliado, sem resultado registrado.',
          'Ausência de resultado, diferente de resultado zero.',
          habilidade.descricao,
        ].join(' ')
      : [
          `${nomeEstudante} — ${identificacao}:`,
          `${fracaoTexto}, ${percentualTexto}.`,
          `Faixa analítica ${ROTULO_FAIXA[faixa ?? 'FRAGILIDADE']}`,
          '(critério analítico do sistema).',
          resultado?.valorOriginal ? `Registrado na fonte como "${resultado.valorOriginal}".` : '',
          habilidade.descricao,
        ]
          .filter((parte) => parte !== '')
          .join(' ')

  return {
    skillId: habilidade.skillId,
    shortCode: habilidade.shortCode,
    referenceCode: habilidade.referenceCode,
    descricao: habilidade.descricao,
    temResultado: fracao !== null,
    acertos: fracao === null ? null : fracao.acertos,
    itens: fracao === null ? null : fracao.itens,
    fracaoTexto,
    percentualTexto,
    valorOriginal: fracao === null ? null : (resultado?.valorOriginal ?? null),
    faixa,
    rotuloAcessivel,
  }
}

/**
 * Monta a matriz estudante × habilidade (FR-094).
 *
 * Função pura: recebe o que já foi lido do banco e devolve células prontas. A ordem das
 * linhas é a que chegou — quem chama já as ordenou por prioridade pedagógica, e reordenar
 * aqui faria o mapa discordar da tabela de estudantes ao lado.
 *
 * Estudante não avaliado gera linha completa de células vazias: some-lo do mapa
 * esconderia a ausência, e preenchê-lo com zero a falsificaria (Const. I e V).
 */
export function montarMapaDeCalor(entrada: {
  habilidades: readonly ColunaHabilidade[]
  estudantes: readonly EntradaEstudanteMapa[]
  bands: AnalyticalBands
}): MapaDeCalor {
  const { habilidades, estudantes, bands } = entrada

  let celulasComResultado = 0

  const linhas = estudantes.map((estudante) => {
    const celulas = habilidades.map((habilidade) => {
      const celula = montarCelula(
        estudante.nomeOriginal,
        estudante.avaliado,
        habilidade,
        estudante.resultadosPorHabilidade.get(habilidade.skillId),
        bands,
      )
      if (celula.temResultado) celulasComResultado += 1
      return celula
    })

    return {
      studentId: estudante.studentId,
      uniqueCode: estudante.uniqueCode,
      nomeOriginal: estudante.nomeOriginal,
      avaliado: estudante.avaliado,
      celulas,
    }
  })

  return { habilidades, linhas, celulasComResultado }
}
