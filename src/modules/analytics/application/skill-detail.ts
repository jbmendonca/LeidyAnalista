import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'

import { prisma } from '@/server/prisma'
import type { AuthContext } from '@/server/authorization'
import { escopoVazio, schoolScopeFilter } from '@/server/authorization'
import { conflito } from '@/server/http-errors'
import { aplicarSupressaoNominal, podeVerNomes } from '@/server/nominal-data'
import { toPercent } from '@/lib/decimal'
import type { MaybeFraction } from '@/modules/imports/domain/types'
import { rankSkillsByFragility } from '@/modules/analytics/domain/rank-skills'
import {
  classifyAnalyticalSkillResult,
  type AnalyticalBand,
} from '@/modules/analytics/domain/classify'
import {
  avaliadoParaBooleano,
  type FiltrosPainel,
  type SituacaoFiltro,
} from '@/modules/analytics/schemas/filters'

/**
 * ===========================================================================
 *  TELA POR HABILIDADE — FR-083 a FR-087, FR-156 a FR-159
 * ===========================================================================
 *
 * Três invariantes governam este arquivo:
 *
 *  1. **O denominador de referência vem de `AssessmentSkill.referenceItems`.** Ele é apurado
 *     dos dados importados (`recalcularDenominadoresDeReferencia`) e nunca existe como
 *     constante no código — nem "22", nem doze habilidades presumidas (FR-016, FR-156). Sem
 *     vínculo `AssessmentSkill`, a habilidade simplesmente não tem o que apresentar naquela
 *     avaliação, e a tela diz isso em vez de arbitrar um número.
 *
 *  2. **Divergência é assunto de apresentação, não de cálculo.** Registros cujo denominador
 *     difere do de referência saem da distribuição `0/n … n/n` e vão para uma lista própria,
 *     com estudante, turma, denominador encontrado e resultado original (FR-158, FR-159).
 *     O percentual consolidado continua `Σ acertos ÷ Σ itens` de **todos** os avaliados,
 *     divergentes inclusive (FR-157). Excluí-los da soma mudaria o indicador por causa de
 *     uma escolha de exibição — exatamente o que FR-157 proíbe.
 *
 *  3. **`avaliado: true` em tudo que é desempenho.** Não avaliado fica fora de todo
 *     denominador de desempenho (Const. V, FR-059).
 *
 * ---------------------------------------------------------------------------
 * Por que a consulta é montada aqui e não reaproveita `FiltrosAnalise`
 * ---------------------------------------------------------------------------
 * `infra/aggregate-queries.ts` cobre onze dimensões; FR-098 exige quinze, e as quatro
 * restantes — componente curricular, código da turma, faixa de percentual geral e situação
 * analítica — não são expressáveis naquele tipo. Aplicar só onze faria a tela contradizer a
 * barra de filtros, que é o oposto de FR-099.
 *
 * Além disso, FR-158 pede **estudante e turma** de cada registro divergente, e FR-086 pede o
 * ranking de turmas *nesta habilidade* — nenhum dos dois é produzido pelas funções agregadas
 * (a primeira devolve contagens sem identificação; `desempenhoPorTurma` agrega o desempenho
 * geral, não o da habilidade). A linha detalhada é obrigatória de qualquer forma, e derivar
 * distribuição, divergentes, consolidado, ranking e dificuldade **da mesma leitura** é o que
 * garante que os cinco blocos da tela nunca discordem entre si.
 *
 * A regra de partilha reproduz `distribuicaoDaHabilidade` termo a termo, e o teste de
 * integração compara as duas saídas para que não possam divergir em silêncio.
 *
 * O escopo de escola continua vindo de `schoolScopeFilter`: `filtros.escola` é filtro dentro
 * do que o usuário já pode ver, nunca autorização (Const. IV, FR-006).
 */

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

export type FaixasVigentes = Readonly<{
  versao: number
  fragilidadeMax: Decimal
  atencaoMax: Decimal
}>

export type FaixaDaDistribuicao = Readonly<{
  /** Quantidade de acertos da faixa: 0, 1, … n. */
  acertos: number
  /** Denominador de referência — o `n` de `k/n`. */
  itens: number
  quantidade: number
  /** Proporção sobre os registros que compõem a distribuição. `null` se não há nenhum. */
  proporcao: Decimal | null
}>

