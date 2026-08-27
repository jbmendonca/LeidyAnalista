import { prisma } from '@/server/prisma'
import { naoEncontrado } from '@/server/http-errors'
import { classifyAnalyticalSkillResult } from '@/modules/analytics/domain/classify'
import { ROTULO_FAIXA } from '@/modules/analytics/application/heatmap'
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
import type { EstudanteDoRelatorio } from './nominal-authorization'
import type { EscopoRelatorio } from './report-scope'

/**
 * ===========================================================================
 *  RELATÓRIO INDIVIDUAL DO ESTUDANTE — FR-088 a FR-093, FR-102
 * ===========================================================================
 *
 * A ficha que chega à família e ao professor. Três regras a governam, e as três são
 * visíveis na tabela de habilidades:
 *
 *  1. **O `Nível de aprendizagem` é o da fonte, transcrito.** Aparece como veio, sem
 *     normalização, sem correção e sem tradução (Const. III, FR-089). A faixa analítica do
 *     sistema aparece em coluna separada, com outro nome, para que ninguém as confunda.
 *
 *  2. **O resultado original de cada habilidade fica ao lado do percentual** (FR-091). É a
 *     coluna que permite ao leitor conferir de onde saiu o número: `"2 / 3"` e `66,67%`
 *     lado a lado, em vez de um percentual que ele teria de aceitar por confiança.
 *
 *  3. **Ausência é travessão.** Habilidade sem célula na fonte não vira `0` nem `0%`, e o
 *     estudante não avaliado não recebe nenhum número — nem no total, nem por habilidade
 *     (Const. I, FR-093).
 *
 * O nome já chegou aqui suprimido quando o solicitante não tem a permissão nominal: a
 * substituição aconteceu na consulta, e o código único — que identifica sem revelar —
 * permanece intacto para que a ficha continue utilizável (FR-007a, FR-131).
 */

function exigirEstudante(escopo: EscopoRelatorio): EstudanteDoRelatorio {
  if (!escopo.estudante) throw naoEncontrado('Estudante')
  return escopo.estudante
}

function secaoIdentificacao(escopo: EscopoRelatorio): SecaoRelatorio {
  const e = exigirEstudante(escopo)

  return secao({
    id: 'identificacao',
    titulo: 'Identificação',
    colunas: COLUNAS_RESUMO,
    linhas: [
      linhaResumo('Código único', celulaTexto(e.uniqueCode)),
      linhaResumo('Estudante', celulaTexto(e.nomeOriginal)),
      linhaResumo('Turma', celulaTexto(`${e.turmaNome} (${e.turmaCodigo})`)),
      linhaResumo('Escola', celulaTexto(e.escolaNome)),
      linhaResumo('Avaliação', celulaTexto(escopo.avaliacao.nome)),
      linhaResumo('Participou da avaliação', celulaTexto(e.avaliado ? 'Sim' : 'Não')),
    ],
    nota: escopo.versao.nominal
      ? null
      : 'Nome suprimido: o solicitante não possui a permissão de dados nominais. O ' +
        'código único identifica o estudante sem revelá-lo.',
  })
}

function secaoDesempenhoDoEstudante(escopo: EscopoRelatorio): SecaoRelatorio {
  const e = exigirEstudante(escopo)
  const faixa = classifyAnalyticalSkillResult(e.performance, escopo.faixas.bands)

  return secao({
    id: 'desempenho',
    titulo: 'Desempenho geral',
    colunas: COLUNAS_RESUMO,
    linhas: [
      // Valor bruto da fonte, sem qualquer alteração — nem de caixa, nem de acentuação.
      linhaResumo('Nível de aprendizagem (valor da fonte)', celulaTexto(e.nivelOriginal)),
      linhaResumo('Acertos totais', celulaInteiro(e.acertos)),
      linhaResumo('Itens possíveis', celulaInteiro(e.itens)),
      linhaResumo('Acertos / itens', celulaFracao(e.performance)),
      linhaResumo('Percentual geral de acerto', celulaPercentual(e.performance)),
      linhaResumo(
        'Faixa analítica do sistema',
        faixa === null ? CELULA_AUSENTE : celulaTexto(ROTULO_FAIXA[faixa]),
      ),
    ],
    nota: e.avaliado
      ? 'A faixa analítica é categoria configurável do sistema e não substitui o nível da fonte.'
      : 'Estudante não avaliado: as colunas de desempenho ficam vazias por ausência de ' +
        'avaliação, jamais por resultado zero.',
  })
}

