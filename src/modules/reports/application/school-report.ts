import { naoEncontrado } from '@/server/http-errors'
import {
  COLUNAS_RESUMO,
  celulaInteiro,
  celulaTexto,
  coluna,
  linhaResumo,
  nomeDeArquivo,
  secao,
  type RelatorioMontado,
  type SecaoRelatorio,
} from '@/modules/reports/domain/report-header'
import { listarEstudantesDoRecorte } from './nominal-authorization'
import {
  COLUNAS_ESTUDANTE,
  linhaDeEstudante,
  secaoComparacaoTurmas,
  secaoDesempenho,
  secaoDistribuicao,
  secaoParticipacao,
  secaoRankingHabilidades,
} from './general-report'
import type { EscopoRelatorio } from './report-scope'

/**
 * ===========================================================================
 *  RELATÓRIO DA ESCOLA — FR-074 a FR-076, FR-102
 * ===========================================================================
 *
 * O relatório da escola é o relatório geral **recortado por uma escola**, mais o resumo
 * cadastral e as três listas nominativas que a escola precisa para agir: quem está em
 * Defasagem, quem está em Intermediário e quem não foi avaliado.
 *
 * Não existe aqui uma segunda implementação das agregações — o recorte é um parâmetro. A
 * escola já foi validada contra o escopo do requisitante em `resolverEscopoRelatorio`, que
 * responde 404 para escola fora dele (FR-006). O `schoolId` da barra de endereços chegou
 * até aqui como filtro, jamais como permissão.
 *
 * As três listas são separadas de propósito. Juntar os não avaliados aos de Defasagem —
 * a tentação óbvia de quem quer "a lista dos que precisam de apoio" — transformaria
 * ausência de avaliação em pior resultado, que é exatamente o que a Const. V proíbe.
 */

function secaoResumo(escopo: EscopoRelatorio): SecaoRelatorio {
  const escola = escopo.escola
  if (!escola) throw naoEncontrado('Escola')

  return secao({
    id: 'resumo',
    titulo: 'Resumo da escola',
    colunas: COLUNAS_RESUMO,
    linhas: [
      linhaResumo('Escola', celulaTexto(escola.name)),
      linhaResumo('Código', celulaTexto(escola.code)),
      linhaResumo('Rede', celulaTexto(escola.rede)),
      linhaResumo('Município / Estado', celulaTexto(`${escola.municipio}/${escola.estado}`)),
      linhaResumo('Turmas cadastradas', celulaInteiro(escola.totalTurmas)),
      linhaResumo('Estudantes cadastrados', celulaInteiro(escola.totalEstudantes)),
    ],
    nota: null,
  })
}

/**
 * Uma lista nominativa da escola.
 *
 * `nivel` é o valor **da fonte**; `null` seleciona os não avaliados, que não têm nível e
 * por isso não podem ser pedidos por ele.
 */
async function secaoDeEstudantes(
  escopo: EscopoRelatorio,
  entrada: {
    id: string
    titulo: string
    descricao: string
    nivel: 'DEFASAGEM' | 'INTERMEDIARIO' | null
  },
): Promise<SecaoRelatorio> {
  const avaliado = entrada.nivel !== null

  const estudantes = await listarEstudantesDoRecorte(
    escopo.ctx,
    { ...escopo.filtros, nivel: entrada.nivel },
    { avaliado, ordenarPorPrioridade: true },
  )

  return secao({
    id: entrada.id,
    titulo: entrada.titulo,
    descricao: entrada.descricao,
    colunas: [...COLUNAS_ESTUDANTE],
    linhas: estudantes.map(linhaDeEstudante),
    nota: escopo.versao.nominal
      ? null
      : 'Nomes suprimidos: o solicitante não possui a permissão de dados nominais.',
  })
}

export async function montarRelatorioDaEscola(
  escopo: EscopoRelatorio,
): Promise<RelatorioMontado> {
  if (!escopo.escola) throw naoEncontrado('Escola')

  const secoes: SecaoRelatorio[] = [
    secaoResumo(escopo),
    await secaoParticipacao(escopo),
    await secaoDistribuicao(escopo),
    await secaoDesempenho(escopo),
    await secaoRankingHabilidades(escopo),
    await secaoComparacaoTurmas(escopo),
    await secaoDeEstudantes(escopo, {
      id: 'defasagem',
      titulo: 'Estudantes em Defasagem',
      descricao: 'Nível de aprendizagem informado pela fonte: Defasagem.',
      nivel: 'DEFASAGEM',
    }),
    await secaoDeEstudantes(escopo, {
      id: 'intermediario',
      titulo: 'Estudantes em Intermediário',
      descricao: 'Nível de aprendizagem informado pela fonte: Intermediário.',
      nivel: 'INTERMEDIARIO',
    }),
    await secaoNaoAvaliados(escopo),
  ]

  return {
    tipo: 'escola',
    cabecalho: escopo.cabecalho,
    secoes,
    nomeArquivo: nomeDeArquivo('escola', escopo.geradoEm),
    nominal: escopo.versao.nominal,
  }
}

/**
 * NÃO AVALIADOS — FR-076, Const. I e V.
 *
 * Lista própria, com travessão em toda coluna de desempenho. Nenhum número entra aqui:
 * o estudante não foi avaliado, e qualquer valor nesta linha seria invenção.
 */
async function secaoNaoAvaliados(escopo: EscopoRelatorio): Promise<SecaoRelatorio> {
  const estudantes = await listarEstudantesDoRecorte(
    escopo.ctx,
    { ...escopo.filtros, nivel: null },
    { avaliado: false },
  )

  return secao({
    id: 'nao-avaliados',
    titulo: 'Estudantes não avaliados',
    descricao:
      'Contam na participação e ficam fora de todo denominador de desempenho (FR-060).',
    colunas: [
      coluna('codigo', 'Código único'),
      coluna('estudante', 'Estudante'),
      coluna('turma', 'Turma'),
      coluna('registro', 'Registro de nível na fonte'),
    ],
    linhas: estudantes.map((e) => [
      celulaTexto(e.uniqueCode),
      celulaTexto(e.nomeOriginal),
      celulaTexto(e.turmaNome),
      celulaTexto(e.nivelOriginal),
    ]),
    nota: 'Sem colunas de desempenho: ausência de avaliação não é resultado zero.',
  })
}
