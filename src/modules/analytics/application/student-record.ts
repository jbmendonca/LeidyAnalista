import type { LearningLevel } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { schoolScopeFilter, type AuthContext } from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'
import { aplicarSupressaoNominalEm, rotuloVersaoRelatorio } from '@/server/nominal-data'
import { formatPercent, toPercent } from '@/lib/decimal'
import { AUSENTE, formatarFracao } from '@/lib/format'
import {
  classifyAnalyticalSkillResult,
  type AnalyticalBand,
} from '@/modules/analytics/domain/classify'
import { calculateStudentPerformance } from '@/modules/analytics/domain/student-performance'
import {
  carregarFaixasAnaliticas,
  faixasParaExibicao,
  type FaixasParaExibicao,
} from '@/modules/analytics/application/heatmap'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  FICHA INDIVIDUAL DO ESTUDANTE — FR-088 a FR-093
 * ===========================================================================
 *
 * A ficha é o documento que chega mais perto da criança, e por isso concentra
 * as duas regras mais fáceis de violar sem perceber:
 *
 *  - **Não avaliado não tem zero em campo nenhum** (FR-093). Acertos, itens,
 *    percentual e as contagens de habilidade saem `null`, e a tela desenha
 *    travessão. Um `0` aqui viraria "a criança errou tudo" no lugar de "a
 *    criança não fez a prova" — o erro de leitura mais caro do sistema.
 *
 *  - **O `Nível de aprendizagem` é transcrito da fonte** (Const. III). A ficha
 *    exibe `nivelOriginal` como recebido. As contagens de habilidades em
 *    Fragilidade e em Atenção são outra coisa: critério analítico do sistema,
 *    configurável, e rotulado como tal (FR-092).
 *
 * O escopo por escola fecha na consulta do estudante: ficha de criança de
 * outra rede responde 404, nunca 403 (FR-006).
 */

/** Uma linha do detalhamento H01:H12 (FR-091). */
export type HabilidadeDaFicha = Readonly<{
  skillId: string
  shortCode: string
  referenceCode: string
  descricao: string
  /** Denominador de referência apurado dos dados, nunca constante em código (FR-016). */
  itensDeReferencia: number
  /** Exatamente como veio da fonte, ex.: `"2 / 3"`. `null` é ausência (FR-030). */
  valorOriginal: string | null
  acertos: number | null
  itens: number | null
  /** `"2 / 3"`, ou travessão. Sempre ao lado do percentual (FR-127). */
  fracaoTexto: string
  percentualTexto: string
  /** Situação analítica — do sistema, não da fonte. */
  faixa: AnalyticalBand | null
}>

export type SituacaoParticipacao = 'AVALIADO' | 'NAO_AVALIADO' | 'SEM_REGISTRO'

export const ROTULO_PARTICIPACAO: Readonly<Record<SituacaoParticipacao, string>> = {
  AVALIADO: 'Avaliado',
  NAO_AVALIADO: 'Não avaliado',
  SEM_REGISTRO: 'Sem registro nesta avaliação',
}

export type InfoAvaliacaoDaFicha = Readonly<{
  id: string
  nome: string
  ano: number
  ciclo: string
  componenteCurricular: string
}>

export type FichaDoEstudante = Readonly<{
  studentId: string
  /** Estável, permanente e não derivado de dado pessoal (FR-128 a FR-131). */
  uniqueCode: string
  /** Já suprimido quando o requisitante não tem a permissão nominal (FR-007a). */
  nomeOriginal: string
  codigoExterno: string | null
  schoolId: string
  escolaNome: string
  classId: string
  turmaNome: string
  codigoTurma: string
  anoEscolar: string

  avaliacao: InfoAvaliacaoDaFicha | null
  situacao: SituacaoParticipacao
  /** Texto bruto da fonte. `null` quando não há registro na avaliação. */
  nivelOriginal: string | null
  nivelNormalizado: LearningLevel | null

  acertosTotais: number | null
  itensPossiveis: number | null
  fracaoTexto: string
  percentualTexto: string
  performance: MaybeFraction

  habilidades: readonly HabilidadeDaFicha[]
  /** `null` para quem não foi avaliado: não há habilidade a classificar. */
  habilidadesEmFragilidade: number | null
  habilidadesEmAtencao: number | null

  faixas: FaixasParaExibicao
  versaoRelatorio: string
}>

