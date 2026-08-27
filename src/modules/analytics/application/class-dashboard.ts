import type { LearningLevel } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { schoolScopeFilter, type AuthContext } from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'
import { aplicarSupressaoNominal, rotuloVersaoRelatorio } from '@/server/nominal-data'
import { formatPercent, toPercent } from '@/lib/decimal'
import { AUSENTE, formatarFracao } from '@/lib/format'
import {
  classifyAnalyticalSkillResult,
  type AnalyticalBand,
} from '@/modules/analytics/domain/classify'
import { calculateStudentPerformance } from '@/modules/analytics/domain/student-performance'
import { sortStudentsByPriority } from '@/modules/analytics/domain/student-priority'
import {
  rankSkillsByFragility,
  type SkillAggregate,
} from '@/modules/analytics/domain/rank-skills'
import {
  contarParticipacao,
  desempenhoGeral,
  desempenhoPorHabilidade,
  distribuicaoPorNivel,
  estudantesEmFragilidadePorHabilidade,
  type FiltrosAnalise,
} from '@/modules/analytics/infra/aggregate-queries'
import {
  carregarFaixasAnaliticas,
  faixasParaExibicao,
  montarMapaDeCalor,
  type ColunaHabilidade,
  type EntradaEstudanteMapa,
  type FaixasParaExibicao,
  type MapaDeCalor,
  type ResultadoDeHabilidade,
} from '@/modules/analytics/application/heatmap'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  DASHBOARD DA TURMA — FR-077 a FR-082
 * ===========================================================================
 *
 * Três invariantes governam este arquivo:
 *
 *  1. **Não avaliado nunca vira zero.** Acertos, itens, percentual e contagens
 *     de habilidade saem `null` para quem não foi avaliado — e o componente os
 *     desenha como travessão. O estudante sai numa lista própria, e em
 *     circunstância alguma entre os de Defasagem (FR-082, FR-093, Const. I e V).
 *
 *  2. **O nível da fonte é transcrito, nunca produzido.** `nivelOriginal` é o
 *     texto recebido no arquivo; `nivelNormalizado` existe apenas para consulta.
 *     A faixa analítica é outra coisa, tem outro nome e outra etiqueta.
 *
 *  3. **A divisão acontece uma vez, aqui, com `Decimal`.** As consultas
 *     agregadas devolvem somas de inteiros; o percentual nasce em
 *     `toPercent` e é formatado por `formatPercent`. Nenhum `Decimal`
 *     atravessa para o componente — só a string já pronta.
 *
 * O escopo por escola vem de `AuthContext`. O `classId` da URL é validado
 * contra ele antes de qualquer agregação: turma de outra rede responde 404, e
 * não uma tela vazia que confirmaria a existência da turma.
 */

export type CabecalhoTurma = Readonly<{
  classId: string
  turmaNome: string
  codigoTurma: string
  anoEscolar: string
  schoolId: string
  escolaNome: string
  escolaCodigo: string
  municipio: string
  estado: string
}>

export type InfoAvaliacao = Readonly<{
  id: string
  nome: string
  ano: number
  ciclo: string
  componenteCurricular: string
}>

export type ParticipacaoDaTurma = Readonly<{
  total: number
  avaliados: number
  naoAvaliados: number
  /** `"91,67%"`, ou travessão quando não há registro algum. */
  taxaTexto: string
}>

export type DistribuicaoPorNivel = Readonly<{
  adequado: number
  intermediario: number
  defasagem: number
  semNivel: number
  totalAvaliados: number
}>

/** Uma linha da tabela de habilidades da turma (FR-080). */
export type HabilidadeDaTurma = Readonly<{
  skillId: string
  shortCode: string
  referenceCode: string
  descricao: string
  /** Posição no ranking, base 1: 1 é a maior fragilidade. */
  posicao: number
  acertos: number | null
  itens: number | null
  fracaoTexto: string
  percentualTexto: string
  faixa: AnalyticalBand | null
  estudantesComResultado: number
  estudantesEmFragilidade: number
}>

/**
 * Uma linha da tabela de estudantes (FR-081).
 *
 * Todo campo de desempenho é anulável **de propósito**: é a única forma de o componente
 * conseguir distinguir "zero acertos" de "não avaliado" sem consultar outra coisa.
 */
export type EstudanteDaTurma = {
  studentId: string
  uniqueCode: string
  /** Já passou por `aplicarSupressaoNominal` quando o requisitante não pode ver nomes. */
  nomeOriginal: string
  avaliado: boolean
  /** Texto bruto da fonte, intocado (Const. III). */
  nivelOriginal: string
  nivelNormalizado: LearningLevel | null
  /** `null` para não avaliado — jamais `0`. */
  acertos: number | null
  itens: number | null
  fracaoTexto: string
  percentualTexto: string
  /** Fração exata, para ordenação por prioridade. `null` é ausência, não zero. */
  performance: MaybeFraction
  /** `null` para não avaliado: ele não tem habilidades a classificar. */
  habilidadesEmFragilidade: number | null
  habilidadesEmAtencao: number | null
}

