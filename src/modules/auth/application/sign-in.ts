'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/server/prisma'
import { isProduction } from '@/lib/env'
import { credenciaisSchema } from '@/modules/auth/schemas'
import {
  consumirTempoDeVerificacao,
  verifyPassword,
} from '@/modules/auth/domain/password'
import {
  COOKIE_SESSAO,
  criarSessao,
  obterSessaoValida,
  revogarSessao,
} from '@/modules/auth/infra/session-repository'
import { logger } from '@/server/logger'

export type EstadoLogin = { erro?: string }

/**
 * Autenticação por credenciais.
 *
 * A resposta é IDÊNTICA para e-mail inexistente, usuário inativo e senha
 * errada — mesma mensagem e mesmo tempo de resposta. Diferenciar qualquer um
 * desses casos permitiria enumerar quem tem conta no sistema.
 */
export async function signIn(
  _anterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const parsed = credenciaisSchema.safeParse({
    email: formData.get('email'),
    senha: formData.get('senha'),
  })

  const MENSAGEM_GENERICA = 'E-mail ou senha inválidos.'

  if (!parsed.success) {
    return { erro: MENSAGEM_GENERICA }
  }

  const { email, senha } = parsed.data

  const usuario = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, active: true },
  })

  if (!usuario || !usuario.active) {
    // Gasta o mesmo tempo do caminho válido, para não vazar por temporização.
    await consumirTempoDeVerificacao(senha)
    logger.warn('tentativa de autenticação rejeitada', { motivo: 'credencial' })
    return { erro: MENSAGEM_GENERICA }
  }

  const senhaCorreta = await verifyPassword(usuario.passwordHash, senha)
  if (!senhaCorreta) {
    logger.warn('tentativa de autenticação rejeitada', {
      motivo: 'credencial',
      userId: usuario.id,
    })
    return { erro: MENSAGEM_GENERICA }
  }

  const store = await cookies()

  // Rotação: uma sessão anterior no mesmo navegador é descartada, para que um
  // identificador capturado antes do login não continue válido depois.
  const anterior = store.get(COOKIE_SESSAO)?.value
  if (anterior) {
    const valida = await obterSessaoValida(anterior)
    if (valida) await revogarSessao(valida.sessionId)
  }

  const sessao = await criarSessao(usuario.id)

  store.set(COOKIE_SESSAO, sessao.id, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: sessao.expiresAt,
  })

  logger.info('sessão iniciada', { userId: usuario.id })
  redirect('/avaliacoes')
}
