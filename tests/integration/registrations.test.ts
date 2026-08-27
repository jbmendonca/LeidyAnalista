import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/server/prisma'
import { resolveAllowedSchoolIds, type AuthContext } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import {
  criarEscola,
  atualizarEscola,
} from '@/modules/schools/application/school-mutations'
import { listarEscolas } from '@/modules/schools/application/list-schools'
import { obterEscola } from '@/modules/schools/application/get-school'
import { criarAvaliacao } from '@/modules/assessments/application/assessment-mutations'
import { listarAvaliacoes } from '@/modules/assessments/application/list-assessment'
import { criarTurma, atualizarTurma } from '@/modules/classes/application/class-mutations'
import { listarTurmas } from '@/modules/classes/application/list-class'
import { obterTurma } from '@/modules/classes/application/get-class'

/**
 * Cadastros — escolas, avaliações e turmas — contra o Postgres real.
 *
 * A suíte roda no banco de verdade de propósito. O que estes testes protegem não é lógica de
 * cálculo: é o índice único `(schoolId, externalCode)`, a transação que une escrita e
 * auditoria, e o recorte por escola. Nenhuma dessas três coisas existe em um banco falso —
 * um mock passaria com o índice ausente e a transação quebrada.
 *
 * Todos os registros criados levam o prefixo `ZZTEST-` e são removidos no `afterAll`.
 */

const PREFIXO = `ZZTEST-${Date.now()}`

type Fixtura = {
  admin: AuthContext
  analistaA: AuthContext
  escola: AuthContext
  escolaAId: string
  escolaBId: string
  avaliacaoId: string
}

const criados = {
  userIds: [] as string[],
  schoolIds: [] as string[],
  assessmentIds: [] as string[],
}

let f: Fixtura

/** Monta o contexto do mesmo jeito que `getAuthContext` — inclusive relendo o escopo. */
async function contextoDe(userId: string): Promise<AuthContext> {
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, role: true, canAccessNominalData: true },
  })

  return {
    userId: usuario.id,
    role: usuario.role,
    allowedSchoolIds: await resolveAllowedSchoolIds(usuario.id, usuario.role),
    canAccessNominalData: usuario.canAccessNominalData,
  }
}

async function criarUsuario(
  role: 'ADMIN' | 'ANALISTA' | 'ESCOLA',
  sufixo: string,
): Promise<string> {
  const usuario = await prisma.user.create({
    data: {
      email: `${PREFIXO}-${sufixo}@teste.local`.toLowerCase(),
      passwordHash: 'hash-de-teste-nao-utilizado',
      name: `Usuário de teste ${sufixo}`,
      role,
    },
    select: { id: true },
  })
  criados.userIds.push(usuario.id)
  return usuario.id
}

/** Conta as entradas de auditoria de uma entidade. Zero aqui é falha de transação. */
async function auditoriasDe(entityType: string, entityId: string): Promise<number> {
  return prisma.auditLog.count({ where: { entityType, entityId } })
}

beforeAll(async () => {
  const adminId = await criarUsuario('ADMIN', 'admin')
  const analistaId = await criarUsuario('ANALISTA', 'analista')
  const escolaId = await criarUsuario('ESCOLA', 'escola')

  const admin = await contextoDe(adminId)

  const escolaA = await criarEscola(admin, {
    code: `${PREFIXO}-A`,
    name: 'Escola A de Teste',
    rede: 'Municipal',
    municipio: 'Fortaleza',
    estado: 'CE',
  })
  const escolaB = await criarEscola(admin, {
    code: `${PREFIXO}-B`,
    name: 'Escola B de Teste',
    rede: 'Municipal',
    municipio: 'Sobral',
    estado: 'CE',
  })
  criados.schoolIds.push(escolaA.id, escolaB.id)

  // O usuário ESCOLA e o ANALISTA veem apenas a Escola A.
  await prisma.userSchool.createMany({
    data: [
      { userId: escolaId, schoolId: escolaA.id },
      { userId: analistaId, schoolId: escolaA.id },
    ],
  })

  // O escopo do ADMIN é recalculado: as escolas nasceram depois do contexto anterior.
  const adminAtualizado = await contextoDe(adminId)

  const avaliacao = await criarAvaliacao(adminAtualizado, {
    nome: `${PREFIXO} Leitura`,
    ano: 2026,
    ciclo: 'II Ciclo',
    componenteCurricular: 'Leitura',
    dataAplicacao: new Date('2026-05-12T00:00:00Z'),
  })
  criados.assessmentIds.push(avaliacao.id)

  f = {
    admin: adminAtualizado,
    analistaA: await contextoDe(analistaId),
    escola: await contextoDe(escolaId),
    escolaAId: escolaA.id,
    escolaBId: escolaB.id,
    avaliacaoId: avaliacao.id,
  }
})

