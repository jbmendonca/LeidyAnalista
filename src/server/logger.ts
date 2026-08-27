import { isProduction } from '@/lib/env'

/**
 * Logger com guarda de dados pessoais.
 *
 * FR-009 e Princípio IV da constituição proíbem PII em log. A regra é fácil de
 * escrever e fácil de violar por acidente — basta um `console.log` de
 * depuração sobreviver à revisão. Esta guarda converte a regra em algo que o
 * próprio ambiente cobra: em desenvolvimento e em teste, tentar logar um campo
 * proibido lança erro.
 *
 * O `uniqueCode` do estudante é seguro em log porque não é derivado de dado
 * pessoal (FR-131).
 */
const CAMPOS_PROIBIDOS = new Set([
  'nome',
  'name',
  'nomeoriginal',
  'nomenormalizado',
  'estudante',
  'student',
  'studentname',
  'email',
  'password',
  'passwordhash',
  'senha',
])

export class PiiEmLogError extends Error {
  constructor(campo: string) {
    super(
      `Tentativa de registrar dado pessoal em log: campo "${campo}". ` +
        'FR-009 proíbe PII em log — use identificadores (id, uniqueCode).',
    )
    this.name = 'PiiEmLogError'
  }
}

function verificarPii(valor: unknown, caminho: string[] = []): void {
  if (valor === null || typeof valor !== 'object') return

  if (Array.isArray(valor)) {
    for (const item of valor) verificarPii(item, caminho)
    return
  }

  for (const [chave, sub] of Object.entries(valor)) {
    if (CAMPOS_PROIBIDOS.has(chave.toLowerCase())) {
      throw new PiiEmLogError([...caminho, chave].join('.'))
    }
    verificarPii(sub, [...caminho, chave])
  }
}

type Nivel = 'debug' | 'info' | 'warn' | 'error'

function emitir(nivel: Nivel, mensagem: string, contexto?: unknown): void {
  // Em produção a guarda não lança: derrubar uma requisição por causa de um
  // log seria pior que o log. Fora de produção ela lança, e o defeito é
  // corrigido antes de chegar lá.
  if (contexto !== undefined) {
    if (isProduction) {
      try {
        verificarPii(contexto)
      } catch {
        contexto = { piiRemovido: true }
      }
    } else {
      verificarPii(contexto)
    }
  }

  const linha = {
    nivel,
    mensagem,
    horario: new Date().toISOString(),
    ...(contexto !== undefined ? { contexto } : {}),
  }

  const saida = JSON.stringify(linha)
  if (nivel === 'error') console.error(saida)
  else if (nivel === 'warn') console.warn(saida)
  else console.log(saida)
}

export const logger = {
  debug: (mensagem: string, contexto?: unknown) =>
    isProduction ? undefined : emitir('debug', mensagem, contexto),
  info: (mensagem: string, contexto?: unknown) => emitir('info', mensagem, contexto),
  warn: (mensagem: string, contexto?: unknown) => emitir('warn', mensagem, contexto),
  error: (mensagem: string, contexto?: unknown) => emitir('error', mensagem, contexto),
}

/** Exposto para teste da própria guarda. */
export const _verificarPii = verificarPii