export type RegistroDivergente = Readonly<{
  studentId: string
  uniqueCode: string
  nomeOriginal: string
  turma: string
  codigoTurma: string
  /** Denominador encontrado no registro — diferente do de referência (FR-158). */
  itensEncontrados: number
  acertos: number
  /** Texto exatamente como veio da fonte, ex. "2 / 2" (FR-030). */
  resultadoOriginal: string | null
  percentual: Decimal | null
}>

export type TurmaNaHabilidade = Readonly<{
  classId: string
  turma: string
  codigoTurma: string
  escola: string
  estudantesComResultado: number
  acertos: number
  itens: number
  percentual: Decimal | null
  faixa: AnalyticalBand | null
}>

export type EstudanteEmDificuldade = Readonly<{
  studentId: string
  uniqueCode: string
  nomeOriginal: string
  turma: string
  codigoTurma: string
  acertos: number
  itens: number
  resultadoOriginal: string | null
  percentual: Decimal | null
  faixa: AnalyticalBand | null
  /** Denominador diferente do de referência: o registro está fora da distribuição. */
  divergente: boolean
}>

export type DetalheDaHabilidade = Readonly<{
  habilidade: Readonly<{
    id: string
    shortCode: string
    referenceCode: string
    descricao: string
    ordem: number
  }>
  avaliacao: Readonly<{
    id: string
    nome: string
    ano: number
    componenteCurricular: string
  }>
  /** FR-156 — apurado dos dados, jamais fixado em código. */
  denominadorReferencia: number
  /** FR-160 — houve empate de frequência na apuração do denominador. */
  denominadorPorEmpate: boolean

  /** Registros avaliados do recorte, com ou sem resultado nesta habilidade. */
  avaliadosNoRecorte: number
  /** Avaliados com resultado apurado nesta habilidade. */
  estudantesComResultado: number
  /** Avaliados sem resultado nesta habilidade: ausência, nunca zero (Const. I). */
  semResultado: number

  /** FR-157 — Σ de todos os avaliados com resultado, divergentes inclusive. */
  totalAcertos: number
  totalItens: number
  percentual: Decimal | null
  faixa: AnalyticalBand | null

  distribuicao: readonly FaixaDaDistribuicao[]
  /** Registros que compõem a distribuição (sem os divergentes). */
  totalNaDistribuicao: number

  divergentes: readonly RegistroDivergente[]
  totalDivergentes: number

  turmas: readonly TurmaNaHabilidade[]
  dificuldades: readonly EstudanteEmDificuldade[]

  /** FR-007a — o relatório é agregado quando falta a permissão nominal, nunca negado. */
  nomesVisiveis: boolean
  faixas: FaixasVigentes | null
}>

export type HabilidadeNoRecorte = Readonly<{
  id: string
  shortCode: string
  referenceCode: string
  descricao: string
  ordem: number
  denominadorReferencia: number
  estudantesComResultado: number
  acertos: number
  itens: number
  percentual: Decimal | null
  faixa: AnalyticalBand | null
}>

/** Quantos estudantes a lista de maior dificuldade exibe. Limite de leitura, não de cálculo. */
const LIMITE_DIFICULDADE = 15

// ---------------------------------------------------------------------------
// Faixas analíticas vigentes
// ---------------------------------------------------------------------------

/**
 * Faixas analíticas em vigor — FR-111.
 *
 * Vêm sempre de `AnalyticalSettings`. Não há valor padrão embutido: quando a configuração
 * não existe, a tela deixa de classificar em vez de assumir 60/80 por conta própria.
 */
export async function carregarFaixasVigentes(): Promise<FaixasVigentes | null> {
  const registro = await prisma.analyticalSettings.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true, fragilidadeMax: true, atencaoMax: true },
  })
  if (!registro) return null

  return {
    versao: registro.version,
    fragilidadeMax: new Decimal(registro.fragilidadeMax.toString()),
    atencaoMax: new Decimal(registro.atencaoMax.toString()),
  }
}

function classificar(
  resultado: MaybeFraction,
  faixas: FaixasVigentes | null,
): AnalyticalBand | null {
  if (faixas === null) return null
  return classifyAnalyticalSkillResult(resultado, {
    fragilidadeMax: faixas.fragilidadeMax,
    atencaoMax: faixas.atencaoMax,
  })
}

// ---------------------------------------------------------------------------
// Recorte
// ---------------------------------------------------------------------------

type WhereResultado = Prisma.AssessmentStudentResultWhereInput