afterAll(async () => {
  // Ordem imposta pelas chaves estrangeiras: filhos antes dos pais.
  await prisma.class.deleteMany({ where: { schoolId: { in: criados.schoolIds } } })
  await prisma.auditLog.deleteMany({ where: { userId: { in: criados.userIds } } })
  await prisma.assessment.deleteMany({ where: { id: { in: criados.assessmentIds } } })
  await prisma.userSchool.deleteMany({ where: { userId: { in: criados.userIds } } })
  await prisma.school.deleteMany({ where: { id: { in: criados.schoolIds } } })
  await prisma.user.deleteMany({ where: { id: { in: criados.userIds } } })
  await prisma.$disconnect()
})

describe('cadastro de escolas', () => {
  it('grava a escola e a devolve na listagem do administrador', async () => {
    const escolas = await listarEscolas(f.admin)
    const a = escolas.find((e) => e.id === f.escolaAId)

    expect(a).toBeDefined()
    expect(a?.code).toBe(`${PREFIXO}-A`)
    expect(a?.estado).toBe('CE')
  })

  it('registra auditoria da criação na mesma transação da escrita', async () => {
    expect(await auditoriasDe('School', f.escolaAId)).toBeGreaterThanOrEqual(1)
  })

  it('registra auditoria também na atualização, com valor anterior', async () => {
    const antes = await auditoriasDe('School', f.escolaBId)

    await atualizarEscola(f.admin, f.escolaBId, {
      code: `${PREFIXO}-B`,
      name: 'Escola B de Teste (renomeada)',
      rede: 'Estadual',
      municipio: 'Sobral',
      estado: 'CE',
    })

    expect(await auditoriasDe('School', f.escolaBId)).toBe(antes + 1)

    const ultima = await prisma.auditLog.findFirst({
      where: { entityType: 'School', entityId: f.escolaBId },
      orderBy: { occurredAt: 'desc' },
      select: { beforeValue: true, afterValue: true },
    })

    expect(ultima?.beforeValue).toMatchObject({ rede: 'Municipal' })
    expect(ultima?.afterValue).toMatchObject({ rede: 'Estadual' })
  })

  it('recusa código de escola repetido com 409', async () => {
    const promessa = criarEscola(f.admin, {
      code: `${PREFIXO}-A`,
      name: 'Outra escola com o mesmo código',
      rede: 'Municipal',
      municipio: 'Fortaleza',
      estado: 'CE',
    })

    await expect(promessa).rejects.toBeInstanceOf(AppError)
    await expect(promessa).rejects.toMatchObject({ codigo: 'CONFLITO' })
  })

  it('não deixa perfil sem permissão de escrita criar escola', async () => {
    const promessa = criarEscola(f.escola, {
      code: `${PREFIXO}-X`,
      name: 'Escola criada indevidamente',
      rede: 'Municipal',
      municipio: 'Fortaleza',
      estado: 'CE',
    })

    await expect(promessa).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })
  })
})

describe('escopo por escola', () => {
  it('usuário ESCOLA vinculado à Escola A não enxerga a Escola B', async () => {
    const escolas = await listarEscolas(f.escola)
    const ids = escolas.map((e) => e.id)

    expect(ids).toContain(f.escolaAId)
    expect(ids).not.toContain(f.escolaBId)
    expect(escolas).toHaveLength(1)
  })

  it('lê a própria escola e recebe 404 — não 403 — na escola alheia', async () => {
    await expect(obterEscola(f.escola, f.escolaAId)).resolves.toMatchObject({
      id: f.escolaAId,
    })

    // 403 confirmaria que a Escola B existe. O 404 é indistinguível de "não existe".
    await expect(obterEscola(f.escola, f.escolaBId)).rejects.toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      status: 404,
    })
  })

  it('ANALISTA não cria turma em escola fora do seu escopo', async () => {
    const promessa = criarTurma(f.analistaA, {
      schoolId: f.escolaBId,
      externalCode: `${PREFIXO}-invasao`,
      name: 'Turma indevida',
      anoEscolar: '4º ano',
    })

    await expect(promessa).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' })

    const existe = await prisma.class.findFirst({
      where: { schoolId: f.escolaBId, externalCode: `${PREFIXO}-invasao` },
    })
    expect(existe).toBeNull()
  })
})

describe('cadastro de avaliações', () => {
  it('grava a avaliação com a data informada e a devolve na listagem', async () => {
    const avaliacoes = await listarAvaliacoes(f.admin)
    const criada = avaliacoes.find((a) => a.id === f.avaliacaoId)

    expect(criada).toBeDefined()
    expect(criada?.ano).toBe(2026)
    expect(criada?.dataAplicacao?.toISOString()).toBe('2026-05-12T00:00:00.000Z')
  })

  it('registra auditoria da criação', async () => {
    expect(await auditoriasDe('Assessment', f.avaliacaoId)).toBeGreaterThanOrEqual(1)
  })

  it('guarda ausência de data como NULL, nunca como a data de hoje', async () => {
    const semData = await criarAvaliacao(f.admin, {
      nome: `${PREFIXO} Sem data`,
      ano: 2026,
      ciclo: 'II Ciclo',
      componenteCurricular: 'Leitura',
      dataAplicacao: null,
    })
    criados.assessmentIds.push(semData.id)

    const gravada = await prisma.assessment.findUniqueOrThrow({
      where: { id: semData.id },
      select: { dataAplicacao: true },
    })

    expect(gravada.dataAplicacao).toBeNull()
  })
})

