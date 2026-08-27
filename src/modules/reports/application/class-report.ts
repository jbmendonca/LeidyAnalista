import { naoEncontrado } from '@/server/http-errors'
import {
  COLUNAS_RESUMO,
  celulaInteiro,
  celulaPercentual,
  celulaTexto,
  coluna,
  linhaResumo,
  nomeDeArquivo,
  secao,
  type Celula,
  type RelatorioMontado,
  type SecaoRelatorio,
} from '@/modules/reports/domain/report-header'
import { listarEstudantesDoRecorte } from './nominal-authorization'
import {
  COLUNAS_ESTUDANTE,
  secaoDesempenho,
  secaoDistribuicao,
  secaoParticipacao,
  secaoRankingHabilidades,
} from './general-report'
import type { EscopoRelatorio } from './report-scope'

/**
 * ===========================================================================
 *  RELATÓRIO DA TURMA — FR-077 a FR-082, FR-102
 * ===========================================================================
 *
 * O documento que vai para a mesa da reunião pedagógica. Cinco seções: resumo,
 * desempenho, distribuição por nível, ranking `H01:Hnn` e a lista de estudantes.
 *
 * A lista de estudantes é uma só, ordenada por prioridade pedagógica — Defasagem →
 * Intermediário → Adequado → não avaliados, que a função de domínio já manda para o fim.
 * A coluna "Avaliado" existe justamente para que o leitor não precise inferir a razão do
 * travessão: ele não é zero, é ausência de avaliação (Const. I, FR-093).
 *
 * O `classId` chegou validado contra o escopo em `resolverEscopoRelatorio`: turma de outra
 * rede responde 404, e não uma folha vazia que confirmaria a existência da turma.
 */

function secaoResumo(escopo: EscopoRelatorio): SecaoRelatorio {
  const turma = escopo.turma
  if (!turma) throw naoEncontrado('Turma')

  return secao({
    id: 'resumo',
    titulo: 'Resumo da turma',
    colunas: COLUNAS_RESUMO,
    linhas: [
      linhaResumo('Turma', celulaTexto(turma.name)),
      linhaResumo('Código da turma', celulaTexto(turma.externalCode)),
      linhaResumo('Ano escolar', celulaTexto(turma.anoEscolar)),
      linhaResumo('Escola', celulaTexto(`${turma.escolaNome} (${turma.escolaCodigo})`)),
      linhaResumo('Avaliação', celulaTexto(escopo.avaliacao.nome)),
    ],
    nota: null,
  })
}

const COLUNAS_LISTA = [
  COLUNAS_ESTUDANTE[0],
  COLUNAS_ESTUDANTE[1],
  coluna('avaliado', 'Avaliado'),
  COLUNAS_ESTUDANTE[3],
  COLUNAS_ESTUDANTE[4],
  COLUNAS_ESTUDANTE[5],
  COLUNAS_ESTUDANTE[6],
] as const

/**
 * LISTA DE ESTUDANTES DA TURMA — FR-081, FR-082.
 *
 * Traz avaliados e não avaliados na mesma tabela, ordenados por prioridade, porque a
 * turma é a unidade de trabalho do professor e ele precisa ver a turma inteira. A
 * separação que importa está na coluna "Avaliado" e no travessão das colunas de
 * desempenho — nunca num zero.
 */
async function secaoEstudantes(escopo: EscopoRelatorio): Promise<SecaoRelatorio> {
  const estudantes = await listarEstudantesDoRecorte(escopo.ctx, escopo.filtros, {
    avaliado: null,
    ordenarPorPrioridade: true,
  })

  const linhas = estudantes.map(
    (e): readonly Celula[] => [
      celulaTexto(e.uniqueCode),
      celulaTexto(e.nomeOriginal),
      celulaTexto(e.avaliado ? 'Sim' : 'Não'),
      celulaTexto(e.nivelOriginal),
      celulaInteiro(e.acertos),
      celulaInteiro(e.itens),
      celulaPercentual(e.performance),
    ],
  )

  const naoAvaliados = estudantes.filter((e) => !e.avaliado).length

  return secao({
    id: 'estudantes',
    titulo: 'Estudantes da turma',
    descricao:
      'Ordenados por prioridade pedagógica: Defasagem, Intermediário, Adequado e, por ' +
      'último, os não avaliados.',
    colunas: [...COLUNAS_LISTA],
    linhas,
    nota:
      `${naoAvaliados} estudante(s) não avaliado(s): o travessão nas colunas de ` +
      'desempenho indica ausência de avaliação, nunca resultado zero.' +
      (escopo.versao.nominal
        ? ''
        : ' Nomes suprimidos: o solicitante não possui a permissão de dados nominais.'),
  })
}

export async function montarRelatorioDaTurma(
  escopo: EscopoRelatorio,
): Promise<RelatorioMontado> {
  if (!escopo.turma) throw naoEncontrado('Turma')

  const secoes: SecaoRelatorio[] = [
    secaoResumo(escopo),
    await secaoParticipacao(escopo),
    await secaoDesempenho(escopo),
    await secaoDistribuicao(escopo),
    await secaoRankingHabilidades(escopo),
    await secaoEstudantes(escopo),
  ]

  return {
    tipo: 'turma',
    cabecalho: escopo.cabecalho,
    secoes,
    nomeArquivo: nomeDeArquivo('turma', escopo.geradoEm),
    nominal: escopo.versao.nominal,
  }
}
