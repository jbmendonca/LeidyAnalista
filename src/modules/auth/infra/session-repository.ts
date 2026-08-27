import { randomBytes } from 'node:crypto'
import { prisma } from '@/server/prisma'
import { env } from '@/lib/env'

export const COOKIE_SESSAO = 'painel_sessao'

/**
 * Identificador de sessão opaco, 256 bits de entropia.
 *
 * Sessão em banco, e não JWT: precisa ser revogável no ato. Quando o acesso de
 * alguém a dados nominais de crianças é cortado, o corte tem de valer na
 * requisição seguinte — um JWT válido por mais uma hora não serve.
 */
function gerarIdSessao(): string {
  return randomBytes(32).toString('base64url')
}

export type SessaoValida = {
  sessionId: string
  userId: string
}

export async function criarSessao(userId: string): Promise<{
  id: string
  expiresAt: Date
}> {
  const expiresAt = new Date(Date.now() + env.SESSION_ABSOLUTE_HOURS * 3_600_000)
  const sessao = await prisma.session.create({
    data: { id: gerarIdSessao(), userId, expiresAt },
  })
  return { id: sessao.id, expiresAt: sessao.expiresAt }
}

/**
 * Recupera a sessão aplicando as duas expirações: absoluta e por inatividade.
 * Sessão vencida é removida na hora — não fica lixo revogável no banco.
 */
export async function obterSessaoValida(
  sessionId: string,
): Promise<SessaoValida | null> {
  const sessao = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, expiresAt: true, lastSeenAt: true },
  })
  if (!sessao) return null

  const agora = Date.now()
  const limiteInatividade = env.SESSION_IDLE_MINUTES * 60_000

  const expirouAbsoluto = sessao.expiresAt.getTime() <= agora
  const expirouInatividade = agora - sessao.lastSeenAt.getTime() > limiteInatividade

  if (expirouAbsoluto || expirouInatividade) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined)
    return null
  }

  return { sessionId: sessao.id, userId: sessao.userId }
}

/** Renova a inatividade, no máximo uma vez por minuto, para não escrever a cada requisição. */
export async function tocarSessao(sessionId: string): Promise<void> {
  await prisma.session
    .updateMany({
      where: { id: sessionId, lastSeenAt: { lt: new Date(Date.now() - 60_000) } },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => undefined)
}

export async function revogarSessao(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined)
}

export async function revogarSessoesDoUsuario(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } })
}

export async function limparSessoesExpiradas(): Promise<number> {
  const r = await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } })
  return r.count
}
