import { prisma } from '@/server/prisma'
import { requireUser, type AuthContext } from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'

/**
 * Lê uma avaliação pelo identificador.
 *
 * A avaliação é cadastro de referência da rede: não tem escola e, portanto, não passa por
 * `assertSchoolInScope`. O escopo por escola incide sobre os **resultados** dela — e esse
 * recorte é aplicado em quem consulta resultados, não aqui. Exige apenas sessão válida.
 */

export type AvaliacaoDetalhada = {
  id: string
  nome: string
  ano: number
  ciclo: string
  componenteCurricular: string
  dataAplicacao: Date | null
  status: string
}

export async function obterAvaliacao(
  ctx: AuthContext,
  assessmentId: string,
): Promise<AvaliacaoDetalhada> {
  requireUser(ctx)

  const avaliacao = await prisma.assessment.findUnique({
    where: { id: assessmentId },
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

  if (!avaliacao) throw naoEncontrado('Avaliação')

  return avaliacao
}