type HabilidadeDaAvaliacao = {
  skillId: string
  shortCode: string
  referenceCode: string
  descricao: string
  referenceItems: number
}

/** Catálogo `H01:Hnn` da avaliação, com o denominador apurado sobre os dados (FR-016). */
async function habilidadesDaAvaliacao(
  assessmentId: string,
): Promise<readonly HabilidadeDaAvaliacao[]> {
  const registros = await prisma.assessmentSkill.findMany({
    where: { assessmentId },
    orderBy: { skill: { ordem: 'asc' } },
    select: {
      skillId: true,
      referenceItems: true,
      skill: { select: { shortCode: true, referenceCode: true, descricao: true } },
    },
  })

  return registros.map((r) => ({
    skillId: r.skillId,
    shortCode: r.skill.shortCode,
    referenceCode: r.skill.referenceCode,
    descricao: r.skill.descricao,
    referenceItems: r.referenceItems,
  }))
}

type LinhaDeHabilidade = {
  habilidade: HabilidadeDaAvaliacao
  valorOriginal: string | null
  resultado: ReturnType<typeof fracaoOuAusencia>
  faixa: ReturnType<typeof classifyAnalyticalSkillResult>
}

function montarLinhas(
  escopo: EscopoRelatorio,
  catalogo: readonly HabilidadeDaAvaliacao[],
): readonly LinhaDeHabilidade[] {
  const e = exigirEstudante(escopo)
  const porSkill = new Map(e.habilidades.map((h) => [h.skillId, h]))

  return catalogo.map((habilidade) => {
    const bruto = porSkill.get(habilidade.skillId)
    // O não avaliado não tem resultado por habilidade, mesmo que a importação tivesse
    // gravado algum: a guarda impede que um número apareça onde não houve avaliação.
    const resultado = e.avaliado
      ? fracaoOuAusencia(bruto?.acertos, bruto?.itensPossiveis)
      : null

    return {
      habilidade,
      valorOriginal: e.avaliado ? (bruto?.valorOriginal ?? null) : null,
      resultado,
      faixa: classifyAnalyticalSkillResult(resultado, escopo.faixas.bands),
    }
  })
}

/** DETALHAMENTO POR HABILIDADE — FR-091. Resultado original ao lado do percentual. */
function secaoHabilidades(
  escopo: EscopoRelatorio,
  linhas: readonly LinhaDeHabilidade[],
): SecaoRelatorio {
  return secao({
    id: 'habilidades',
    titulo: 'Detalhamento por habilidade',
    descricao:
      'O resultado original da fonte fica ao lado do percentual derivado, para que a ' +
      'procedência do número seja verificável.',
    colunas: [
      coluna('codigo', 'Habilidade'),
      coluna('referencia', 'Código de referência'),
      coluna('descricao', 'Descrição'),
      coluna('original', 'Resultado original da fonte'),
      coluna('acertos', 'Acertos', true),
      coluna('itens', 'Itens possíveis', true),
      coluna('percentual', '% de acerto', true),
      coluna('faixa', 'Faixa analítica do sistema'),
      coluna('referenciaItens', 'Itens de referência da avaliação', true),
    ],
    linhas: linhas.map(
      ({ habilidade, valorOriginal, resultado, faixa }): readonly Celula[] => [
        celulaTexto(habilidade.shortCode),
        celulaTexto(habilidade.referenceCode),
        celulaTexto(habilidade.descricao),
        celulaTexto(valorOriginal),
        celulaInteiro(resultado === null ? null : resultado.acertos),
        celulaInteiro(resultado === null ? null : resultado.itens),
        celulaPercentual(resultado),
        faixa === null ? CELULA_AUSENTE : celulaTexto(ROTULO_FAIXA[faixa]),
        celulaInteiro(habilidade.referenceItems),
      ],
    ),
    nota: 'Célula sem resultado na fonte sai como travessão — nunca como 0 ou 0%.',
  })
}

