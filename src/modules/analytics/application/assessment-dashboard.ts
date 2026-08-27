import Decimal from 'decimal.js'
import type { LearningLevel } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { requireUser, type AuthContext } from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'
import { formatPercent, toPercent } from '@/lib/decimal'
import type { MaybeFraction } from '@/modules/imports/domain/types'
import {
  classifyAnalyticalSkillResult,
  type AnalyticalBand,
} from '@/modules/analytics/domain/classify'
import {
  rankSkillsByFragility,
  type RankCriterion,
  type SkillAggregate,
} from '@/modules/analytics/domain/rank-skills'
import {
  contarParticipacao,
  desempenhoGeral,
  desempenhoPorHabilidade,
  desempenhoPorTurma,
  distribuicaoPorNivel,
  estudantesEmFragilidadePorHabilidade,
  type FiltrosAnalise,
} from '@/modules/analytics/infra/aggregate-queries'

/**
 * ===========================================================================
 *  PAINEL GERAL DA AVALIAÇÃO — FR-066 a FR-073
 * ===========================================================================
 *
 * Camada de composição: **não** agrega nada por conta própria. Toda soma vem de
 * `aggregate-queries`, que é onde vive a regra `avaliado = true` para desempenho e a sua
 * ausência deliberada na participação (FR-059, FR-060). Reimplementar uma dessas somas aqui
 * seria criar um segundo lugar onde o filtro pode ser esquecido.
 *
 * O que esta camada faz, e só:
 *
 *  1. chama as consultas prontas com o mesmo recorte;
 *  2. converte fração → percentual **uma única vez**, com `toPercent` (`Decimal`), e formata
 *     com `formatPercent` — nenhum percentual é calculado com `number` (Const. II);
 *  3. entrega numerador e denominador ao lado de cada percentual, para que a tela possa
 *     mostrar a procedência do número (regra do `IndicatorCard`);
 *  4. ordena as habilidades por `rankSkillsByFragility`, função pura de domínio.
 *
 * Ausência continua ausência do começo ao fim: `percentual === null` e
 * `percentualFormatado === '—'`. Em nenhum ponto um denominador zero vira `0%`.
 */

// ---------------------------------------------------------------------------
// Configuração analítica vigente
// ---------------------------------------------------------------------------

export type ConfiguracaoAnalitica = Readonly<{
  versao: number
  /** Limite superior exclusivo de FRAGILIDADE, em pontos percentuais. */
  fragilidadeMax: Decimal
  /** Limite superior exclusivo de ATENÇÃO, em pontos percentuais. */
  atencaoMax: Decimal
  fragilidadeMaxTexto: string
  atencaoMaxTexto: string
  /** FR-073 — a visão "Abaixo do adequado" é opcional e configurável. */
  abaixoDoAdequadoHabilitado: boolean
  baixoRendimento: readonly LearningLevel[]
}>

/** Aceita apenas literal numérico simples: o valor é interpolado em SQL bruto a jusante. */
const NUMERICO_SEGURO = /^\d{1,3}(\.\d{1,4})?$/

/**
 * Lê a configuração vigente — a de maior `version`.
 *
 * Não existe valor padrão no código, de propósito (FR-111): os limites das faixas analíticas
 * são decisão da rede, versionada em `AnalyticalSettings`. Uma constante de emergência aqui
 * seria exatamente o hardcode que a constituição proíbe, com o agravante de ninguém perceber
 * que o painel deixou de obedecer à configuração.
 */
export async function lerConfiguracaoVigente(): Promise<ConfiguracaoAnalitica> {
  const registro = await prisma.analyticalSettings.findFirst({
    orderBy: { version: 'desc' },
  })

  if (!registro) {
    throw new Error(
      'Configuração analítica ausente: nenhuma versão de AnalyticalSettings foi registrada. ' +
        'Os limites das faixas vêm sempre da configuração (FR-111) e não têm padrão no código.',
    )
  }

  const fragilidadeMaxTexto = registro.fragilidadeMax.toString()
  const atencaoMaxTexto = registro.atencaoMax.toString()

  if (
    !NUMERICO_SEGURO.test(fragilidadeMaxTexto) ||
    !NUMERICO_SEGURO.test(atencaoMaxTexto)
  ) {
    throw new Error(
      `Configuração analítica versão ${registro.version} tem limite fora do formato numérico esperado.`,
    )
  }

  return {
    versao: registro.version,
    fragilidadeMax: new Decimal(fragilidadeMaxTexto),
    atencaoMax: new Decimal(atencaoMaxTexto),
    fragilidadeMaxTexto,
    atencaoMaxTexto,
    abaixoDoAdequadoHabilitado: registro.abaixoDoAdequadoHabilitado,
    baixoRendimento: registro.baixoRendimento,
  }
}

