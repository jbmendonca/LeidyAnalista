import { prisma } from '@/server/prisma'
import { requireUser, schoolScopeFilter, type AuthContext } from '@/server/authorization'

/**
 * Lista as avaliações do sistema.
 *
 * `Assessment` é cadastro de referência e não tem `schoolId`: a avaliação existe para a rede
 * inteira. O que **é** dado de escola são os resultados — e por isso a contagem exibida ao
 * lado de cada avaliação passa por `schoolScopeFilter`. Sem isso, o número de resultados
 * revelaria o volume de outras escolas a quem não pode vê-las: a lista pareceria segura e o
 * vazamento estaria na coluna da direita.
 */

export type AvaliacaoDaLista = {
  id: string
  nome: string
  ano: number
  ciclo: string
  componenteCurricular: string
  dataAplicacao: Date | null
  status: string
  /** Resultados dentro do escopo do requisitante — nunca o total da rede. */
  resultadosNoEscopo: number
}

export async function listarAvaliacoes(ctx: AuthContext): Promise<AvaliacaoDaLista[]> {
  const usuario = requireUser(ctx)
  const escopo = schoolScopeFilter(usuario)

  const avaliacoes = await prisma.assessment.findMany({
    orderBy: [{ ano: 'desc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      ano: true,
      ciclo: true,
      componenteCurricular: true,
      dataAplicacao: true,
      status: true,
    },
  })

  if (avaliacoes.length === 0) return []

  const contagens = await prisma.assessmentStudentResult.groupBy({
    by: ['assessmentId'],
    where: { schoolId: { in: [...escopo.in] } },
    _count: { _all: true },
  })

  const porAvaliacao = new Map(contagens.map((c) => [c.assessmentId, c._count._all]))

  return avaliacoes.map((a) => ({
    ...a,
    resultadosNoEscopo: porAvaliacao.get(a.id) ?? 0,
  }))
}
