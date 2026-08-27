import { hash, verify } from '@node-rs/argon2'

/**
 * Parâmetros do argon2id.
 *
 * OWASP recomenda, para argon2id, no mínimo 19 MiB de memória, 2 iterações e
 * paralelismo 1. Ficamos acima disso: 64 MiB e 3 iterações. O custo é de
 * poucas centenas de milissegundos por autenticação — irrelevante para um
 * sistema com dezenas de logins por dia, e caro o bastante para inviabilizar
 * força bruta sobre um vazamento de hashes.
 */
const PARAMS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const

export async function hashPassword(senha: string): Promise<string> {
  return hash(senha, PARAMS)
}

/**
 * Verifica a senha. Nunca lança por hash malformado — devolve false, para que
 * um registro corrompido não vire vazamento de informação por diferença de
 * comportamento.
 */
export async function verifyPassword(
  hashArmazenado: string,
  senha: string,
): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha)
  } catch {
    return false
  }
}

/**
 * Hash descartável usado quando o e-mail não existe.
 *
 * Sem isso, autenticar com e-mail inexistente retornaria em microssegundos e
 * com e-mail existente em centenas de milissegundos — a diferença permite
 * enumerar quem tem conta no sistema. Gastar o mesmo tempo nos dois casos
 * fecha esse canal.
 */
const HASH_FALSO =
  '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG'

export async function consumirTempoDeVerificacao(senha: string): Promise<void> {
  await verifyPassword(HASH_FALSO, senha)
}
