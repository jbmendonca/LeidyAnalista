import { describe, expect, it } from 'vitest'

import {
  consumirTempoDeVerificacao,
  hashPassword,
  verifyPassword,
} from '@/modules/auth/domain/password'

describe('hash de senha', () => {
  it('produz um hash argon2id', async () => {
    const hash = await hashPassword('uma-senha-qualquer-2026')
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('não é reversível: o hash não contém a senha', async () => {
    const senha = 'senha-secreta-do-usuario'
    const hash = await hashPassword(senha)
    expect(hash).not.toContain(senha)
  })

  it('a mesma senha gera hashes diferentes — o sal é por hash', async () => {
    const [a, b] = await Promise.all([hashPassword('igual'), hashPassword('igual')])
    expect(a).not.toBe(b)
  })
})

describe('verificação de senha', () => {
  it('aceita a senha correta', async () => {
    const hash = await hashPassword('correta-2026')
    expect(await verifyPassword(hash, 'correta-2026')).toBe(true)
  })

  it('rejeita a senha errada', async () => {
    const hash = await hashPassword('correta-2026')
    expect(await verifyPassword(hash, 'errada-2026')).toBe(false)
  })

  it('rejeita diferença de caixa', async () => {
    const hash = await hashPassword('Correta')
    expect(await verifyPassword(hash, 'correta')).toBe(false)
  })

  it('devolve false para hash malformado, sem lançar', async () => {
    // Um registro corrompido não pode virar exceção: a diferença de
    // comportamento entre "hash quebrado" e "senha errada" seria por si só
    // um vazamento de informação.
    expect(await verifyPassword('não-é-um-hash', 'qualquer')).toBe(false)
    expect(await verifyPassword('', 'qualquer')).toBe(false)
  })
})

describe('defesa contra enumeração de contas', () => {
  it('consumirTempoDeVerificacao resolve sem lançar', async () => {
    await expect(consumirTempoDeVerificacao('qualquer-senha')).resolves.toBeUndefined()
  })

  it('gasta tempo comparável ao de uma verificação real', async () => {
    const hash = await hashPassword('referencia')

    const t0 = performance.now()
    await verifyPassword(hash, 'errada')
    const real = performance.now() - t0

    const t1 = performance.now()
    await consumirTempoDeVerificacao('errada')
    const falso = performance.now() - t1

    // A margem é generosa de propósito: o objetivo é garantir que o caminho
    // do e-mail inexistente não retorne em microssegundos, e não cravar uma
    // igualdade que tornaria o teste instável.
    expect(falso).toBeGreaterThan(real * 0.2)
  })
})
