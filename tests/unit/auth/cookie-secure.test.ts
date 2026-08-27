import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regressão do defeito que tornava o sistema inutilizável fora de `localhost`.
 *
 * Sintoma: o login parecia funcionar e a navegação seguinte voltava para a tela
 * de entrada, sem mensagem de erro. Causa: o cookie saía com `Secure` porque
 * `next start` define `NODE_ENV=production`, e o navegador descarta cookie
 * `Secure` recebido por HTTP — exceto em `localhost`, que é tratado como
 * contexto seguro e por isso escondia o problema em desenvolvimento.
 */

const cabecalhos = new Map<string, string>()

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (nome: string) => cabecalhos.get(nome.toLowerCase()) ?? null,
  }),
}))

vi.mock('@/server/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const variaveis = { ...process.env }

async function decidir(): Promise<boolean> {
  vi.resetModules()
  const { cookieDeveSerSecure } = await import('@/server/request-protocol')
  return cookieDeveSerSecure()
}

beforeEach(() => {
  cabecalhos.clear()
  process.env = { ...variaveis }
  delete process.env['SESSION_COOKIE_SECURE']
})

describe('atributo Secure do cookie de sessão', () => {
  it('NÃO marca Secure quando a requisição chega por HTTP num IP de rede', async () => {
    cabecalhos.set('host', '172.17.4.96:3000')
    // Sem `x-forwarded-proto`: não há evidência de HTTPS.
    expect(await decidir()).toBe(false)
  })

  it('marca Secure quando o proxy informa HTTPS', async () => {
    cabecalhos.set('host', 'painel.rede.gov.br')
    cabecalhos.set('x-forwarded-proto', 'https')
    expect(await decidir()).toBe(true)
  })

  it('lê apenas o primeiro protocolo quando o cabeçalho vem encadeado', async () => {
    cabecalhos.set('host', 'painel.rede.gov.br')
    cabecalhos.set('x-forwarded-proto', 'https, http')
    expect(await decidir()).toBe(true)
  })

  it('NÃO marca Secure quando o proxy informa HTTP', async () => {
    cabecalhos.set('host', 'painel.rede.gov.br')
    cabecalhos.set('x-forwarded-proto', 'http')
    expect(await decidir()).toBe(false)
  })

  it('não marca Secure em localhost por HTTP — e é isso que fazia o defeito passar', async () => {
    cabecalhos.set('host', 'localhost:3000')
    expect(await decidir()).toBe(false)
  })

  it('a variável de ambiente vence a detecção, nos dois sentidos', async () => {
    cabecalhos.set('host', '172.17.4.96:3000')
    process.env['SESSION_COOKIE_SECURE'] = 'true'
    expect(await decidir()).toBe(true)

    cabecalhos.set('x-forwarded-proto', 'https')
    process.env['SESSION_COOKIE_SECURE'] = 'false'
    expect(await decidir()).toBe(false)
  })

  it('NUNCA decide por NODE_ENV', async () => {
    cabecalhos.set('host', '172.17.4.96:3000')
    // `NODE_ENV` é somente leitura nos tipos do Node; o cast é o mínimo para
    // reproduzir o que `next start` faz em tempo de execução.
    ;(process.env as Record<string, string>)['NODE_ENV'] = 'production'
    // Era exatamente aqui que o sistema quebrava: `next start` põe
    // NODE_ENV=production mesmo servindo em HTTP puro.
    expect(await decidir()).toBe(false)
  })
})