function limitesDaSituacao(
  situacao: SituacaoFiltro,
  faixas: FaixasVigentes,
): { minimo?: Decimal; limiteExclusivo?: Decimal } {
  if (situacao === 'FRAGILIDADE') return { limiteExclusivo: faixas.fragilidadeMax }
  if (situacao === 'ATENCAO') {
    return { minimo: faixas.fragilidadeMax, limiteExclusivo: faixas.atencaoMax }
  }
  return { minimo: faixas.atencaoMax }
}

/**
 * Faixa de percentual geral da consulta.
 *
 * Combina a faixa digitada pelo usuário com a da situação analítica escolhida, por
 * interseção. Os limites superiores das faixas analíticas são **exclusivos** (`lt`), como em
 * `classifyAnalyticalSkillResult`; o limite digitado é inclusivo (`lte`), porque é assim que
 * um intervalo escrito à mão se lê. Os dois convivem no mesmo filtro sem se anular.
 */
function faixaDePercentual(
  filtros: FiltrosPainel,
  faixas: FaixasVigentes | null,
): Prisma.DecimalFilter | null {
  let minimo: Decimal | null =
    filtros.percentualMin === undefined ? null : new Decimal(filtros.percentualMin)
  const maximoInclusivo: Decimal | null =
    filtros.percentualMax === undefined ? null : new Decimal(filtros.percentualMax)
  let limiteExclusivo: Decimal | null = null

  if (filtros.situacao !== undefined) {
    if (faixas === null) {
      // Sem configuração não há como traduzir "Fragilidade" em número. Recusar é a única
      // saída honesta: aplicar um padrão de código violaria FR-111, e ignorar o filtro
      // devolveria uma tela que não corresponde ao recorte pedido.
      throw conflito(
        'As faixas analíticas ainda não foram configuradas — o filtro por situação analítica não pode ser aplicado.',
      )
    }
    const limites = limitesDaSituacao(filtros.situacao, faixas)
    if (limites.minimo && (minimo === null || limites.minimo.greaterThan(minimo))) {
      minimo = limites.minimo
    }
    if (limites.limiteExclusivo) limiteExclusivo = limites.limiteExclusivo
  }

  const filtro: Prisma.DecimalFilter = {}
  if (minimo !== null) filtro.gte = new Prisma.Decimal(minimo.toFixed(4))
  if (maximoInclusivo !== null) filtro.lte = new Prisma.Decimal(maximoInclusivo.toFixed(4))
  if (limiteExclusivo !== null) filtro.lt = new Prisma.Decimal(limiteExclusivo.toFixed(4))

  return Object.keys(filtro).length === 0 ? null : filtro
}

/**
 * Cláusula base do recorte, com as quinze dimensões de FR-098.
 *
 * NÃO fixa `avaliado`: quem chama decide, conscientemente. A diferença entre desempenho e
 * participação é a tradução exata de FR-059 e FR-060.
 */
export function whereDoRecorte(
  ctx: AuthContext,
  filtros: FiltrosPainel,
  assessmentId: string,
  faixas: FaixasVigentes | null,
): WhereResultado {
  const where: WhereResultado = {
    assessmentId,
    schoolId: schoolScopeFilter(ctx, filtros.escola ?? null),
  }

  if (filtros.turma) where.classId = filtros.turma
  if (filtros.estudante) where.studentId = filtros.estudante
  if (filtros.nivel) where.nivelNormalizado = filtros.nivel

  const participacao = avaliadoParaBooleano(filtros.avaliado)
  if (participacao !== null) where.avaliado = participacao

  const turma: Prisma.ClassWhereInput = {}
  if (filtros.anoEscolar) turma.anoEscolar = filtros.anoEscolar
  if (filtros.codigoTurma) turma.externalCode = filtros.codigoTurma
  if (Object.keys(turma).length > 0) where.class = turma

  const escola: Prisma.SchoolWhereInput = {}
  if (filtros.rede) escola.rede = filtros.rede
  if (filtros.estado) escola.estado = filtros.estado
  if (filtros.municipio) escola.municipio = filtros.municipio
  if (Object.keys(escola).length > 0) where.school = escola

  if (filtros.componenteCurricular) {
    where.assessment = { componenteCurricular: filtros.componenteCurricular }
  }

  const percentual = faixaDePercentual(filtros, faixas)
  if (percentual !== null) where.percentualGeral = percentual

  return where
}