describe('cadastro de turmas', () => {
  it('grava a turma e a devolve na listagem da escola', async () => {
    const turma = await criarTurma(f.admin, {
      schoolId: f.escolaAId,
      externalCode: `${PREFIXO}-t1`,
      name: '4º ano A',
      anoEscolar: '4º ano',
    })

    const turmas = await listarTurmas(f.admin, f.escolaAId)
    expect(turmas.map((t) => t.id)).toContain(turma.id)

    await expect(obterTurma(f.analistaA, turma.id)).resolves.toMatchObject({
      externalCode: `${PREFIXO}-t1`,
      schoolId: f.escolaAId,
    })
  })

  it('registra auditoria da criação e da atualização', async () => {
    const turma = await criarTurma(f.analistaA, {
      schoolId: f.escolaAId,
      externalCode: `${PREFIXO}-t-auditada`,
      name: '5º ano A',
      anoEscolar: '5º ano',
    })

    expect(await auditoriasDe('Class', turma.id)).toBe(1)

    await atualizarTurma(f.analistaA, turma.id, {
      schoolId: f.escolaAId,
      externalCode: `${PREFIXO}-t-auditada`,
      name: '5º ano B',
      anoEscolar: '5º ano',
    })

    expect(await auditoriasDe('Class', turma.id)).toBe(2)
  })

  it('grava o código já normalizado: " abc123 " vira "abc123"', async () => {
    const turma = await criarTurma(f.admin, {
      schoolId: f.escolaAId,
      // Espaço nos dois lados, exatamente como vem do arquivo da rede.
      externalCode: ` ${PREFIXO}-abc123 `,
      name: 'Turma com espaços no código',
      anoEscolar: '4º ano',
    })

    const gravada = await prisma.class.findUniqueOrThrow({
      where: { id: turma.id },
      select: { externalCode: true },
    })

    expect(gravada.externalCode).toBe(`${PREFIXO}-abc123`)
    expect(gravada.externalCode).not.toMatch(/^\s|\s$/)
  })

  it('recusa código de turma repetido na mesma escola com 409', async () => {
    await criarTurma(f.admin, {
      schoolId: f.escolaAId,
      externalCode: `${PREFIXO}-dup`,
      name: 'Primeira turma',
      anoEscolar: '4º ano',
    })

    const promessa = criarTurma(f.admin, {
      schoolId: f.escolaAId,
      externalCode: `${PREFIXO}-dup`,
      name: 'Segunda turma com o mesmo código',
      anoEscolar: '5º ano',
    })

    await expect(promessa).rejects.toBeInstanceOf(AppError)
    await expect(promessa).rejects.toMatchObject({
      codigo: 'CONFLITO',
      message: 'Já existe turma com este código nesta escola.',
    })
  })

  it('trata o código com espaços como duplicata do já gravado', async () => {
    // A normalização precisa acontecer ANTES da checagem de unicidade: se o espaço
    // sobrevivesse, o índice veria dois códigos distintos e a mesma turma nasceria duas vezes.
    const promessa = criarTurma(f.admin, {
      schoolId: f.escolaAId,
      externalCode: `  ${PREFIXO}-dup  `,
      name: 'Duplicata disfarçada de espaço',
      anoEscolar: '5º ano',
    })

    await expect(promessa).rejects.toMatchObject({ codigo: 'CONFLITO' })
  })

  it('aceita o mesmo código em outra escola — a unicidade é por escola', async () => {
    const turma = await criarTurma(f.admin, {
      schoolId: f.escolaBId,
      externalCode: `${PREFIXO}-dup`,
      name: 'Turma homônima em outra escola',
      anoEscolar: '4º ano',
    })

    expect(turma.id).toBeTruthy()
  })

  it('lista apenas as turmas do escopo do usuário ESCOLA', async () => {
    const turmas = await listarTurmas(f.escola)

    expect(turmas.length).toBeGreaterThan(0)
    expect(turmas.every((t) => t.schoolId === f.escolaAId)).toBe(true)
  })

  it('recusa filtro por escola fora do escopo com 404, sem reduzir a lista em silêncio', async () => {
    await expect(listarTurmas(f.escola, f.escolaBId)).rejects.toMatchObject({
      codigo: 'NAO_ENCONTRADO',
    })
  })
})