// ---------------------------------------------------------------------------
// Critérios de ordenação do ranking (FR-072)
// ---------------------------------------------------------------------------

export type OpcaoCriterio = Readonly<{
  valor: RankCriterion
  rotulo: string
  explicacao: string
}>

/**
 * Os quatro critérios de `RankCriterion`, com o texto que a tela precisa exibir.
 *
 * O critério ativo é sempre mostrado por extenso: um ranking cuja regra de ordenação não
 * aparece na tela convida à leitura errada — "H07 é a pior" só faz sentido acompanhado de
 * "pior em quê".
 */
export const CRITERIOS_RANKING = [
  {
    valor: 'LOWEST_PERCENT',
    rotulo: 'Menor percentual de acerto',
    explicacao: 'Da habilidade com menor Σ acertos ÷ Σ itens para a maior.',
  },
  {
    valor: 'FRAGILITY_RATE',
    rotulo: 'Maior proporção de estudantes em fragilidade',
    explicacao:
      'Da maior para a menor fatia de estudantes classificados na faixa Fragilidade.',
  },
  {
    valor: 'FRAGILITY_COUNT',
    rotulo: 'Maior número de estudantes em fragilidade',
    explicacao: 'Da maior para a menor quantidade absoluta de estudantes em Fragilidade.',
  },
  {
    valor: 'POINTS_LOST',
    rotulo: 'Maior perda de itens possíveis',
    explicacao: 'Da maior para a menor diferença Σ itens − Σ acertos.',
  },
] as const satisfies readonly OpcaoCriterio[]

const CRITERIO_PADRAO: RankCriterion = 'LOWEST_PERCENT'

/** Converte um valor vindo da barra de endereços em critério válido. Nunca lança. */
export function normalizarCriterio(valor: unknown): RankCriterion {
  if (typeof valor !== 'string') return CRITERIO_PADRAO
  const encontrado = CRITERIOS_RANKING.find((c) => c.valor === valor)
  return encontrado ? encontrado.valor : CRITERIO_PADRAO
}

export function rotuloDoCriterio(criterio: RankCriterion): string {
  const encontrado = CRITERIOS_RANKING.find((c) => c.valor === criterio)
  return encontrado ? encontrado.rotulo : criterio
}

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

/** Percentual derivado de uma fração, com os dois inteiros que o originaram. */
export type Percentual = Readonly<{
  numerador: number | null
  denominador: number | null
  percentual: Decimal | null
  percentualFormatado: string
}>

export type ParticipacaoPainel = Readonly<{
  total: number
  avaliados: number
  naoAvaliados: number
  taxa: Percentual
}>

export type ChaveNivel = 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | 'SEM_NIVEL'

export type LinhaDistribuicao = Readonly<{
  chave: ChaveNivel
  rotulo: string
  quantidade: number
  proporcao: Percentual
}>

export type DistribuicaoPainel = Readonly<{
  /** Denominador da distribuição: SOMENTE avaliados, jamais o total importado (FR-062). */
  totalAvaliados: number
  linhas: readonly LinhaDistribuicao[]
  /** FR-073 — agrupamento analítico opcional: Defasagem + Intermediário. */
  abaixoDoAdequado: Readonly<{
    habilitadoNaConfiguracao: boolean
    componentes: readonly string[]
    quantidade: number
    proporcao: Percentual
  }>
}>

export type LinhaHabilidade = Readonly<{
  posicao: number
  skillId: string
  shortCode: string
  referenceCode: string
  descricao: string
  acertos: number | null
  itens: number | null
  percentual: Decimal | null
  percentualFormatado: string
  faixa: AnalyticalBand | null
  estudantesComResultado: number
  estudantesEmFragilidade: number
  fragilidadeFormatada: string
}>

export type LinhaTurma = Readonly<{
  classId: string
  nome: string
  externalCode: string
  anoEscolar: string
  escolaId: string
  escolaNome: string
  total: number
  avaliados: number
  naoAvaliados: number
  desempenho: Percentual
  defasagem: number
  proporcaoDefasagem: Percentual
}>