export type ConteudoDashboard = Readonly<{
  avaliacao: InfoAvaliacao
  participacao: ParticipacaoDaTurma
  desempenho: Readonly<{
    acertos: number | null
    itens: number | null
    fracaoTexto: string
    percentualTexto: string
    faixa: AnalyticalBand | null
  }>
  distribuicao: DistribuicaoPorNivel
  habilidades: readonly HabilidadeDaTurma[]
  habilidadeMaisFragil: HabilidadeDaTurma | null
  habilidadeMelhorDesempenho: HabilidadeDaTurma | null
  /** Ordenados por prioridade: Defasagem → Intermediário → Adequado. */
  estudantesAvaliados: readonly EstudanteDaTurma[]
  /** Lista própria, separada. Nunca misturada aos de Defasagem (FR-082). */
  estudantesNaoAvaliados: readonly EstudanteDaTurma[]
  mapaDeCalor: MapaDeCalor
  faixas: FaixasParaExibicao
  /** Diz ao leitor se está vendo a versão nominal ou a agregada (FR-007a). */
  versaoRelatorio: string
}>

export type DashboardDaTurma = Readonly<{
  turma: CabecalhoTurma
  /** `null` quando a turma ainda não tem nenhuma avaliação com resultados importados. */
  conteudo: ConteudoDashboard | null
}>

/**
 * Lê a turma já dentro do escopo do requisitante.
 *
 * `findFirst` com o escopo embutido no `where`, e não `findUnique` seguido de conferência:
 * a linha de outra escola nunca chega à memória, e a resposta é indistinguível de
 * identificador inexistente — 404, nunca 403 (FR-006).
 */
async function lerTurmaNoEscopo(ctx: AuthContext, classId: string): Promise<CabecalhoTurma> {
  const escopo = schoolScopeFilter(ctx)

  const turma = await prisma.class.findFirst({
    where: { id: classId, schoolId: { in: [...escopo.in] } },
    select: {
      id: true,
      name: true,
      externalCode: true,
      anoEscolar: true,
      schoolId: true,
      school: {
        select: { name: true, code: true, municipio: true, estado: true },
      },
    },
  })

  if (!turma) throw naoEncontrado('Turma')

  return {
    classId: turma.id,
    turmaNome: turma.name,
    codigoTurma: turma.externalCode,
    anoEscolar: turma.anoEscolar,
    schoolId: turma.schoolId,
    escolaNome: turma.school.name,
    escolaCodigo: turma.school.code,
    municipio: turma.school.municipio,
    estado: turma.school.estado,
  }
}

/**
 * Escolhe a avaliação exibida.
 *
 * Sem `assessmentId` na URL, adota a mais recente **que tenha resultados nesta turma** —
 * uma avaliação cadastrada mas nunca importada abriria um painel inteiro de travessões e
 * pareceria falha do sistema.
 */
