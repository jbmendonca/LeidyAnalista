import { naoEncontrado } from '@/server/http-errors'
import type { MaybeFraction } from '@/modules/imports/domain/types'
import { classifyAnalyticalSkillResult } from '@/modules/analytics/domain/classify'
import { ROTULO_FAIXA } from '@/modules/analytics/application/heatmap'
import {
  desempenhoPorHabilidade,
  distribuicaoDaHabilidade,
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
import { listarEstudantesDoRecorte } from './nominal-authorization'
import { turmasDoRecorte } from './general-report'
import type { EscopoRelatorio, HabilidadeDoRelatorio } from './report-scope'

/**
 * ===========================================================================
 *  RELATÓRIO DA HABILIDADE — FR-083 a FR-087, FR-102
 * ===========================================================================
 *
 * A regra que mais importa aqui está em uma linha só: **o total de itens vem de
 * `AssessmentSkill.referenceItems`**, apurado sobre os dados importados, e nunca de uma
 * constante no código (FR-015, FR-016). Escrever "22" neste arquivo funcionaria hoje e
 * quebraria silenciosamente no ciclo seguinte, com outra matriz de itens — e o relatório
 * continuaria imprimindo percentuais errados com toda a confiança.
 *
 * Quando a avaliação ainda não tem resultado para a habilidade, `referenceItems` é `null`
 * e a distribuição `0/n … n/n` simplesmente não é montada: não existe `n` a distribuir.
 * Inventar um denominador seria pior que a ausência da seção.
 *
 * Registros cujo denominador diverge do de referência saem em seção própria (FR-158), e
 * não misturados à distribuição — eles descrevem outro instrumento.
 */

function exigirHabilidade(escopo: EscopoRelatorio): HabilidadeDoRelatorio {
  if (!escopo.habilidade) throw naoEncontrado('Habilidade')
  return escopo.habilidade
}

async function desempenhoDaHabilidade(escopo: EscopoRelatorio): Promise<{
  resultado: MaybeFraction
  estudantesComResultado: number
}> {
  const habilidade = exigirHabilidade(escopo)
  const mapa = await desempenhoPorHabilidade(escopo.ctx, escopo.filtros)
  const soma = mapa.get(habilidade.id)

  return {
    resultado: soma ? fracaoOuAusencia(soma.acertos, soma.itens) : null,
    estudantesComResultado: soma?.estudantesComResultado ?? 0,
  }
}

async function secaoIdentificacao(escopo: EscopoRelatorio): Promise<SecaoRelatorio> {
  const habilidade = exigirHabilidade(escopo)
  const { resultado, estudantesComResultado } = await desempenhoDaHabilidade(escopo)
  const faixa = classifyAnalyticalSkillResult(resultado, escopo.faixas.bands)

  return secao({
    id: 'identificacao',
    titulo: `Habilidade ${habilidade.shortCode}`,
    colunas: COLUNAS_RESUMO,
    linhas: [
      linhaResumo('Código curto', celulaTexto(habilidade.shortCode)),
      linhaResumo('Código de referência', celulaTexto(habilidade.referenceCode)),
      linhaResumo('Descrição', celulaTexto(habilidade.descricao)),
      linhaResumo(
        'Itens de referência da avaliação',
        celulaInteiro(habilidade.referenceItems),
      ),
      linhaResumo('Estudantes com resultado', celulaInteiro(estudantesComResultado)),
      linhaResumo(
        'Soma dos acertos',
        celulaInteiro(resultado === null ? null : resultado.acertos),
      ),
      linhaResumo(
        'Soma dos itens possíveis',
        celulaInteiro(resultado === null ? null : resultado.itens),
      ),
      linhaResumo('Acertos / itens', celulaFracao(resultado)),
      linhaResumo('Percentual de acerto', celulaPercentual(resultado)),
      linhaResumo(
        'Faixa analítica do sistema',
        faixa === null ? CELULA_AUSENTE : celulaTexto(ROTULO_FAIXA[faixa]),
      ),
    ],
    nota: habilidade.referenceItemsTiebreak
      ? 'O denominador de referência foi apurado com empate de frequência; adotou-se o maior.'
      : 'O total de itens é apurado sobre os dados importados, nunca fixado no sistema.',
  })
}

/** COMPARAÇÃO ENTRE TURMAS NA HABILIDADE — FR-086. */
async function secaoTurmas(escopo: EscopoRelatorio): Promise<SecaoRelatorio> {
  const habilidade = exigirHabilidade(escopo)
  const turmas = await turmasDoRecorte(escopo)

  // Uma agregação por turma, com o mesmo recorte da tela. Consulta a mais em troca de
  // não escrever aqui uma segunda soma que poderia esquecer `avaliado: true`.
  const porTurma = await Promise.all(
    turmas.map(async (t) => {
      const mapa = await desempenhoPorHabilidade(escopo.ctx, {
        ...escopo.filtros,
        classId: t.classId,
      })
      const soma = mapa.get(habilidade.id)
      return {
        turma: t,
        resultado: soma ? fracaoOuAusencia(soma.acertos, soma.itens) : null,
        estudantesComResultado: soma?.estudantesComResultado ?? 0,
      }
    }),
  )

  const linhas = porTurma.map(({ turma, resultado, estudantesComResultado }): readonly Celula[] => {
    const faixa = classifyAnalyticalSkillResult(resultado, escopo.faixas.bands)
    return [
      celulaTexto(turma.nome),
      celulaTexto(turma.externalCode),
      celulaTexto(turma.escolaNome),
      celulaInteiro(estudantesComResultado),
      celulaInteiro(resultado === null ? null : resultado.acertos),
      celulaInteiro(resultado === null ? null : resultado.itens),
      celulaPercentual(resultado),
      faixa === null ? CELULA_AUSENTE : celulaTexto(ROTULO_FAIXA[faixa]),
    ]
  })

  return secao({
    id: 'turmas',
    titulo: 'Comparação entre turmas nesta habilidade',
    colunas: [
      coluna('turma', 'Turma'),
      coluna('codigo', 'Código da turma'),
      coluna('escola', 'Escola'),
      coluna('comResultado', 'Estudantes com resultado', true),
      coluna('acertos', 'Σ acertos', true),
      coluna('itens', 'Σ itens possíveis', true),
      coluna('percentual', '% de acerto', true),
      coluna('faixa', 'Faixa analítica do sistema'),
    ],
    linhas,
    nota: 'Turma sem resultado nesta habilidade aparece com travessão, nunca com 0%.',
  })
}

/** DISTRIBUIÇÃO `0/n … n/n` — FR-085, e os divergentes à parte — FR-158. */
async function secoesDistribuicao(escopo: EscopoRelatorio): Promise<SecaoRelatorio[]> {
  const habilidade = exigirHabilidade(escopo)
  const referencia = habilidade.referenceItems

  if (referencia === null || referencia <= 0) {
    return [
      secao({
        id: 'distribuicao',
        titulo: 'Distribuição de acertos',
        colunas: [coluna('situacao', 'Situação')],
        linhas: [
          [
            celulaTexto(
              'Sem denominador de referência apurado para esta habilidade nesta avaliação.',
            ),
          ],
        ],
        nota:
          'A distribuição exige o número de itens apurado sobre os dados importados. ' +
          'Nenhum valor é assumido no lugar dele.',
      }),
    ]
  }

  const { distribuicao, divergentes } = await distribuicaoDaHabilidade(
    escopo.ctx,
    escopo.filtros,
    habilidade.id,
    referencia,
  )

  const totalNaDistribuicao = distribuicao.reduce((soma, d) => soma + d.quantidade, 0)

  const principal = secao({
    id: 'distribuicao',
    titulo: `Distribuição de acertos (0/${referencia} a ${referencia}/${referencia})`,
    descricao: `Denominador: ${totalNaDistribuicao} estudante(s) com resultado no denominador de referência.`,
    colunas: [
      coluna('resultado', 'Resultado'),
      coluna('acertos', 'Acertos', true),
      coluna('quantidade', 'Estudantes', true),
      coluna('proporcao', '% dos estudantes', true),
    ],
    linhas: distribuicao.map(
      (d): readonly Celula[] => [
        celulaTexto(`${d.acertos}/${referencia}`),
        celulaInteiro(d.acertos),
        celulaInteiro(d.quantidade),
        celulaPercentual(fracaoOuAusencia(d.quantidade, totalNaDistribuicao)),
      ],
    ),
    nota: 'As faixas sem ocorrência aparecem com 0 estudantes — este zero é contagem, não ausência.',
  })

  if (divergentes.length === 0) return [principal]

  const divergente = secao({
    id: 'divergentes',
    titulo: 'Registros com denominador divergente do de referência',
    descricao:
      'Listados à parte porque descrevem um instrumento diferente do apurado como referência.',
    colunas: [
      coluna('resultado', 'Resultado'),
      coluna('acertos', 'Acertos', true),
      coluna('itens', 'Itens possíveis', true),
      coluna('quantidade', 'Estudantes', true),
    ],
    linhas: divergentes.map(
      (d): readonly Celula[] => [
        celulaTexto(`${d.acertos}/${d.itens}`),
        celulaInteiro(d.acertos),
        celulaInteiro(d.itens),
        celulaInteiro(d.quantidade),
      ],
    ),
    nota: 'Não entram na distribuição acima nem são convertidos para o denominador de referência.',
  })

  return [principal, divergente]
}

/**
 * ESTUDANTES COM DIFICULDADE NA HABILIDADE — FR-087.
 *
 * A seleção usa `classifyAnalyticalSkillResult`, a mesma função da tela e do mapa de
 * calor, com as faixas vigentes. Reimplementar a comparação aqui produziria uma segunda
 * definição de "Fragilidade" que divergiria da primeira na próxima mudança de limite.
 */
async function secaoEstudantes(escopo: EscopoRelatorio): Promise<SecaoRelatorio> {
  const habilidade = exigirHabilidade(escopo)

  const estudantes = await listarEstudantesDoRecorte(escopo.ctx, escopo.filtros, {
    avaliado: true,
    incluirHabilidades: true,
  })

  const comDificuldade = estudantes
    .map((e) => {
      const bruto = e.habilidades.find((h) => h.skillId === habilidade.id)
      const resultado = fracaoOuAusencia(bruto?.acertos, bruto?.itensPossiveis)
      return {
        estudante: e,
        valorOriginal: bruto?.valorOriginal ?? null,
        resultado,
        faixa: classifyAnalyticalSkillResult(resultado, escopo.faixas.bands),
      }
    })
    .filter((linha) => linha.faixa === 'FRAGILIDADE')

  return secao({
    id: 'estudantes',
    titulo: 'Estudantes com maior dificuldade nesta habilidade',
    descricao: `Classificados na faixa ${ROTULO_FAIXA.FRAGILIDADE} pelo critério analítico vigente.`,
    colunas: [
      coluna('codigo', 'Código único'),
      coluna('estudante', 'Estudante'),
      coluna('turma', 'Turma'),
      coluna('original', 'Resultado original da fonte'),
      coluna('acertos', 'Acertos', true),
      coluna('itens', 'Itens possíveis', true),
      coluna('percentual', '% de acerto', true),
    ],
    linhas: comDificuldade.map(
      ({ estudante, valorOriginal, resultado }): readonly Celula[] => [
        celulaTexto(estudante.uniqueCode),
        celulaTexto(estudante.nomeOriginal),
        celulaTexto(estudante.turmaNome),
        celulaTexto(valorOriginal),
        celulaInteiro(resultado === null ? null : resultado.acertos),
        celulaInteiro(resultado === null ? null : resultado.itens),
        celulaPercentual(resultado),
      ],
    ),
    nota: escopo.versao.nominal
      ? 'Estudantes sem resultado nesta habilidade não aparecem: ausência não é dificuldade.'
      : 'Nomes suprimidos: o solicitante não possui a permissão de dados nominais.',
  })
}

export async function montarRelatorioDaHabilidade(
  escopo: EscopoRelatorio,
): Promise<RelatorioMontado> {
  exigirHabilidade(escopo)

  const secoes: SecaoRelatorio[] = [
    await secaoIdentificacao(escopo),
    await secaoTurmas(escopo),
    ...(await secoesDistribuicao(escopo)),
    await secaoEstudantes(escopo),
  ]

  return {
    tipo: 'habilidade',
    cabecalho: escopo.cabecalho,
    secoes,
    nomeArquivo: nomeDeArquivo('habilidade', escopo.geradoEm),
    nominal: escopo.versao.nominal,
  }
}