export type PainelAvaliacao = Readonly<{
  avaliacao: Readonly<{
    id: string
    nome: string
    ano: number
    ciclo: string
    componenteCurricular: string
    dataAplicacao: Date | null
  }>
  configuracao: ConfiguracaoAnalitica
  criterio: RankCriterion
  criterioRotulo: string
  participacao: ParticipacaoPainel
  desempenhoGeral: Percentual
  distribuicao: DistribuicaoPainel
  habilidades: readonly LinhaHabilidade[]
  habilidadeMaisFragil: LinhaHabilidade | null
  habilidadeMelhorDesempenho: LinhaHabilidade | null
  turmasPorMenorDesempenho: readonly LinhaTurma[]
  turmasPorMaiorDefasagem: readonly LinhaTurma[]
}>

export type ParametrosPainelAvaliacao = Readonly<{
  assessmentId: string
  schoolId?: string | null
  classId?: string | null
  criterio?: RankCriterion
}>

// ---------------------------------------------------------------------------
// Derivações de percentual — o único lugar onde a divisão acontece
// ---------------------------------------------------------------------------

/** Fração válida ou `null`. Denominador não positivo é ausência, nunca zero por cento. */
function fracao(numerador: number, denominador: number): MaybeFraction {
  if (denominador <= 0) return null
  return { acertos: numerador, itens: denominador }
}

function derivar(f: MaybeFraction): Percentual {
  const percentual = toPercent(f)
  return {
    numerador: f === null ? null : f.acertos,
    denominador: f === null ? null : f.itens,
    percentual,
    percentualFormatado: formatPercent(percentual),
  }
}

function derivarContagem(numerador: number, denominador: number): Percentual {
  return derivar(fracao(numerador, denominador))
}

/**
 * Compara duas frações sem dividir: `a₁/b₁ < a₂/b₂ ⟺ a₁·b₂ < a₂·b₁`.
 * Ausência vai sempre para o fim — não é o menor desempenho, é a falta dele (Const. I).
 */
function compararFracoes(a: MaybeFraction, b: MaybeFraction): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return new Decimal(a.acertos)
    .times(b.itens)
    .comparedTo(new Decimal(b.acertos).times(a.itens))
}

