import Decimal from 'decimal.js'

import { prisma } from '@/server/prisma'
import type { MaybeFraction } from '@/modules/imports/domain/types'
import { classifyAnalyticalSkillResult } from '@/modules/analytics/domain/classify'
import {
  rankSkillsByFragility,
  type SkillAggregate,
} from '@/modules/analytics/domain/rank-skills'
import { ROTULO_FAIXA } from '@/modules/analytics/application/heatmap'
import {
  contarParticipacao,
  desempenhoGeral,
  desempenhoPorHabilidade,
  desempenhoPorTurma,
  distribuicaoPorNivel,
  estudantesEmFragilidadePorHabilidade,
} from '@/modules/analytics/infra/aggregate-queries'
import {
  CELULA_AUSENTE,
  COLUNAS_RESUMO,
  celulaFracao,
  celulaInteiro,
  celulaPercentual,
  celulaTexto,
  coluna,
  fracaoOuAusencia,
  linhaResumo,
  nomeDeArquivo,
  secao,
  type Celula,
  type RelatorioMontado,
  type SecaoRelatorio,
} from '@/modules/reports/domain/report-header'
import {
  listarEstudantesDoRecorte,
  type EstudanteDoRelatorio,
} from './nominal-authorization'
import type { EscopoRelatorio } from './report-scope'

/**
 * ===========================================================================
 *  RELATÓRIO GERAL DA AVALIAÇÃO — FR-102, FR-104, FR-107
 * ===========================================================================
 *
 * Este arquivo é, além do relatório geral, a **caixa de peças** dos relatórios de escola
 * e de turma: as seções de participação, distribuição, desempenho, ranking de habilidades
 * e comparação de turmas nascem aqui e são reaproveitadas com outro recorte. Não existe
 * uma segunda implementação de "distribuição por nível" no módulo de relatórios; se
 * existisse, ela divergiria da primeira no primeiro ajuste de regra feito só em uma delas.
 *
 * **Nenhuma soma acontece aqui.** Todas vêm de `aggregate-queries`, exatamente as mesmas
 * funções que alimentam a tela — é isso, e não uma convenção de revisão, que faz FR-107
 * valer. Este arquivo só converte fração em percentual, uma vez, com `Decimal`, e formata
 * com `formatPercent`.
 *
 * Const. I e V atravessam cada seção: o não avaliado aparece na participação, fica fora
 * de todo denominador de desempenho, e nunca é contado como Defasagem.
 */

// ---------------------------------------------------------------------------
// Seções compartilhadas
// ---------------------------------------------------------------------------

/**
 * PARTICIPAÇÃO — FR-061.
 *
 * A única seção cujo denominador inclui os não avaliados. É a contrapartida exata da
 * regra que os mantém fora de todo o resto (Const. V).
 */
export async function secaoParticipacao(
  escopo: EscopoRelatorio,
): Promise<SecaoRelatorio> {
  const { total, avaliados, naoAvaliados } = await contarParticipacao(
    escopo.ctx,
    escopo.filtros,
  )

  return secao({
    id: 'participacao',
    titulo: 'Participação',
    descricao:
      'Denominador: todos os registros importados no recorte, inclusive os não avaliados.',
    colunas: COLUNAS_RESUMO,
    linhas: [
      linhaResumo('Estudantes no recorte', celulaInteiro(total)),
      linhaResumo('Avaliados', celulaInteiro(avaliados)),
      linhaResumo('Não avaliados', celulaInteiro(naoAvaliados)),
      linhaResumo(
        'Taxa de participação',
        celulaPercentual(fracaoOuAusencia(avaliados, total)),
      ),
    ],
    nota: 'Os não avaliados entram apenas nesta seção; em nenhum denominador de desempenho.',
  })
}

const ROTULO_NIVEL = {
  ADEQUADO: 'Adequado',
  INTERMEDIARIO: 'Intermediário',
  DEFASAGEM: 'Defasagem',
  SEM_NIVEL: 'Sem nível informado na fonte',
} as const

/**
 * DISTRIBUIÇÃO POR NÍVEL — FR-062.
 *
 * Os rótulos reproduzem o `Nível de aprendizagem` **da fonte**, que o sistema jamais
 * produz, infere ou corrige (Const. III). As faixas analíticas são outra coisa, com outro
 * nome, e aparecem nas seções de habilidade.
 */
