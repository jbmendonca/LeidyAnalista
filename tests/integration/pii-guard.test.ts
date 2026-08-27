import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { PiiEmLogError, _verificarPii, logger } from '@/server/logger'

/**
 * ===========================================================================
 *  GUARDA DE DADOS PESSOAIS — FR-009, Const. IV
 * ===========================================================================
 *
 * Duas verificações complementares:
 *
 *  1. A guarda do logger de fato lança quando alguém tenta registrar um campo
 *     nominal. Sem isso a regra seria apenas uma boa intenção.
 *  2. Nenhum `AuditLog` gravado contém nome — a auditoria referencia por
 *     identificador, e o `uniqueCode` é seguro porque não deriva de dado
 *     pessoal (FR-131).
 *
 * Há ainda uma varredura estática do código de servidor, para pegar o
 * `console.log` de depuração que sobrevive à revisão.
 */

const prisma = new PrismaClient()

afterAll(async () => {
  await prisma.$disconnect()
})

describe('guarda do logger', () => {
  it('lança ao tentar registrar nome de estudante', () => {
    expect(() => logger.info('teste', { nomeOriginal: 'MARIA' })).toThrow(PiiEmLogError)
  })

  it('lança para campo nominal aninhado', () => {
    expect(() => _verificarPii({ estudante: { name: 'JOÃO' } })).toThrow(PiiEmLogError)
  })

  it('lança para campo nominal dentro de coleção', () => {
    expect(() => _verificarPii([{ ok: 1 }, { nome: 'ANA' }])).toThrow(PiiEmLogError)
  })

  it('aceita identificadores — id e uniqueCode não são dado pessoal', () => {
    expect(() =>
      logger.info('importação', {
        importId: 'abc',
        uniqueCode: 'A7K3M-QX9DF',
        studentId: 'xyz',
        totalRows: 111,
      }),
    ).not.toThrow()
  })

  it('não confunde campo legítimo com nominal', () => {
    expect(() => _verificarPii({ fileName: 'resultados.csv', schoolId: 'x' })).not.toThrow()
  })
})

describe('auditoria não guarda dado nominal', () => {
  it('nenhum registro de AuditLog contém campo de nome', async () => {
    const registros = await prisma.auditLog.findMany({
      take: 500,
      orderBy: { occurredAt: 'desc' },
      select: { beforeValue: true, afterValue: true, metadata: true },
    })

    for (const r of registros) {
      const serializado = JSON.stringify([r.beforeValue, r.afterValue, r.metadata])
      expect(serializado.toLowerCase()).not.toMatch(
        /"(nome|nomeoriginal|nomenormalizado|estudante|studentname)"\s*:/,
      )
    }
  })

  it('o modelo AuditLog não possui coluna de nome', async () => {
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audit_log'
    `
    const nomes = colunas.map((c) => c.column_name.toLowerCase())
    expect(nomes).not.toContain('nome')
    expect(nomes).not.toContain('name')
    expect(nomes).not.toContain('student_name')
  })
})

describe('varredura estática do código de servidor', () => {
  /**
   * `console.log` direto escapa da guarda do logger. Esta varredura existe
   * porque a única forma de a regra sobreviver é alguém — ou algo — cobrá-la
   * a cada mudança.
   */
  it('nenhum console.log fora do logger e dos scripts', () => {
    const raiz = resolve(__dirname, '../../src')
    const permitidos = [join('src', 'server', 'logger.ts')]
    const infratores: string[] = []

    for (const arquivo of percorrer(raiz)) {
      if (!/\.(ts|tsx)$/.test(arquivo)) continue
      if (permitidos.some((p) => arquivo.includes(p))) continue

      const conteudo = readFileSync(arquivo, 'utf-8')
      if (/\bconsole\.(log|debug|info)\s*\(/.test(conteudo)) {
        infratores.push(arquivo.replace(resolve(__dirname, '../..'), ''))
      }
    }

    expect(infratores, `use o logger de @/server/logger: ${infratores.join(', ')}`).toEqual([])
  })
})

function* percorrer(dir: string): Generator<string> {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada)
    if (statSync(caminho).isDirectory()) yield* percorrer(caminho)
    else yield caminho
  }
}