/** FRAGILIDADES — FR-092. Contagens com o critério analítico declarado. */
function secaoFragilidades(
  escopo: EscopoRelatorio,
  linhas: readonly LinhaDeHabilidade[],
): SecaoRelatorio {
  const fragilidade = linhas.filter((l) => l.faixa === 'FRAGILIDADE')
  const atencao = linhas.filter((l) => l.faixa === 'ATENCAO')
  const satisfatorio = linhas.filter((l) => l.faixa === 'SATISFATORIO')
  const semResultado = linhas.filter((l) => l.faixa === null)
  const comResultado = linhas.length - semResultado.length

  const codigos = (conjunto: readonly LinhaDeHabilidade[]): string | null =>
    conjunto.length === 0 ? null : conjunto.map((l) => l.habilidade.shortCode).join(', ')

  return secao({
    id: 'fragilidades',
    titulo: 'Fragilidades pelo critério analítico do sistema',
    descricao:
      `Faixas da versão ${escopo.faixas.version}: Fragilidade abaixo de ` +
      `${escopo.faixas.fragilidadeMaxTexto.replace('.', ',')}%, Atenção até ` +
      `${escopo.faixas.atencaoMaxTexto.replace('.', ',')}%.`,
    colunas: COLUNAS_RESUMO,
    linhas: [
      linhaResumo('Habilidades com resultado', celulaInteiro(comResultado)),
      linhaResumo(
        `Habilidades em ${ROTULO_FAIXA.FRAGILIDADE}`,
        celulaInteiro(fragilidade.length),
      ),
      linhaResumo(
        `Habilidades em ${ROTULO_FAIXA.ATENCAO}`,
        celulaInteiro(atencao.length),
      ),
      linhaResumo(
        `Habilidades em ${ROTULO_FAIXA.SATISFATORIO}`,
        celulaInteiro(satisfatorio.length),
      ),
      linhaResumo(
        'Habilidades sem resultado na fonte',
        celulaInteiro(semResultado.length),
      ),
      linhaResumo(
        `Códigos em ${ROTULO_FAIXA.FRAGILIDADE}`,
        celulaTexto(codigos(fragilidade)),
      ),
      linhaResumo(`Códigos em ${ROTULO_FAIXA.ATENCAO}`, celulaTexto(codigos(atencao))),
    ],
    nota:
      'Habilidade sem resultado não é contada em nenhuma faixa: ausência não é ' +
      'classificação (Const. I).',
  })
}

export async function montarRelatorioIndividual(
  escopo: EscopoRelatorio,
): Promise<RelatorioMontado> {
  exigirEstudante(escopo)

  const catalogo = await habilidadesDaAvaliacao(escopo.avaliacao.id)
  const linhas = montarLinhas(escopo, catalogo)

  const secoes: SecaoRelatorio[] = [
    secaoIdentificacao(escopo),
    secaoDesempenhoDoEstudante(escopo),
    secaoHabilidades(escopo, linhas),
    secaoFragilidades(escopo, linhas),
  ]

  return {
    tipo: 'individual',
    cabecalho: escopo.cabecalho,
    secoes,
    nomeArquivo: nomeDeArquivo('individual', escopo.geradoEm),
    nominal: escopo.versao.nominal,
  }
}
