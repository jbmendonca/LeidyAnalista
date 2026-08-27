'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  COOKIE_SESSAO,
  revogarSessao,
} from '@/modules/auth/infra/session-repository'

/**
 * Encerra a sessão. Remove a linha do banco — não apenas o cookie: um
 * identificador que continuasse válido no servidor tornaria o "sair" apenas
 * visual.
 */
export async function signOut(): Promise<void> {
  const store = await cookies()
  const sessionId = store.get(COOKIE_SESSAO)?.value

  if (sessionId) {
    await revogarSessao(sessionId)
  }

  store.delete(COOKIE_SESSAO)
  redirect('/entrar')
}