export async function secaoDistribuicao(
  escopo: EscopoRelatorio,
): Promise<SecaoRelatorio> {
  const d = await distribuicaoPorNivel(escopo.ctx, escopo.filtros)

  const linha = (rotulo: string, quantidade: number): readonly Celula[] => [
    celulaTexto(rotulo),
    celulaInteiro(quantidade),
    celulaPercentual(fracaoOuAusencia(quantidade, d.totalAvaliados)),
  ]

  return secao({
    id: 'distribuicao',
    titulo: 'Distribuição por nível de aprendizagem (valor da fonte)',
    descricao: `Denominador: ${d.totalAvaliados} estudante(s) avaliado(s).`,
    colunas: [
      coluna('nivel', 'Nível de aprendizagem'),
      coluna('quantidade', 'Estudantes', true),
      coluna('proporcao', '% dos avaliados', true),
    ],
    linhas: [
      linha(ROTULO_NIVEL.ADEQUADO, d.adequado),
      linha(ROTULO_NIVEL.INTERMEDIARIO, d.intermediario),
      linha(ROTULO_NIVEL.DEFASAGEM, d.defasagem),
      linha(ROTULO_NIVEL.SEM_NIVEL, d.semNivel),
    ],
    nota:
      'Estudantes não avaliados não aparecem nesta distribuição: eles não têm nível, e ' +
      'atribuir-lhes um seria inventá-lo.',
  })
}

/** DESEMPENHO GERAL — FR-056, FR-057. `Σ acertos ÷ Σ itens`, nunca média de percentuais. */
export async function secaoDesempenho(escopo: EscopoRelatorio): Promise<SecaoRelatorio> {
  const geral = await desempenhoGeral(escopo.ctx, escopo.filtros)
  const faixa = classifyAnalyticalSkillResult(geral, escopo.faixas.bands)

  return secao({
    id: 'desempenho',
    titulo: 'Desempenho geral',
    descricao: 'Cálculo: soma dos acertos dividida pela soma dos itens possíveis.',
    colunas: COLUNAS_RESUMO,
    linhas: [
      linhaResumo(
        'Soma dos acertos',
        celulaInteiro(geral === null ? null : geral.acertos),
      ),
      linhaResumo(
        'Soma dos itens possíveis',
        celulaInteiro(geral === null ? null : geral.itens),
      ),
      linhaResumo('Acertos / itens', celulaFracao(geral)),
      linhaResumo('Percentual geral de acerto', celulaPercentual(geral)),
      linhaResumo(
        'Faixa analítica do sistema',
        faixa === null ? CELULA_AUSENTE : celulaTexto(ROTULO_FAIXA[faixa]),
      ),
    ],
    nota: 'Restrito aos estudantes avaliados (FR-059).',
  })
}

type SkillDoCatalogo = {
  id: string
  shortCode: string
  referenceCode: string
  descricao: string
}

/**
 * Catálogo de habilidades da avaliação.
 *
 * Vem de `AssessmentSkill`; antes da primeira importação ele está vazio, e então o
 * catálogo global assume para que o ranking apareça completo com travessão em vez de
 * simplesmente sumir. É a mesma decisão do painel — e por isso o relatório mostra as
 * mesmas linhas que a tela.
 */
async function catalogoDeHabilidades(assessmentId: string): Promise<SkillDoCatalogo[]> {
  const daAvaliacao = await prisma.assessmentSkill.findMany({
    where: { assessmentId },
    orderBy: { skill: { ordem: 'asc' } },
    select: {
      skill: {
        select: { id: true, shortCode: true, referenceCode: true, descricao: true },
      },
    },
  })

  if (daAvaliacao.length > 0) return daAvaliacao.map((a) => a.skill)

  return prisma.skill.findMany({
    orderBy: { ordem: 'asc' },
    select: { id: true, shortCode: true, referenceCode: true, descricao: true },
  })
}