/** Recorte de DESEMPENHO: `avaliado: true` é obrigatório e sobrepõe o filtro do usuário. */
function whereDeDesempenho(
  ctx: AuthContext,
  filtros: FiltrosPainel,
  assessmentId: string,
  faixas: FaixasVigentes | null,
): WhereResultado {
  return { ...whereDoRecorte(ctx, filtros, assessmentId, faixas), avaliado: true }
}

// ---------------------------------------------------------------------------
// Comparações exatas
// ---------------------------------------------------------------------------

/**
 * Compara duas frações sem dividir: `a₁/b₁ < a₂/b₂` ⇔ `a₁·b₂ < a₂·b₁` para denominadores
 * positivos. Aritmética exata, sem arredondamento intermediário (Const. II).
 * Ausência vai sempre para o fim — não é o pior desempenho, apenas não é desempenho.
 */
function compararFracoes(a: MaybeFraction, b: MaybeFraction): number {
  if (a === null || b === null) {
    if (a === b) return 0
    return a === null ? 1 : -1
  }
  return new Decimal(a.acertos)
    .times(b.itens)
    .comparedTo(new Decimal(b.acertos).times(a.itens))
}

function fracao(acertos: number, itens: number): MaybeFraction {
  return itens > 0 ? { acertos, itens } : null
}

// ---------------------------------------------------------------------------
// Linhas detalhadas
// ---------------------------------------------------------------------------