type EstudanteNoEscopo = {
  id: string
  uniqueCode: string
  nomeOriginal: string
  codigoExterno: string | null
  schoolId: string
  classId: string
  school: { name: string }
  class: { name: string; externalCode: string; anoEscolar: string }
}

/**
 * Lê o estudante dentro do escopo do requisitante.
 *
 * Escopo embutido no `where`, e não conferido depois: a criança de outra escola nunca é
 * encontrada, e a resposta é indistinguível de identificador inexistente.
 */
async function lerEstudanteNoEscopo(
  ctx: AuthContext,
  studentId: string,
): Promise<EstudanteNoEscopo> {
  const escopo = schoolScopeFilter(ctx)

  const estudante = await prisma.student.findFirst({
    where: { id: studentId, schoolId: { in: [...escopo.in] } },
    select: {
      id: true,
      uniqueCode: true,
      nomeOriginal: true,
      codigoExterno: true,
      schoolId: true,
      classId: true,
      school: { select: { name: true } },
      class: { select: { name: true, externalCode: true, anoEscolar: true } },
    },
  })

  if (!estudante) throw naoEncontrado('Estudante')
  return estudante
}

/**
 * Escolhe a avaliação exibida na ficha.
 *
 * Sem `assessmentId`, adota a mais recente **em que este estudante tem registro**. Abrir a
 * ficha numa avaliação que a criança não fez produziria uma página inteira de travessões
 * indistinguível de falha de importação.
 */