/** RANKING DE HABILIDADES — FR-070 a FR-072. Ordenado da maior fragilidade para a menor. */
export async function secaoRankingHabilidades(
  escopo: EscopoRelatorio,
): Promise<SecaoRelatorio> {
  const [catalogo, porHabilidade, emFragilidade] = await Promise.all([
    catalogoDeHabilidades(escopo.avaliacao.id),
    desempenhoPorHabilidade(escopo.ctx, escopo.filtros),
    estudantesEmFragilidadePorHabilidade(
      escopo.ctx,
      escopo.filtros,
      escopo.faixas.fragilidadeMaxTexto,
    ),
  ])

  const agregados: SkillAggregate[] = catalogo.map((skill) => {
    const soma = porHabilidade.get(skill.id)
    return {
      skillId: skill.id,
      shortCode: skill.shortCode,
      result: soma ? fracaoOuAusencia(soma.acertos, soma.itens) : null,
      studentsInFragility: emFragilidade.get(skill.id) ?? 0,
      studentsWithResult: soma?.estudantesComResultado ?? 0,
    }
  })

  const metadados = new Map(catalogo.map((s) => [s.id, s]))

  const linhas = rankSkillsByFragility(agregados, escopo.criterio).map(
    (agregado, indice): readonly Celula[] => {
      const meta = metadados.get(agregado.skillId)
      const faixa = classifyAnalyticalSkillResult(agregado.result, escopo.faixas.bands)

      return [
        celulaInteiro(indice + 1),
        celulaTexto(agregado.shortCode),
        celulaTexto(meta?.referenceCode ?? null),
        celulaTexto(meta?.descricao ?? null),
        celulaInteiro(agregado.result === null ? null : agregado.result.acertos),
        celulaInteiro(agregado.result === null ? null : agregado.result.itens),
        celulaPercentual(agregado.result),
        faixa === null ? CELULA_AUSENTE : celulaTexto(ROTULO_FAIXA[faixa]),
        celulaInteiro(agregado.studentsWithResult),
        celulaInteiro(agregado.studentsInFragility),
      ]
    },
  )

  return secao({
    id: 'habilidades',
    titulo: 'Ranking de habilidades',
    descricao: `Critério de ordenação: ${escopo.criterio}. Posição 1 é a maior fragilidade.`,
    colunas: [
      coluna('posicao', 'Posição', true),
      coluna('codigo', 'Habilidade'),
      coluna('referencia', 'Código de referência'),
      coluna('descricao', 'Descrição'),
      coluna('acertos', 'Σ acertos', true),
      coluna('itens', 'Σ itens possíveis', true),
      coluna('percentual', '% de acerto', true),
      coluna('faixa', 'Faixa analítica do sistema'),
      coluna('comResultado', 'Estudantes com resultado', true),
      coluna('fragilidade', 'Estudantes em Fragilidade', true),
    ],
    linhas,
    nota:
      'A faixa analítica é categoria do sistema, configurável, e não substitui o ' +
      '`Nível de aprendizagem` da fonte.',
  })
}

/** Compara duas frações sem dividir. Ausência vai para o fim: não é o pior, é a falta. */
function compararFracoes(a: MaybeFraction, b: MaybeFraction): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return new Decimal(a.acertos)
    .times(b.itens)
    .comparedTo(new Decimal(b.acertos).times(a.itens))
}

export type LinhaDeTurma = Readonly<{
  classId: string
  nome: string
  externalCode: string
  anoEscolar: string
  escolaNome: string
  total: number
  avaliados: number
  naoAvaliados: number
  desempenho: MaybeFraction
  defasagem: number
}>

/** Turmas do recorte com seus totais, ordenadas do menor desempenho para o maior. */
export async function turmasDoRecorte(
  escopo: EscopoRelatorio,
): Promise<readonly LinhaDeTurma[]> {
  const porTurma = await desempenhoPorTurma(escopo.ctx, escopo.filtros)
  const ids = [...porTurma.keys()]
  if (ids.length === 0) return []

  const turmas = await prisma.class.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      externalCode: true,
      anoEscolar: true,
      school: { select: { name: true } },
    },
  })

  // Uma chamada de `distribuicaoPorNivel` por turma, e não uma agregação nova escrita
  // aqui: é uma consulta a mais por turma, e é o preço consciente de não criar um segundo
  // lugar onde `avaliado: true` possa ser esquecido.
  const defasagens = await Promise.all(
    turmas.map(async (t) => ({
      classId: t.id,
      defasagem: (
        await distribuicaoPorNivel(escopo.ctx, { ...escopo.filtros, classId: t.id })
      ).defasagem,
    })),
  )
  const porDefasagem = new Map(defasagens.map((d) => [d.classId, d.defasagem]))

  const linhas = turmas.map<LinhaDeTurma>((t) => {
    const soma = porTurma.get(t.id)
    const avaliados = soma?.avaliados ?? 0
    const total = soma?.total ?? 0

    return {
      classId: t.id,
      nome: t.name,
      externalCode: t.externalCode,
      anoEscolar: t.anoEscolar,
      escolaNome: t.school.name,
      total,
      avaliados,
      naoAvaliados: total - avaliados,
      desempenho: fracaoOuAusencia(soma?.acertos ?? null, soma?.itens ?? null),
      defasagem: porDefasagem.get(t.id) ?? 0,
    }
  })

  return [...linhas].sort(
    (a, b) =>
      compararFracoes(a.desempenho, b.desempenho) ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  )
}

