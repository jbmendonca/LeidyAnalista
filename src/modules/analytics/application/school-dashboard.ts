import { prisma } from '@/server/prisma'
import {
  assertSchoolInScope,
  requireUser,
  type AuthContext,
} from '@/server/authorization'
import type { RankCriterion } from '@/modules/analytics/domain/rank-skills'
import {
  obterPainelAvaliacao,
  type PainelAvaliacao,
} from '@/modules/analytics/application/assessment-dashboard'

/**
 * ===========================================================================
 *  PAINEL DA ESCOLA — FR-074 a FR-076
 * ===========================================================================
 *
 * O painel da escola é o painel da avaliação **recortado por uma escola**, mais dois números
 * de cadastro (turmas e estudantes). Não existe aqui um segundo conjunto de agregações: o
 * recorte é um parâmetro, não uma implementação paralela. Duas implementações do mesmo
 * indicador divergem no primeiro ajuste de regra que alguém fizer em apenas uma delas.
 *
 * A autorização é a de sempre: `assertSchoolInScope` valida o `schoolId` recebido do cliente
 * contra o escopo resolvido no servidor e responde **404** — nunca 403 — para escola fora
 * dele (FR-006). O `schoolId` da barra de endereços é filtro, jamais permissão.
 */

export type AvaliacaoDaEscola = Readonly<{
  id: string
  nome: string
  ano: number
  ciclo: string
  componenteCurricular: string
  dataAplicacao: Date | null
  resultados: number
}>

export type EscolaDoPainel = Readonly<{
  id: string
  code: string
  name: string
  rede: string
  municipio: string
  estado: string
  totalTurmas: number
  totalEstudantes: number
}>

export type PainelEscola = Readonly<{
  escola: EscolaDoPainel
  avaliacoes: readonly AvaliacaoDaEscola[]
  avaliacaoSelecionada: AvaliacaoDaEscola | null
  /** `null` quando a escola ainda não tem nenhum resultado importado. */
  painel: PainelAvaliacao | null
}>

export type ParametrosPainelEscola = Readonly<{
  schoolId: string
  /** Avaliação escolhida na tela; sem ela, a mais recente com resultado na escola. */
  assessmentId?: string | null
  criterio?: RankCriterion
}>

/**
 * Avaliações que efetivamente têm resultado importado **nesta escola**.
 *
 * Listar todas as avaliações da rede levaria o usuário a abrir um painel legitimamente
 * vazio e a concluir que a escola foi mal — quando o fato é que nada foi importado.
 */
export async function listarAvaliacoesDaEscola(
  ctx: AuthContext,
  schoolId: string,
): Promise<readonly AvaliacaoDaEscola[]> {
  requireUser(ctx)
  const escopo = assertSchoolInScope(ctx, schoolId)

  const grupos = await prisma.assessmentStudentResult.groupBy({
    by: ['assessmentId'],
    where: { schoolId: escopo },
    _count: { _all: true },
  })
  if (grupos.length === 0) return []

  const avaliacoes = await prisma.assessment.findMany({
    where: { id: { in: grupos.map((g) => g.assessmentId) } },
    orderBy: [{ ano: 'desc' }, { dataAplicacao: 'desc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      ano: true,
      ciclo: true,
      componenteCurricular: true,
      dataAplicacao: true,
    },
  })

  const contagens = new Map(grupos.map((g) => [g.assessmentId, g._count._all]))

  return avaliacoes.map((a) => ({
    ...a,
    resultados: contagens.get(a.id) ?? 0,
  }))
}

export async function obterPainelEscola(
  ctx: AuthContext,
  params: ParametrosPainelEscola,
): Promise<PainelEscola> {
  requireUser(ctx)
  // Primeira coisa a acontecer: escola fora do escopo lança 404 antes de qualquer leitura.
  const schoolId = assertSchoolInScope(ctx, params.schoolId)

  const registro = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      code: true,
      name: true,
      rede: true,
      municipio: true,
      estado: true,
      _count: { select: { classes: true, students: true } },
    },
  })
  // `assertSchoolInScope` já garantiu o escopo; ausência aqui só acontece se a escola tiver
  // sido removida entre a resolução do contexto e esta leitura.
  if (!registro) throw new Error('Escola não encontrada após validação de escopo.')

  const escola: EscolaDoPainel = {
    id: registro.id,
    code: registro.code,
    name: registro.name,
    rede: registro.rede,
    municipio: registro.municipio,
    estado: registro.estado,
    totalTurmas: registro._count.classes,
    totalEstudantes: registro._count.students,
  }

  const avaliacoes = await listarAvaliacoesDaEscola(ctx, schoolId)

  const selecionada =
    (params.assessmentId
      ? avaliacoes.find((a) => a.id === params.assessmentId)
      : undefined) ??
    avaliacoes[0] ??
    null

  if (!selecionada) {
    return { escola, avaliacoes, avaliacaoSelecionada: null, painel: null }
  }

  const painel = await obterPainelAvaliacao(ctx, {
    assessmentId: selecionada.id,
    schoolId,
    ...(params.criterio ? { criterio: params.criterio } : {}),
  })

  return { escola, avaliacoes, avaliacaoSelecionada: selecionada, painel }
}