const ROTULO_NIVEL: Record<ChaveNivel, string> = {
  ADEQUADO: 'Adequado',
  INTERMEDIARIO: 'Intermediário',
  DEFASAGEM: 'Defasagem',
  SEM_NIVEL: 'Sem nível informado na fonte',
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export async function obterPainelAvaliacao(
  ctx: AuthContext,
  params: ParametrosPainelAvaliacao,
): Promise<PainelAvaliacao> {
  requireUser(ctx)

  const avaliacao = await prisma.assessment.findUnique({
    where: { id: params.assessmentId },
    select: {
      id: true,
      nome: true,
      ano: true,
      ciclo: true,
      componenteCurricular: true,
      dataAplicacao: true,
    },
  })
  if (!avaliacao) throw naoEncontrado('Avaliação')

  const configuracao = await lerConfiguracaoVigente()
  const criterio = params.criterio ?? CRITERIO_PADRAO

  // Um único recorte alimenta todas as consultas: participação e desempenho precisam
  // enxergar exatamente o mesmo universo, ou a diferença entre elas deixa de significar
  // "quem não foi avaliado".
  const filtros: FiltrosAnalise = {
    assessmentId: params.assessmentId,
    schoolId: params.schoolId ?? null,
    classId: params.classId ?? null,
  }

  const [
    participacaoBruta,
    geral,
    distribuicaoBruta,
    porHabilidade,
    emFragilidade,
    porTurma,
  ] = await Promise.all([
    contarParticipacao(ctx, filtros),
    desempenhoGeral(ctx, filtros),
    distribuicaoPorNivel(ctx, filtros),
    desempenhoPorHabilidade(ctx, filtros),
    estudantesEmFragilidadePorHabilidade(ctx, filtros, configuracao.fragilidadeMaxTexto),
    desempenhoPorTurma(ctx, filtros),
  ])

  const participacao: ParticipacaoPainel = {
    total: participacaoBruta.total,
    avaliados: participacaoBruta.avaliados,
    naoAvaliados: participacaoBruta.naoAvaliados,
    // Denominador da participação é TODO registro importado — os não avaliados entram aqui,
    // e só aqui (FR-060, FR-061).
    taxa: derivarContagem(participacaoBruta.avaliados, participacaoBruta.total),
  }

  const distribuicao = montarDistribuicao(distribuicaoBruta, configuracao)

  const habilidades = await montarRankingHabilidades({
    assessmentId: params.assessmentId,
    porHabilidade,
    emFragilidade,
    configuracao,
    criterio,
  })

  // Mais frágil e melhor desempenho são sempre por percentual de acerto, independentemente
  // do critério escolhido para o ranking: são leituras de desempenho, não de ordenação.
  const porPercentual = [...habilidades].sort((a, b) =>
    compararFracoes(fracaoDaLinha(a), fracaoDaLinha(b)),
  )
  const comResultado = porPercentual.filter((h) => h.percentual !== null)

  const turmas = await montarTurmas(ctx, filtros, porTurma)

  return {
    avaliacao,
    configuracao,
    criterio,
    criterioRotulo: rotuloDoCriterio(criterio),
    participacao,
    desempenhoGeral: derivar(geral),
    distribuicao,
    habilidades,
    habilidadeMaisFragil: comResultado[0] ?? null,
    habilidadeMelhorDesempenho: comResultado[comResultado.length - 1] ?? null,
    turmasPorMenorDesempenho: [...turmas].sort(
      (a, b) =>
        compararFracoes(
          fracao(a.desempenho.numerador ?? 0, a.desempenho.denominador ?? 0),
          fracao(b.desempenho.numerador ?? 0, b.desempenho.denominador ?? 0),
        ) || a.nome.localeCompare(b.nome, 'pt-BR'),
    ),
    turmasPorMaiorDefasagem: [...turmas].sort(
      (a, b) =>
        compararFracoes(
          fracao(
            b.proporcaoDefasagem.numerador ?? 0,
            b.proporcaoDefasagem.denominador ?? 0,
          ),
          fracao(
            a.proporcaoDefasagem.numerador ?? 0,
            a.proporcaoDefasagem.denominador ?? 0,
          ),
        ) || a.nome.localeCompare(b.nome, 'pt-BR'),
    ),
  }
}

function fracaoDaLinha(linha: LinhaHabilidade): MaybeFraction {
  if (linha.acertos === null || linha.itens === null) return null
  return fracao(linha.acertos, linha.itens)
}

// ---------------------------------------------------------------------------
// Distribuição por nível — FR-062, FR-069, FR-073
// ---------------------------------------------------------------------------

function montarDistribuicao(
  bruta: {
    adequado: number
    intermediario: number
    defasagem: number
    semNivel: number
    totalAvaliados: number
  },
  configuracao: ConfiguracaoAnalitica,
): DistribuicaoPainel {
  const total = bruta.totalAvaliados

  const quantidades: Record<ChaveNivel, number> = {
    ADEQUADO: bruta.adequado,
    INTERMEDIARIO: bruta.intermediario,
    DEFASAGEM: bruta.defasagem,
    SEM_NIVEL: bruta.semNivel,
  }

  const chaves: readonly ChaveNivel[] = [
    'ADEQUADO',
    'INTERMEDIARIO',
    'DEFASAGEM',
    'SEM_NIVEL',
  ]

  const linhas = chaves.map<LinhaDistribuicao>((chave) => ({
    chave,
    rotulo: ROTULO_NIVEL[chave],
    quantidade: quantidades[chave],
    // Denominador é o total de AVALIADOS. O não avaliado não está aqui nem como Defasagem
    // nem como categoria própria: ele não tem nível, e forçá-lo a uma seria inventá-la.
    proporcao: derivarContagem(quantidades[chave], total),
  }))

  const abaixo = bruta.defasagem + bruta.intermediario

  return {
    totalAvaliados: total,
    linhas,
    abaixoDoAdequado: {
      habilitadoNaConfiguracao: configuracao.abaixoDoAdequadoHabilitado,
      componentes: [ROTULO_NIVEL.DEFASAGEM, ROTULO_NIVEL.INTERMEDIARIO],
      quantidade: abaixo,
      proporcao: derivarContagem(abaixo, total),
    },
  }
}

// ---------------------------------------------------------------------------
// Ranking de habilidades — FR-070 a FR-072
// ---------------------------------------------------------------------------

async function montarRankingHabilidades(entrada: {
  assessmentId: string
  porHabilidade: Map<
    string,
    { acertos: number; itens: number; estudantesComResultado: number }
  >
  emFragilidade: Map<string, number>
  configuracao: ConfiguracaoAnalitica
  criterio: RankCriterion
}): Promise<readonly LinhaHabilidade[]> {
  const { assessmentId, porHabilidade, emFragilidade, configuracao, criterio } = entrada

  // O catálogo da avaliação vem de `AssessmentSkill`; antes da primeira importação ele está
  // vazio e o catálogo global assume, para que o ranking apareça completo (H01:H12) com
  // travessão em vez de simplesmente sumir.
  const daAvaliacao = await prisma.assessmentSkill.findMany({
    where: { assessmentId },
    select: {
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

  const catalogo =
    daAvaliacao.length > 0
      ? daAvaliacao.map((a) => a.skill)
      : await prisma.skill.findMany({
          select: {
            id: true,
            shortCode: true,
            referenceCode: true,
            descricao: true,
            ordem: true,
          },
        })

  const agregados: SkillAggregate[] = catalogo.map((skill) => {
    const soma = porHabilidade.get(skill.id)
    return {
      skillId: skill.id,
      shortCode: skill.shortCode,
      result: soma ? fracao(soma.acertos, soma.itens) : null,
      studentsInFragility: emFragilidade.get(skill.id) ?? 0,
      studentsWithResult: soma?.estudantesComResultado ?? 0,
    }
  })

  const metadados = new Map(catalogo.map((s) => [s.id, s]))
  const bandas = {
    fragilidadeMax: configuracao.fragilidadeMax,
    atencaoMax: configuracao.atencaoMax,
  }

  return rankSkillsByFragility(agregados, criterio).map<LinhaHabilidade>(
    (agregado, indice) => {
      const meta = metadados.get(agregado.skillId)
      const percentual = toPercent(agregado.result)
      const proporcaoFragilidade = derivarContagem(
        agregado.studentsInFragility,
        agregado.studentsWithResult,
      )

      return {
        posicao: indice + 1,
        skillId: agregado.skillId,
        shortCode: agregado.shortCode,
        referenceCode: meta?.referenceCode ?? '',
        descricao: meta?.descricao ?? '',
        acertos: agregado.result === null ? null : agregado.result.acertos,
        itens: agregado.result === null ? null : agregado.result.itens,
        percentual,
        percentualFormatado: formatPercent(percentual),
        faixa: classifyAnalyticalSkillResult(agregado.result, bandas),
        estudantesComResultado: agregado.studentsWithResult,
        estudantesEmFragilidade: agregado.studentsInFragility,
        fragilidadeFormatada: proporcaoFragilidade.percentualFormatado,
      }
    },
  )
}

// ---------------------------------------------------------------------------
// Ranking de turmas
// ---------------------------------------------------------------------------

async function montarTurmas(
  ctx: AuthContext,
  filtros: FiltrosAnalise,
  porTurma: Map<
    string,
    { acertos: number; itens: number; avaliados: number; total: number }
  >,
): Promise<readonly LinhaTurma[]> {
  const ids = [...porTurma.keys()]
  if (ids.length === 0) return []

  const turmas = await prisma.class.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      externalCode: true,
      anoEscolar: true,
      school: { select: { id: true, name: true } },
    },
  })

  // A contagem de Defasagem por turma reaproveita `distribuicaoPorNivel` — uma chamada por
  // turma. É uma consulta a mais por turma, e é o preço consciente de não escrever aqui uma
  // segunda agregação que poderia esquecer `avaliado: true` e rebaixar a turma inteira.
  const distribuicoes = await Promise.all(
    turmas.map(async (turma) => ({
      classId: turma.id,
      distribuicao: await distribuicaoPorNivel(ctx, { ...filtros, classId: turma.id }),
    })),
  )
  const defasagemPorTurma = new Map(
    distribuicoes.map((d) => [d.classId, d.distribuicao.defasagem]),
  )

  return turmas.map<LinhaTurma>((turma) => {
    const soma = porTurma.get(turma.id)
    const avaliados = soma?.avaliados ?? 0
    const total = soma?.total ?? 0
    const defasagem = defasagemPorTurma.get(turma.id) ?? 0

    return {
      classId: turma.id,
      nome: turma.name,
      externalCode: turma.externalCode,
      anoEscolar: turma.anoEscolar,
      escolaId: turma.school.id,
      escolaNome: turma.school.name,
      total,
      avaliados,
      naoAvaliados: total - avaliados,
      desempenho: derivar(fracao(soma?.acertos ?? 0, soma?.itens ?? 0)),
      defasagem,
      // Denominador da Defasagem é o de avaliados da turma, coerente com FR-062.
      proporcaoDefasagem: derivarContagem(defasagem, avaliados),
    }
  })
}
