import { cookies } from 'next/headers'
import { prisma } from '@/server/prisma'
import {
  COOKIE_SESSAO,
  obterSessaoValida,
  tocarSessao,
} from '@/modules/auth/infra/session-repository'
import { resolveAllowedSchoolIds, type AuthContext } from '@/server/authorization'

/**
 * Resolve a identidade do requisitante a partir do cookie de sessão.
 *
 * É o único ponto do sistema que estabelece quem é o usuário. Nada aqui lê
 * cabeçalho, corpo ou query string — se lesse, o cliente poderia declarar a
 * própria identidade.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const store = await cookies()
  const sessionId = store.get(COOKIE_SESSAO)?.value
  if (!sessionId) return null

  const sessao = await obterSessaoValida(sessionId)
  if (!sessao) return null

  const usuario = await prisma.user.findUnique({
    where: { id: sessao.userId },
    select: { id: true, role: true, active: true, canAccessNominalData: true },
  })
  if (!usuario || !usuario.active) return null

  void tocarSessao(sessionId)

  const allowedSchoolIds = await resolveAllowedSchoolIds(usuario.id, usuario.role)

  return {
    userId: usuario.id,
    role: usuario.role,
    allowedSchoolIds,
    canAccessNominalData: usuario.canAccessNominalData,
  }
}