const SELECAO_LINHA = {
  acertos: true,
  itensPossiveis: true,
  valorOriginal: true,
  result: {
    select: {
      studentId: true,
      classId: true,
      student: { select: { uniqueCode: true, nomeOriginal: true } },
      class: {
        select: { name: true, externalCode: true, school: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.StudentSkillResultSelect

type LinhaDaHabilidade = Prisma.StudentSkillResultGetPayload<{
  select: typeof SELECAO_LINHA
}>

type LinhaApurada = {
  acertos: number
  itens: number
  linha: LinhaDaHabilidade
}

/**
 * Descarta as linhas sem resultado.
 *
 * Ausência não entra em soma nem em contagem de distribuição — e não vira zero em lugar
 * nenhum (Const. I, FR-031). O filtro é explícito para que ninguém o "conserte" depois com
 * um `COALESCE(..., 0)`.
 */
function apurar(linhas: readonly LinhaDaHabilidade[]): LinhaApurada[] {
  const saida: LinhaApurada[] = []
  for (const linha of linhas) {
    if (linha.acertos === null || linha.itensPossiveis === null) continue
    if (linha.itensPossiveis <= 0) continue
    saida.push({ acertos: linha.acertos, itens: linha.itensPossiveis, linha })
  }
  return saida
}

// ---------------------------------------------------------------------------
// Detalhe da habilidade
// ---------------------------------------------------------------------------

export async function obterDetalheDaHabilidade(
  ctx: AuthContext,
  filtros: FiltrosPainel,
  assessmentId: string,
  skillId: string,
): Promise<DetalheDaHabilidade | null> {
  if (escopoVazio(ctx)) return null

  // FR-156 — o denominador de referência é o do vínculo apurado. Sem vínculo não há
  // quantidade de itens conhecida, e a tela não inventa uma.
  const vinculo = await prisma.assessmentSkill.findUnique({
    where: { assessmentId_skillId: { assessmentId, skillId } },
    select: {
      referenceItems: true,
      referenceItemsTiebreak: true,
      skill: {
        select: {
          id: true,
          shortCode: true,
          referenceCode: true,
          descricao: true,
          ordem: true,
        },
      },
      assessment: {
        select: { id: true, nome: true, ano: true, componenteCurricular: true },
      },
    },
  })
  if (!vinculo) return null

  const faixas = await carregarFaixasVigentes()
  const where = whereDeDesempenho(ctx, filtros, assessmentId, faixas)
  const referencia = vinculo.referenceItems

  const [avaliadosNoRecorte, brutas] = await Promise.all([
    prisma.assessmentStudentResult.count({ where }),
    prisma.studentSkillResult.findMany({
      where: { skillId, acertos: { not: null }, result: where },
      select: SELECAO_LINHA,
      orderBy: { id: 'asc' },
    }),
  ])

  const linhas = apurar(brutas)

  // --- FR-157: consolidado sobre TODAS as linhas, divergentes inclusive -----
  let totalAcertos = 0
  let totalItens = 0
  for (const l of linhas) {
    totalAcertos += l.acertos
    totalItens += l.itens
  }
  const consolidado = fracao(totalAcertos, totalItens)

  // --- FR-158: partilha pelo denominador de referência ---------------------
  const contagem = new Map<number, number>()
  const divergentesBrutos: RegistroDivergente[] = []
  let totalNaDistribuicao = 0

  for (const l of linhas) {
    if (l.itens === referencia) {
      contagem.set(l.acertos, (contagem.get(l.acertos) ?? 0) + 1)
      totalNaDistribuicao++
      continue
    }
    divergentesBrutos.push({
      studentId: l.linha.result.studentId,
      uniqueCode: l.linha.result.student.uniqueCode,
      nomeOriginal: l.linha.result.student.nomeOriginal,
      turma: l.linha.result.class.name,
      codigoTurma: l.linha.result.class.externalCode,
      itensEncontrados: l.itens,
      acertos: l.acertos,
      resultadoOriginal: l.linha.valorOriginal,
      percentual: toPercent({ acertos: l.acertos, itens: l.itens }),
    })
  }

  // Toda faixa de `0/n` a `n/n` aparece, inclusive as sem ocorrência. Omitir a faixa vazia
  // esconderia do leitor que ninguém acertou aquele número de itens — e "0 medido" é
  // informação, diferente de ausência (Const. I).
  const distribuicao: FaixaDaDistribuicao[] = []
  for (let acertos = 0; acertos <= referencia; acertos++) {
    const quantidade = contagem.get(acertos) ?? 0
    distribuicao.push({
      acertos,
      itens: referencia,
      quantidade,
      proporcao:
        totalNaDistribuicao > 0
          ? toPercent({ acertos: quantidade, itens: totalNaDistribuicao })
          : null,
    })
  }

  // --- FR-086: ranking das turmas nesta habilidade -------------------------
  const porTurma = new Map<
    string,
    { turma: string; codigoTurma: string; escola: string; acertos: number; itens: number; n: number }
  >()

  for (const l of linhas) {
    const classId = l.linha.result.classId
    const atual = porTurma.get(classId) ?? {
      turma: l.linha.result.class.name,
      codigoTurma: l.linha.result.class.externalCode,
      escola: l.linha.result.class.school.name,
      acertos: 0,
      itens: 0,
      n: 0,
    }
    atual.acertos += l.acertos
    atual.itens += l.itens
    atual.n += 1
    porTurma.set(classId, atual)
  }

  const turmas: TurmaNaHabilidade[] = [...porTurma.entries()]
    .map(([classId, t]) => {
      const resultado = fracao(t.acertos, t.itens)
      return {
        classId,
        turma: t.turma,
        codigoTurma: t.codigoTurma,
        escola: t.escola,
        estudantesComResultado: t.n,
        acertos: t.acertos,
        itens: t.itens,
        percentual: toPercent(resultado),
        faixa: classificar(resultado, faixas),
      }
    })
    // Menor desempenho primeiro: o ranking existe para apontar onde intervir.
    .sort((a, b) => {
      const porDesempenho = compararFracoes(
        fracao(a.acertos, a.itens),
        fracao(b.acertos, b.itens),
      )
      if (porDesempenho !== 0) return porDesempenho
      // Mais itens é mais evidência e tem precedência; o nome fecha o desempate para que a
      // ordem não dependa do retorno do banco.
      if (a.itens !== b.itens) return b.itens - a.itens
      return a.turma.localeCompare(b.turma, 'pt-BR')
    })

  // --- FR-087: estudantes com maior dificuldade ----------------------------
  const dificuldadesBrutas: EstudanteEmDificuldade[] = linhas
    .map((l) => {
      const resultado = fracao(l.acertos, l.itens)
      return {
        studentId: l.linha.result.studentId,
        uniqueCode: l.linha.result.student.uniqueCode,
        nomeOriginal: l.linha.result.student.nomeOriginal,
        turma: l.linha.result.class.name,
        codigoTurma: l.linha.result.class.externalCode,
        acertos: l.acertos,
        itens: l.itens,
        resultadoOriginal: l.linha.valorOriginal,
        percentual: toPercent(resultado),
        faixa: classificar(resultado, faixas),
        divergente: l.itens !== referencia,
      }
    })
    .sort((a, b) => {
      const porDesempenho = compararFracoes(
        fracao(a.acertos, a.itens),
        fracao(b.acertos, b.itens),
      )
      if (porDesempenho !== 0) return porDesempenho
      if (a.itens !== b.itens) return b.itens - a.itens
      return a.uniqueCode.localeCompare(b.uniqueCode, 'pt-BR')
    })
    .slice(0, LIMITE_DIFICULDADE)

  // FR-007, FR-007a — a supressão acontece na fronteira da consulta, não na renderização:
  // esconder a coluna deixaria o nome trafegar até o navegador.
  const divergentes = aplicarSupressaoNominal(ctx, divergentesBrutos)
  const dificuldades = aplicarSupressaoNominal(ctx, dificuldadesBrutas)

  return {
    habilidade: vinculo.skill,
    avaliacao: vinculo.assessment,
    denominadorReferencia: referencia,
    denominadorPorEmpate: vinculo.referenceItemsTiebreak,

    avaliadosNoRecorte,
    estudantesComResultado: linhas.length,
    semResultado: Math.max(avaliadosNoRecorte - linhas.length, 0),

    totalAcertos,
    totalItens,
    percentual: toPercent(consolidado),
    faixa: classificar(consolidado, faixas),

    distribuicao,
    totalNaDistribuicao,

    divergentes,
    totalDivergentes: divergentes.length,

    turmas,
    dificuldades,

    nomesVisiveis: podeVerNomes(ctx),
    faixas,
  }
}

// ---------------------------------------------------------------------------
// Lista de habilidades do recorte
// ---------------------------------------------------------------------------

/**
 * Habilidades da avaliação no recorte, ordenadas da maior fragilidade para a menor (FR-072).
 *
 * A ordenação usa `rankSkillsByFragility` com o critério padrão `LOWEST_PERCENT`, que lê
 * apenas a fração e as chaves de desempate — por isso `studentsInFragility` entra como `0`:
 * contá-lo exigiria uma varredura por estudante que esta lista não usa para nada.
 */
export async function listarHabilidadesDoRecorte(
  ctx: AuthContext,
  filtros: FiltrosPainel,
  assessmentId: string,
): Promise<readonly HabilidadeNoRecorte[]> {
  if (escopoVazio(ctx)) return []

  const faixas = await carregarFaixasVigentes()
  const where = whereDeDesempenho(ctx, filtros, assessmentId, faixas)

  const vinculos = await prisma.assessmentSkill.findMany({
    where: { assessmentId },
    select: {
      referenceItems: true,
      skill: {
        select: {
          id: true,
          shortCode: true,
          referenceCode: true,
          descricao: true,
          ordem: true,
        },
      },
    },
  })
  if (vinculos.length === 0) return []

  const agregados = await prisma.studentSkillResult.groupBy({
    by: ['skillId'],
    where: { result: where, acertos: { not: null } },
    _sum: { acertos: true, itensPossiveis: true },
    _count: { _all: true },
  })

  const porHabilidade = new Map(agregados.map((a) => [a.skillId, a]))

  const lista = vinculos.map((v) => {
    const agregado = porHabilidade.get(v.skill.id)
    const acertos = agregado?._sum.acertos ?? 0
    const itens = agregado?._sum.itensPossiveis ?? 0
    const resultado = fracao(acertos, itens)

    return {
      ...v.skill,
      denominadorReferencia: v.referenceItems,
      estudantesComResultado: agregado?._count._all ?? 0,
      acertos,
      itens,
      resultado,
      percentual: toPercent(resultado),
      faixa: classificar(resultado, faixas),
    }
  })

  const ordenada = rankSkillsByFragility(
    lista.map((h) => ({
      skillId: h.id,
      shortCode: h.shortCode,
      result: h.resultado,
      studentsInFragility: 0,
      studentsWithResult: h.estudantesComResultado,
    })),
    'LOWEST_PERCENT',
  )

  const porId = new Map(lista.map((h) => [h.id, h]))

  return ordenada.flatMap((o) => {
    const h = porId.get(o.skillId)
    if (!h) return []
    return [
      {
        id: h.id,
        shortCode: h.shortCode,
        referenceCode: h.referenceCode,
        descricao: h.descricao,
        ordem: h.ordem,
        denominadorReferencia: h.denominadorReferencia,
        estudantesComResultado: h.estudantesComResultado,
        acertos: h.acertos,
        itens: h.itens,
        percentual: h.percentual,
        faixa: h.faixa,
      },
    ]
  })
}
