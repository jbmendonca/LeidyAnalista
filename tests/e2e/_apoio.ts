import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'
import type { Page } from '@playwright/test'

/**
 * Apoio dos testes de ponta a ponta.
 *
 * Os usuários de teste são criados direto no banco: o objetivo é exercitar a
 * aplicação, não o cadastro de usuários, e assim cada cenário parte de um
 * estado conhecido.
 */

export const prisma = new PrismaClient()

export const SENHA_TESTE = 'senha-de-teste-e2e-2026'

export type UsuarioTeste = {
  id: string
  email: string
  senha: string
}

export async function criarUsuario(opcoes: {
  sufixo: string
  role: 'ADMIN' | 'ANALISTA' | 'ESCOLA'
  escolas?: string[]
  nominal?: boolean
}): Promise<UsuarioTeste> {
  const email = `e2e-${opcoes.role.toLowerCase()}-${opcoes.sufixo}@teste.local`
  const usuario = await prisma.user.create({
    data: {
      email,
      name: `E2E ${opcoes.role}`,
      passwordHash: await hash(SENHA_TESTE),
      role: opcoes.role,
      canAccessNominalData: opcoes.nominal ?? true,
      ...(opcoes.escolas?.length
        ? { schools: { create: opcoes.escolas.map((schoolId) => ({ schoolId })) } }
        : {}),
    },
  })
  return { id: usuario.id, email, senha: SENHA_TESTE }
}

export async function criarEscola(sufixo: string, nome: string): Promise<string> {
  const escola = await prisma.school.create({
    data: {
      code: `E2E-${nome}-${sufixo}`,
      name: nome,
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RR',
    },
  })
  return escola.id
}

export async function entrar(page: Page, usuario: UsuarioTeste): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel(/e-?mail/i).fill(usuario.email)
  await page.getByLabel(/senha/i).fill(usuario.senha)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'), { timeout: 15_000 })
}

export async function limpar(sufixo: string): Promise<void> {
  const escolas = await prisma.school.findMany({
    where: { code: { contains: sufixo } },
    select: { id: true },
  })
  const ids = escolas.map((e) => e.id)

  if (ids.length > 0) {
    await prisma.assessmentStudentResult.deleteMany({ where: { schoolId: { in: ids } } })
    await prisma.importIssue.deleteMany({ where: { import: { schoolId: { in: ids } } } })
    await prisma.importRow.deleteMany({ where: { import: { schoolId: { in: ids } } } })
    await prisma.import.deleteMany({ where: { schoolId: { in: ids } } })
    await prisma.student.deleteMany({ where: { schoolId: { in: ids } } })
    await prisma.class.deleteMany({ where: { schoolId: { in: ids } } })
    await prisma.userSchool.deleteMany({ where: { schoolId: { in: ids } } })
  }

  const usuarios = await prisma.user.findMany({
    where: { email: { contains: sufixo } },
    select: { id: true },
  })
  const usuarioIds = usuarios.map((u) => u.id)
  if (usuarioIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: usuarioIds } } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: usuarioIds } } })
    await prisma.user.deleteMany({ where: { id: { in: usuarioIds } } })
  }

  await prisma.assessment.deleteMany({ where: { nome: { contains: sufixo } } })
  if (ids.length > 0) {
    await prisma.school.deleteMany({ where: { id: { in: ids } } })
  }
}
