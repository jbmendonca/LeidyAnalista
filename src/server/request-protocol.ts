import { headers } from 'next/headers'

import { env } from '@/lib/env'
import { logger } from '@/server/logger'

/**
 * Decide se o cookie de sessão deve levar o atributo `Secure`.
 *
 * ## Por que não usar `NODE_ENV === 'production'`
 *
 * `next start` define `NODE_ENV=production` sempre, inclusive quando o sistema
 * é servido em HTTP puro numa rede local. Um cookie `Secure` enviado por HTTP
 * é **descartado pelo navegador** — e o efeito é traiçoeiro: o login parece
 * funcionar, mas a requisição seguinte chega sem sessão e o usuário volta para
 * a tela de entrada, sem mensagem de erro alguma.
 *
 * `http://localhost` escapa disso porque os navegadores o tratam como contexto
 * seguro. `http://172.16.0.10:3000` não escapa. Foi exatamente esse o caso.
 *
 * ## Como a decisão é tomada
 *
 * 1. `SESSION_COOKIE_SECURE` explícito no ambiente vence tudo.
 * 2. Sem ele, vale a **evidência positiva** de HTTPS: o cabeçalho
 *    `x-forwarded-proto` posto pelo proxy que termina o TLS.
 * 3. Sem evidência, o cookie vai sem `Secure`, para que o sistema funcione.
 *
 * ## O que isto NÃO significa
 *
 * Não afrouxa o FR-126: **produção continua exigindo HTTPS**. O que muda é que
 * a exigência passa a ser da implantação, verificável, em vez de um atributo
 * de cookie que quebra o login em silêncio quando a premissa não se confirma.
 * Servir dados de crianças por HTTP fora de uma rede controlada continua
 * inaceitável — e o aviso abaixo existe para que ninguém faça isso sem saber.
 */
export async function cookieDeveSerSecure(): Promise<boolean> {
  if (env.SESSION_COOKIE_SECURE !== undefined) {
    return env.SESSION_COOKIE_SECURE
  }

  const cabecalhos = await headers()
  const protocolo = cabecalhos.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = cabecalhos.get('host') ?? ''

  const ehHttps = protocolo === 'https'
  if (ehHttps) return true

  if (!ehLocalhost(host)) {
    logger.warn('sessão emitida sem o atributo Secure', {
      motivo: 'requisição não chegou por HTTPS',
      host,
      orientacao:
        'Em produção, sirva o sistema atrás de TLS e defina SESSION_COOKIE_SECURE=true.',
    })
  }

  return false
}

function ehLocalhost(host: string): boolean {
  const semPorta = host.split(':')[0]?.toLowerCase() ?? ''
  return semPorta === 'localhost' || semPorta === '127.0.0.1' || semPorta === '::1'
}