/** COMPARAÇÃO DE TURMAS — FR-071. */
export async function secaoComparacaoTurmas(
  escopo: EscopoRelatorio,
): Promise<SecaoRelatorio> {
  const turmas = await turmasDoRecorte(escopo)

  const linhas = turmas.map((t): readonly Celula[] => [
    celulaTexto(t.nome),
    celulaTexto(t.externalCode),
    celulaTexto(t.escolaNome),
    celulaTexto(t.anoEscolar),
    celulaInteiro(t.total),
    celulaInteiro(t.avaliados),
    celulaInteiro(t.naoAvaliados),
    celulaInteiro(t.desempenho === null ? null : t.desempenho.acertos),
    celulaInteiro(t.desempenho === null ? null : t.desempenho.itens),
    celulaPercentual(t.desempenho),
    celulaInteiro(t.defasagem),
    celulaPercentual(fracaoOuAusencia(t.defasagem, t.avaliados)),
  ])

  return secao({
    id: 'turmas',
    titulo: 'Comparação de turmas',
    descricao: 'Ordenadas do menor para o maior percentual de acerto.',
    colunas: [
      coluna('turma', 'Turma'),
      coluna('codigo', 'Código da turma'),
      coluna('escola', 'Escola'),
      coluna('ano', 'Ano escolar'),
      coluna('total', 'Estudantes', true),
      coluna('avaliados', 'Avaliados', true),
      coluna('naoAvaliados', 'Não avaliados', true),
      coluna('acertos', 'Σ acertos', true),
      coluna('itens', 'Σ itens possíveis', true),
      coluna('percentual', '% de acerto', true),
      coluna('defasagem', 'Em Defasagem', true),
      coluna('proporcaoDefasagem', '% em Defasagem', true),
    ],
    linhas,
    nota: 'O percentual da turma exclui os não avaliados do numerador e do denominador.',
  })
}

export const COLUNAS_ESTUDANTE = [
  coluna('codigo', 'Código único'),
  coluna('estudante', 'Estudante'),
  coluna('turma', 'Turma'),
  coluna('nivel', 'Nível de aprendizagem (fonte)'),
  coluna('acertos', 'Acertos', true),
  coluna('itens', 'Itens possíveis', true),
  coluna('percentual', '% de acerto', true),
] as const

/** Uma linha de estudante. O nome já chegou suprimido quando for o caso (FR-007a). */
export function linhaDeEstudante(e: EstudanteDoRelatorio): readonly Celula[] {
  return [
    celulaTexto(e.uniqueCode),
    celulaTexto(e.nomeOriginal),
    celulaTexto(e.turmaNome),
    celulaTexto(e.nivelOriginal),
    celulaInteiro(e.acertos),
    celulaInteiro(e.itens),
    celulaPercentual(e.performance),
  ]
}

/**
 * ESTUDANTES EM PRIORIDADE PEDAGÓGICA — FR-076, FR-082.
 *
 * Lê o `Nível de aprendizagem` da fonte para selecionar Defasagem e Intermediário; não o
 * produz nem o infere. Os não avaliados **não entram aqui** — eles têm lista própria, e
 * misturá-los aos de Defasagem seria tratar ausência como o pior desempenho.
 */
export async function secaoPrioridadePedagogica(
  escopo: EscopoRelatorio,
): Promise<SecaoRelatorio> {
  const estudantes = await listarEstudantesDoRecorte(escopo.ctx, escopo.filtros, {
    avaliado: true,
    ordenarPorPrioridade: true,
  })

  const prioritarios = estudantes.filter(
    (e) => e.nivelNormalizado === 'DEFASAGEM' || e.nivelNormalizado === 'INTERMEDIARIO',
  )

  return secao({
    id: 'prioridade',
    titulo: 'Estudantes em prioridade pedagógica',
    descricao:
      'Avaliados cujo nível de aprendizagem informado pela fonte é Defasagem ou Intermediário.',
    colunas: [...COLUNAS_ESTUDANTE],
    linhas: prioritarios.map(linhaDeEstudante),
    nota: escopo.versao.nominal
      ? null
      : 'Nomes suprimidos: o solicitante não possui a permissão de dados nominais.',
  })
}

// ---------------------------------------------------------------------------
// Relatório geral
// ---------------------------------------------------------------------------

export async function montarRelatorioGeral(
  escopo: EscopoRelatorio,
): Promise<RelatorioMontado> {
  const secoes = [
    await secaoParticipacao(escopo),
    await secaoDistribuicao(escopo),
    await secaoDesempenho(escopo),
    await secaoRankingHabilidades(escopo),
    await secaoComparacaoTurmas(escopo),
    await secaoPrioridadePedagogica(escopo),
  ]

  // A supressão já aconteceu na consulta (`listarEstudantesDoRecorte`), que verifica o
  // próprio resultado antes de devolvê-lo. Aqui não há nome a esconder: o documento é
  // montado a partir de linhas que nunca carregaram um.
  return {
    tipo: 'geral',
    cabecalho: escopo.cabecalho,
    secoes,
    nomeArquivo: nomeDeArquivo('geral', escopo.geradoEm),
    nominal: escopo.versao.nominal,
  }
}