async function resolverAvaliacao(
  classId: string,
  assessmentId: string | null,
): Promise<InfoAvaliacao | null> {
  const avaliacao = await prisma.assessment.findFirst({
    where: {
      ...(assessmentId ? { id: assessmentId } : {}),
      results: { some: { classId } },
    },
    orderBy: [{ ano: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      nome: true,
      ano: true,
      ciclo: true,
      componenteCurricular: true,
    },
  })

  return avaliacao
}

type LinhaDeResultado = {
  studentId: string
  avaliado: boolean
  nivelOriginal: string
  nivelNormalizado: LearningLevel | null
  acertosTotais: number | null
  itensTotais: number | null
  student: { uniqueCode: string; nomeOriginal: string }
  skillResults: {
    skillId: string
    valorOriginal: string | null
    acertos: number | null
    itensPossiveis: number | null
  }[]
}

/** Fração armazenada pela importação, quando existir. Denominador não positivo é ausência. */
function totaisArmazenados(linha: LinhaDeResultado): MaybeFraction {
  const { acertosTotais, itensTotais } = linha
  if (acertosTotais === null || itensTotais === null) return null
  if (itensTotais <= 0) return null
  return { acertos: acertosTotais, itens: itensTotais }
}

export type DesempenhoFormatado = Readonly<{
  acertos: number | null
  itens: number | null
  fracaoTexto: string
  percentualTexto: string
}>

/** Ponto único de formatação de desempenho da tela. Ausência sai como travessão. */
function formatarDesempenho(fracao: MaybeFraction): DesempenhoFormatado {
  return {
    acertos: fracao === null ? null : fracao.acertos,
    itens: fracao === null ? null : fracao.itens,
    fracaoTexto:
      fracao === null ? AUSENTE : formatarFracao(fracao.acertos, fracao.itens),
    percentualTexto: formatPercent(toPercent(fracao)),
  }
}

/**
 * Dashboard completo da turma.
 *
 * `assessmentId` é filtro de exibição vindo da URL, não autorização — o escopo já foi
 * fechado por `lerTurmaNoEscopo`, e todas as agregações passam por `schoolScopeFilter`
 * novamente dentro de `aggregate-queries`.
 */
export async function obterDashboardDaTurma(
  ctx: AuthContext,
  classId: string,
  assessmentId: string | null = null,
): Promise<DashboardDaTurma> {
  const turma = await lerTurmaNoEscopo(ctx, classId)
  const avaliacao = await resolverAvaliacao(turma.classId, assessmentId)

  if (!avaliacao) return { turma, conteudo: null }

  const faixas = await carregarFaixasAnaliticas()
  const filtros: FiltrosAnalise = {
    assessmentId: avaliacao.id,
    schoolId: turma.schoolId,
    classId: turma.classId,
  }

  const [participacaoBruta, distribuicao, geral, porHabilidade, fragilidadePorHabilidade] =
    await Promise.all([
      contarParticipacao(ctx, filtros),
      distribuicaoPorNivel(ctx, filtros),
      desempenhoGeral(ctx, filtros),
      desempenhoPorHabilidade(ctx, filtros),
      estudantesEmFragilidadePorHabilidade(ctx, filtros, faixas.fragilidadeMaxTexto),
    ])

  const habilidadesDaAvaliacao = await prisma.assessmentSkill.findMany({
    where: { assessmentId: avaliacao.id },
    orderBy: { skill: { ordem: 'asc' } },
    select: {
      skillId: true,
      skill: { select: { shortCode: true, referenceCode: true, descricao: true } },
    },
  })

  const colunas: ColunaHabilidade[] = habilidadesDaAvaliacao.map((h) => ({
    skillId: h.skillId,
    shortCode: h.skill.shortCode,
    referenceCode: h.skill.referenceCode,
    descricao: h.skill.descricao,
  }))

  // ---- Tabela de habilidades da turma (FR-080) -----------------------------
  const agregadas: SkillAggregate[] = colunas.map((coluna) => {
    const soma = porHabilidade.get(coluna.skillId)
    return {
      skillId: coluna.skillId,
      shortCode: coluna.shortCode,
      result: soma ? { acertos: soma.acertos, itens: soma.itens } : null,
      studentsInFragility: fragilidadePorHabilidade.get(coluna.skillId) ?? 0,
      studentsWithResult: soma?.estudantesComResultado ?? 0,
    }
  })

  const porColuna = new Map(colunas.map((c) => [c.skillId, c]))

  const habilidades: HabilidadeDaTurma[] = rankSkillsByFragility(
    agregadas,
    'LOWEST_PERCENT',
  ).map((agregada, indice) => {
    const coluna = porColuna.get(agregada.skillId)
    const formatado = formatarDesempenho(agregada.result)

    return {
      skillId: agregada.skillId,
      shortCode: agregada.shortCode,
      referenceCode: coluna?.referenceCode ?? '',
      descricao: coluna?.descricao ?? '',
      posicao: indice + 1,
      acertos: formatado.acertos,
      itens: formatado.itens,
      fracaoTexto: formatado.fracaoTexto,
      percentualTexto: formatado.percentualTexto,
      faixa: classifyAnalyticalSkillResult(agregada.result, faixas.bands),
      estudantesComResultado: agregada.studentsWithResult,
      estudantesEmFragilidade: agregada.studentsInFragility,
    }
  })

  // Habilidade sem resultado não é "a de melhor desempenho" nem "a mais frágil":
  // ela simplesmente não tem desempenho apurado (Const. I).
  const comResultado = habilidades.filter((h) => h.acertos !== null)
  const habilidadeMaisFragil = comResultado[0] ?? null
  const habilidadeMelhorDesempenho = comResultado[comResultado.length - 1] ?? null

  // ---- Estudantes (FR-081, FR-082) ----------------------------------------
  const escopo = schoolScopeFilter(ctx, turma.schoolId)

  const linhas: LinhaDeResultado[] = await prisma.assessmentStudentResult.findMany({
    where: {
      assessmentId: avaliacao.id,
      classId: turma.classId,
      schoolId: { in: [...escopo.in] },
    },
    select: {
      studentId: true,
      avaliado: true,
      nivelOriginal: true,
      nivelNormalizado: true,
      acertosTotais: true,
      itensTotais: true,
      student: { select: { uniqueCode: true, nomeOriginal: true } },
      skillResults: {
        select: {
          skillId: true,
          valorOriginal: true,
          acertos: true,
          itensPossiveis: true,
        },
      },
    },
  })

  const resultadosPorEstudante = new Map<string, ReadonlyMap<string, ResultadoDeHabilidade>>()

  const estudantes: EstudanteDaTurma[] = linhas.map((linha) => {
    const porSkill = new Map<string, ResultadoDeHabilidade>()
    for (const r of linha.skillResults) {
      porSkill.set(r.skillId, {
        valorOriginal: r.valorOriginal,
        acertos: r.acertos,
        itensPossiveis: r.itensPossiveis,
      })
    }
    resultadosPorEstudante.set(linha.studentId, porSkill)

    // A guarda dupla é intencional: mesmo que a importação tivesse gravado totais para
    // um não avaliado, eles não chegariam à tela como número (Const. I, FR-093).
    const derivada = calculateStudentPerformance(
      linha.skillResults.map((r) =>
        r.acertos === null || r.itensPossiveis === null || r.itensPossiveis <= 0
          ? null
          : { acertos: r.acertos, itens: r.itensPossiveis },
      ),
    )
    const performance = linha.avaliado ? (totaisArmazenados(linha) ?? derivada) : null

    let fragilidade = 0
    let atencao = 0
    if (linha.avaliado) {
      for (const coluna of colunas) {
        const bruto = porSkill.get(coluna.skillId)
        const fracao =
          bruto && bruto.acertos !== null && bruto.itensPossiveis !== null && bruto.itensPossiveis > 0
            ? { acertos: bruto.acertos, itens: bruto.itensPossiveis }
            : null
        const faixa = classifyAnalyticalSkillResult(fracao, faixas.bands)
        if (faixa === 'FRAGILIDADE') fragilidade += 1
        else if (faixa === 'ATENCAO') atencao += 1
      }
    }

    const formatado = formatarDesempenho(performance)

    return {
      studentId: linha.studentId,
      uniqueCode: linha.student.uniqueCode,
      nomeOriginal: linha.student.nomeOriginal,
      avaliado: linha.avaliado,
      nivelOriginal: linha.nivelOriginal,
      nivelNormalizado: linha.avaliado ? linha.nivelNormalizado : null,
      acertos: formatado.acertos,
      itens: formatado.itens,
      fracaoTexto: formatado.fracaoTexto,
      percentualTexto: formatado.percentualTexto,
      performance,
      habilidadesEmFragilidade: linha.avaliado ? fragilidade : null,
      habilidadesEmAtencao: linha.avaliado ? atencao : null,
    }
  })

  // A supressão acontece na fronteira da consulta, não na renderização: esconder a coluna
  // no componente deixaria o nome trafegar até o navegador (FR-007a).
  const semNomesIndevidos = aplicarSupressaoNominal(ctx, estudantes)

  // A ordenação é a da função de domínio, inclusive para os não avaliados — que ela já
  // manda para o fim. A partição só separa em duas listas o que já está ordenado.
  const ordenados = sortStudentsByPriority(semNomesIndevidos)
  const estudantesAvaliados = ordenados.filter((e) => e.avaliado)
  const estudantesNaoAvaliados = ordenados.filter((e) => !e.avaliado)

  const entradasMapa: EntradaEstudanteMapa[] = ordenados.map((e) => ({
    studentId: e.studentId,
    uniqueCode: e.uniqueCode,
    nomeOriginal: e.nomeOriginal,
    avaliado: e.avaliado,
    resultadosPorHabilidade: resultadosPorEstudante.get(e.studentId) ?? new Map(),
  }))

  const desempenhoFormatado = formatarDesempenho(geral)

  return {
    turma,
    conteudo: {
      avaliacao,
      participacao: {
        total: participacaoBruta.total,
        avaliados: participacaoBruta.avaliados,
        naoAvaliados: participacaoBruta.naoAvaliados,
        // Participação é a única métrica cujo denominador inclui os não avaliados
        // (FR-060). A conversão passa por `Decimal` como qualquer outro percentual.
        taxaTexto: formatPercent(
          toPercent(
            participacaoBruta.total > 0
              ? { acertos: participacaoBruta.avaliados, itens: participacaoBruta.total }
              : null,
          ),
        ),
      },
      desempenho: {
        ...desempenhoFormatado,
        faixa: classifyAnalyticalSkillResult(geral, faixas.bands),
      },
      distribuicao,
      habilidades,
      habilidadeMaisFragil,
      habilidadeMelhorDesempenho,
      estudantesAvaliados,
      estudantesNaoAvaliados,
      mapaDeCalor: montarMapaDeCalor({
        habilidades: colunas,
        estudantes: entradasMapa,
        bands: faixas.bands,
      }),
      faixas: faixasParaExibicao(faixas),
      versaoRelatorio: rotuloVersaoRelatorio(ctx),
    },
  }
}
