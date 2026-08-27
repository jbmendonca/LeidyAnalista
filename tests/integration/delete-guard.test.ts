import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

import {
  contarDependenciasDaAvaliacao,
  excluirAvaliacao,
  excluirEscola,
  excluirHabilidade,
} from '@/modules/assessments/application/delete-guard'
import type { AuthContext } from '@/server/authorization'

/**
 * FR-018 — exclusão protegida.
 *
 * O que este teste garante: apagar uma escola ou uma avaliação **não** destrói
 * resultados de avaliação por efeito colateral. É a tradução operacional do
 * Princípio I: o dado importado é evidência, e evidência não some de raspão.
 */

const prisma = new PrismaClient()
const SUFIXO = `guarda-${Date.now()}`

let escolaId: string
let avaliacaoId: string
let importId: string
let userId: string
let ctxAdmin: AuthContext
let ctxEscola: AuthContext

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: `guarda-${SUFIXO}@teste.local`,
      name: 'Guarda',
      passwordHash: 'x',
      role: 'ADMIN',
      canAccessNominalData: true,
    },
  })
  userId = usuario.id

  const escola = await prisma.school.create({
    data: {
      code: `G-${SUFIXO}`,
      name: 'Escola da Guarda',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RR',
    },
  })
  escolaId = escola.id

  const avaliacao = await prisma.assessment.create({
    data: {
      nome: `Avaliação ${SUFIXO}`,
      ano: 2026,
      ciclo: 'II Ciclo',
      componenteCurricular: 'LÍNGUA PORTUGUESA',
    },
  })
  avaliacaoId = avaliacao.id

  const turma = await prisma.class.create({
    data: { schoolId: escolaId, externalCode: `T-${SUFIXO}`, name: 'Turma', anoEscolar: '4' },
  })

  const estudante = await prisma.student.create({
    data: {
      uniqueCode: `GRD${Date.now().toString(36).toUpperCase().slice(-7)}`,
      schoolId: escolaId,
      classId: turma.id,
      nomeOriginal: 'ESTUDANTE SINTETICO',
      nomeNormalizado: 'ESTUDANTE SINTETICO',
    },
  })

  const importacao = await prisma.import.create({
    data: {
      assessmentId: avaliacaoId,
      schoolId: escolaId,
      fileName: 'x.csv',
      fileHash: `hash-${SUFIXO}`,
      fileSize: 10,
      storagePath: '/tmp/x.csv',
      fileRetainedUntil: new Date(Date.now() + 86_400_000),
      status: 'COMPLETED',
      userId,
    },
  })
  importId = importacao.id

  const resultado = await prisma.assessmentStudentResult.create({
    data: {
      assessmentId: avaliacaoId,
      schoolId: escolaId,
      classId: turma.id,
      studentId: estudante.id,
      importId,
      avaliado: true,
      nivelOriginal: 'Adequado',
      nivelNormalizado: 'ADEQUADO',
      acertosTotais: 20,
      itensTotais: 22,
      percentualGeral: '90.9091',
    },
  })

  // Resultado por habilidade: é o que vincula a habilidade ao dado importado e
  // o que a guarda de exclusão precisa enxergar.
  const h01 = await prisma.skill.findFirstOrThrow({ where: { shortCode: 'H01' } })
  await prisma.studentSkillResult.create({
    data: {
      resultId: resultado.id,
      skillId: h01.id,
      valorOriginal: '1 / 1',
      acertos: 1,
      itensPossiveis: 1,
      percentual: '100.0000',
    },
  })

  ctxAdmin = {
    userId,
    role: 'ADMIN',
    allowedSchoolIds: [escolaId],
    canAccessNominalData: true,
  }
  ctxEscola = {
    userId,
    role: 'ESCOLA',
    allowedSchoolIds: [escolaId],
    canAccessNominalData: true,
  }
}, 60_000)

afterAll(async () => {
  await prisma.assessmentStudentResult.deleteMany({ where: { assessmentId: avaliacaoId } })
  await prisma.import.deleteMany({ where: { assessmentId: avaliacaoId } })
  await prisma.student.deleteMany({ where: { schoolId: escolaId } })
  await prisma.class.deleteMany({ where: { schoolId: escolaId } })
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.assessment.deleteMany({ where: { id: avaliacaoId } })
  await prisma.school.deleteMany({ where: { id: escolaId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
}, 60_000)

describe('exclusão protegida — FR-018', () => {
  it('recusa excluir escola com resultados vinculados', async () => {
    await expect(excluirEscola(ctxAdmin, escolaId)).rejects.toMatchObject({ status: 409 })
  })

  it('recusa excluir avaliação com resultados vinculados', async () => {
    await expect(excluirAvaliacao(ctxAdmin, avaliacaoId)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('recusa excluir habilidade com resultados vinculados', async () => {
    const habilidade = await prisma.skill.findFirstOrThrow({ where: { shortCode: 'H01' } })
    await expect(excluirHabilidade(ctxAdmin, habilidade.id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('a recusa NÃO destrói nada — os resultados continuam íntegros', async () => {
    const resultados = await prisma.assessmentStudentResult.count({
      where: { assessmentId: avaliacaoId },
    })
    expect(resultados).toBe(1)
  })

  it('a mensagem informa o que está vinculado, para a decisão ser informada', async () => {
    try {
      await excluirEscola(ctxAdmin, escolaId)
      throw new Error('deveria ter recusado')
    } catch (erro) {
      expect((erro as Error).message).toMatch(/resultado\(s\) de avaliação/)
      expect((erro as Error).message).toMatch(/estudante\(s\)/)
    }
  })

  it('perfil ESCOLA não pode excluir, nem sem dependências', async () => {
    const vazia = await prisma.assessment.create({
      data: {
        nome: `Vazia ${SUFIXO}`,
        ano: 2026,
        ciclo: 'II Ciclo',
        componenteCurricular: 'LÍNGUA PORTUGUESA',
      },
    })
    await expect(excluirAvaliacao(ctxEscola, vazia.id)).rejects.toMatchObject({ status: 403 })
    await prisma.assessment.delete({ where: { id: vazia.id } })
  })

  it('avaliação sem dependências é excluída e o ato é auditado', async () => {
    const vazia = await prisma.assessment.create({
      data: {
        nome: `Sem vínculo ${SUFIXO}`,
        ano: 2026,
        ciclo: 'II Ciclo',
        componenteCurricular: 'LÍNGUA PORTUGUESA',
      },
    })

    const dependencias = await contarDependenciasDaAvaliacao(vazia.id)
    expect(dependencias.resultados).toBe(0)

    await excluirAvaliacao(ctxAdmin, vazia.id)

    expect(await prisma.assessment.count({ where: { id: vazia.id } })).toBe(0)
    expect(
      await prisma.auditLog.count({
        where: { action: 'ENTITY_FORCE_DELETE', entityId: vazia.id },
      }),
    ).toBe(1)
  })
})