async function resolverAvaliacaoDoEstudante(
  studentId: string,
  assessmentId: string | null,
): Promise<InfoAvaliacaoDaFicha | null> {
  return prisma.assessment.findFirst({
    where: {
      ...(assessmentId ? { id: assessmentId } : {}),
      results: { some: { studentId } },
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
}

/** Ficha vazia — estudante cadastrado, avaliação sem registro dele. Nada zerado. */
function fichaSemRegistro(
  estudante: EstudanteNoEscopo,
  avaliacao: InfoAvaliacaoDaFicha | null,
  faixas: FaixasParaExibicao,
  versaoRelatorio: string,
  nomeOriginal: string,
): FichaDoEstudante {
  return {
    studentId: estudante.id,
    uniqueCode: estudante.uniqueCode,
    nomeOriginal,
    codigoExterno: estudante.codigoExterno,
    schoolId: estudante.schoolId,
    escolaNome: estudante.school.name,
    classId: estudante.classId,
    turmaNome: estudante.class.name,
    codigoTurma: estudante.class.externalCode,
    anoEscolar: estudante.class.anoEscolar,
    avaliacao,
    situacao: 'SEM_REGISTRO',
    nivelOriginal: null,
    nivelNormalizado: null,
    acertosTotais: null,
    itensPossiveis: null,
    fracaoTexto: AUSENTE,
    percentualTexto: AUSENTE,
    performance: null,
    habilidades: [],
    habilidadesEmFragilidade: null,
    habilidadesEmAtencao: null,
    faixas,
    versaoRelatorio,
  }
}

/**
 * Ficha individual do estudante.
 *
 * `assessmentId` é filtro de exibição vindo da URL; o escopo já foi fechado na leitura do
 * estudante, e o resultado é buscado pela chave `(assessmentId, studentId)`.
 */
export async function obterFichaDoEstudante(
  ctx: AuthContext,
  studentId: string,
  assessmentId: string | null = null,
): Promise<FichaDoEstudante> {
  const estudanteBruto = await lerEstudanteNoEscopo(ctx, studentId)
  const estudante = aplicarSupressaoNominalEm(ctx, estudanteBruto)

  const faixas = await carregarFaixasAnaliticas()
  const exibicao = faixasParaExibicao(faixas)
  const versaoRelatorio = rotuloVersaoRelatorio(ctx)

  const avaliacao = await resolverAvaliacaoDoEstudante(estudante.id, assessmentId)

  if (!avaliacao) {
    return fichaSemRegistro(
      estudanteBruto,
      null,
      exibicao,
      versaoRelatorio,
      estudante.nomeOriginal,
    )
  }

  const resultado = await prisma.assessmentStudentResult.findUnique({
    where: {
      assessmentId_studentId: { assessmentId: avaliacao.id, studentId: estudante.id },
    },
    select: {
      avaliado: true,
      nivelOriginal: true,
      nivelNormalizado: true,
      acertosTotais: true,
      itensTotais: true,
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

  if (!resultado) {
    return fichaSemRegistro(
      estudanteBruto,
      avaliacao,
      exibicao,
      versaoRelatorio,
      estudante.nomeOriginal,
    )
  }

  // O detalhamento percorre as habilidades DA AVALIAÇÃO, não as que o estudante tem —
  // caso contrário uma habilidade sem célula preenchida sumiria da ficha em vez de
  // aparecer como ausência (Const. I).
  const habilidadesDaAvaliacao = await prisma.assessmentSkill.findMany({
    where: { assessmentId: avaliacao.id },
    orderBy: { skill: { ordem: 'asc' } },
    select: {
      skillId: true,
      referenceItems: true,
      skill: { select: { shortCode: true, referenceCode: true, descricao: true } },
    },
  })

  const porSkill = new Map(resultado.skillResults.map((r) => [r.skillId, r]))
  const avaliado = resultado.avaliado

  let fragilidade = 0
  let atencao = 0

  const habilidades: HabilidadeDaFicha[] = habilidadesDaAvaliacao.map((h) => {
    const bruto = porSkill.get(h.skillId)

    const fracao: MaybeFraction =
      avaliado &&
      bruto &&
      bruto.acertos !== null &&
      bruto.itensPossiveis !== null &&
      bruto.itensPossiveis > 0
        ? { acertos: bruto.acertos, itens: bruto.itensPossiveis }
        : null

    const faixa = classifyAnalyticalSkillResult(fracao, faixas.bands)
    if (faixa === 'FRAGILIDADE') fragilidade += 1
    else if (faixa === 'ATENCAO') atencao += 1

    return {
      skillId: h.skillId,
      shortCode: h.skill.shortCode,
      referenceCode: h.skill.referenceCode,
      descricao: h.skill.descricao,
      itensDeReferencia: h.referenceItems,
      // Para não avaliado a string da fonte também não aparece: ela costuma ser vazia,
      // e exibi-la só criaria uma coluna ambígua ao lado do travessão.
      valorOriginal: avaliado ? (bruto?.valorOriginal ?? null) : null,
      acertos: fracao === null ? null : fracao.acertos,
      itens: fracao === null ? null : fracao.itens,
      fracaoTexto:
        fracao === null ? AUSENTE : formatarFracao(fracao.acertos, fracao.itens),
      percentualTexto: formatPercent(toPercent(fracao)),
      faixa,
    }
  })

  const derivada = calculateStudentPerformance(
    habilidades.map((h) =>
      h.acertos === null || h.itens === null
        ? null
        : { acertos: h.acertos, itens: h.itens },
    ),
  )

  const armazenada: MaybeFraction =
    resultado.acertosTotais !== null &&
    resultado.itensTotais !== null &&
    resultado.itensTotais > 0
      ? { acertos: resultado.acertosTotais, itens: resultado.itensTotais }
      : null

  // Guarda dupla: mesmo que a importação houvesse gravado totais para um não avaliado,
  // eles não chegariam à tela como número (FR-093).
  const performance = avaliado ? (armazenada ?? derivada) : null

  return {
    studentId: estudante.id,
    uniqueCode: estudante.uniqueCode,
    nomeOriginal: estudante.nomeOriginal,
    codigoExterno: estudante.codigoExterno,
    schoolId: estudante.schoolId,
    escolaNome: estudanteBruto.school.name,
    classId: estudante.classId,
    turmaNome: estudanteBruto.class.name,
    codigoTurma: estudanteBruto.class.externalCode,
    anoEscolar: estudanteBruto.class.anoEscolar,

    avaliacao,
    situacao: avaliado ? 'AVALIADO' : 'NAO_AVALIADO',
    nivelOriginal: resultado.nivelOriginal,
    nivelNormalizado: avaliado ? resultado.nivelNormalizado : null,

    acertosTotais: performance === null ? null : performance.acertos,
    itensPossiveis: performance === null ? null : performance.itens,
    fracaoTexto:
      performance === null
        ? AUSENTE
        : formatarFracao(performance.acertos, performance.itens),
    percentualTexto: formatPercent(toPercent(performance)),
    performance,

    habilidades,
    habilidadesEmFragilidade: avaliado ? fragilidade : null,
    habilidadesEmAtencao: avaliado ? atencao : null,

    faixas: exibicao,
    versaoRelatorio,
  }
}
