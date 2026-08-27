import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, type Role } from '@prisma/client'

import { createImport } from '@/modules/imports/application/create-import'
import { runValidation } from '@/modules/imports/application/run-validation'
import { getPreview } from '@/modules/imports/application/get-preview'
import { confirmImport } from '@/modules/imports/application/confirm-import'
import { deleteImport } from '@/modules/imports/application/delete-import'
import type { AuthContext } from '@/server/authorization'

/**
 * Pipeline de importação, ponta a ponta, contra o banco real.
 *
 * Valida o que a constituição chama de portão de fidelidade: o arquivo de
 * referência entra no sistema com 111/106/5/4/12, a ausência não vira zero, o
 * não avaliado fica fora do denominador, o nível da fonte é preservado e a
 * pré-visualização não grava nada.
 */

const prisma = new PrismaClient()
const FIXTURE = resolve(__dirname, '../fixtures/resultados-referencia.csv')
const SUFIXO = `teste-${Date.now()}`

let ctx: AuthContext
let schoolId: string
let assessmentId: string
let userId: string

async function contextoDe(role: Role, escolas: string[]): Promise<AuthContext> {
  return {
    userId,
    role,
    allowedSchoolIds: escolas,
    canAccessNominalData: true,
  }
}

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: `pipeline-${SUFIXO}@teste.local`,
      name: 'Teste Pipeline',
      passwordHash: 'x',
      role: 'ADMIN',
      canAccessNominalData: true,
    },
  })
  userId = usuario.id

  const escola = await prisma.school.create({
    data: {
      code: `ESC-${SUFIXO}`,
      name: 'Escola de Teste',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RORAIMA',
    },
  })
  schoolId = escola.id

  const avaliacao = await prisma.assessment.create({
    data: {
      nome: `Avaliação ${SUFIXO}`,
      ano: 2026,
      ciclo: 'II Ciclo',
      componenteCurricular: 'LÍNGUA PORTUGUESA',
    },
  })
  assessmentId = avaliacao.id

  ctx = await contextoDe('ADMIN', [schoolId])
}, 60_000)

afterAll(async () => {
  await prisma.assessmentStudentResult.deleteMany({ where: { assessmentId } })
  await prisma.importRow.deleteMany({ where: { import: { assessmentId } } })
  await prisma.importIssue.deleteMany({ where: { import: { assessmentId } } })
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.import.deleteMany({ where: { assessmentId } })
  await prisma.assessmentSkill.deleteMany({ where: { assessmentId } })
  await prisma.student.deleteMany({ where: { schoolId } })
  await prisma.class.deleteMany({ where: { schoolId } })
  await prisma.assessment.delete({ where: { id: assessmentId } })
  await prisma.school.delete({ where: { id: schoolId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
}, 60_000)

describe('pipeline de importação', () => {
  let importId: string

  it('aceita o arquivo de referência e calcula o SHA-256', async () => {
    const conteudo = readFileSync(FIXTURE)
    const r = await createImport(ctx, {
      assessmentId,
      schoolId,
      nomeArquivo: 'resultados-referencia.csv',
      conteudo,
      mimeType: 'text/csv',
    })
    importId = r.importId

    const registro = await prisma.import.findUniqueOrThrow({ where: { id: importId } })
    expect(registro.fileHash).toHaveLength(64)
    expect(registro.fileSize).toBe(conteudo.byteLength)
    expect(registro.status).toBe('UPLOADED')
    expect(registro.fileRetainedUntil.getTime()).toBeGreaterThan(Date.now())
  })

  it('rejeita arquivo de formato não suportado antes de qualquer parsing', async () => {
    await expect(
      createImport(ctx, {
        assessmentId,
        schoolId,
        nomeArquivo: 'planilha.txt',
        conteudo: Buffer.from('qualquer coisa'),
      }),
    ).rejects.toMatchObject({
      status: 422,
      detalhes: { arquivo: [expect.stringMatching(/Formato não suportado/)] },
    })
  })

  it('rejeita arquivo vazio', async () => {
    await expect(
      createImport(ctx, {
        assessmentId,
        schoolId,
        nomeArquivo: 'vazio.csv',
        conteudo: Buffer.alloc(0),
      }),
    ).rejects.toMatchObject({
      status: 422,
      detalhes: { arquivo: [expect.stringMatching(/vazio/)] },
    })
  })

  it('recusa escola fora do escopo do usuário com 404, nunca 403', async () => {
    const outroCtx = await contextoDe('ESCOLA', ['id-de-outra-escola'])
    await expect(
      createImport(outroCtx, {
        assessmentId,
        schoolId,
        nomeArquivo: 'resultados-referencia.csv',
        conteudo: readFileSync(FIXTURE),
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('valida o arquivo e apura 111/106/5/4/12', async () => {
    const r = await runValidation(importId)

    expect(r.totalRows).toBe(111)
    expect(r.evaluatedRows).toBe(106)
    expect(r.notEvaluatedRows).toBe(5)
    expect(r.classCount).toBe(4)
    expect(r.skillCount).toBe(12)
    expect(r.errorCount).toBe(0)
    expect(r.bloqueada).toBe(false)
  }, 60_000)

  it('sinaliza como alerta o nome que aparece em duas turmas', async () => {
    const alertas = await prisma.importIssue.findMany({
      where: { importId, code: 'SAME_NAME_OTHER_CLASS' },
    })
    expect(alertas).toHaveLength(2)
    expect(alertas.every((a) => a.severity === 'WARNING')).toBe(true)
  })

  it('a pré-visualização NÃO grava nenhum resultado', async () => {
    const preview = await getPreview(ctx, importId)

    expect(preview.resumo.registrosEncontrados).toBe(111)
    expect(preview.resumo.registrosAvaliados).toBe(106)
    expect(preview.resumo.registrosNaoAvaliados).toBe(5)
    expect(preview.resumo.podeConfirmar).toBe(true)

    const resultados = await prisma.assessmentStudentResult.count({
      where: { assessmentId },
    })
    expect(resultados).toBe(0)
  })

  it('a amostra mostra o valor original ao lado do interpretado', async () => {
    const preview = await getPreview(ctx, importId, { amostra: 1 })
    const linha = preview.amostra[0]
    expect(linha).toBeDefined()
    expect(linha!.habilidades).toHaveLength(12)

    const h01 = linha!.habilidades.find((h) => h.shortCode === 'H01')
    expect(h01?.valorOriginal).toMatch(/\d\s*\/\s*\d/)
    expect(h01?.interpretado).toMatch(/^\d+ de \d+$/)
  })

  it('confirma a importação numa transação e persiste 111 resultados', async () => {
    const r = await confirmImport(ctx, importId, { cadastrarNaoEncontrados: true })

    expect(r.persistidos).toBe(111)
    expect(r.estudantesCriados).toBe(111)
    expect(r.turmasCriadas).toBe(4)

    const registro = await prisma.import.findUniqueOrThrow({ where: { id: importId } })
    expect(registro.status).toBe('COMPLETED')
    expect(registro.confirmedAt).not.toBeNull()
  }, 120_000)

  it('cada estudante recebeu um código único distinto', async () => {
    const estudantes = await prisma.student.findMany({
      where: { schoolId },
      select: { uniqueCode: true },
    })
    expect(estudantes).toHaveLength(111)
    expect(new Set(estudantes.map((e) => e.uniqueCode)).size).toBe(111)
  })

  it('preserva valor original, acertos e itens em campos separados', async () => {
    const amostra = await prisma.studentSkillResult.findFirst({
      where: { result: { assessmentId }, acertos: { not: null } },
    })
    expect(amostra).not.toBeNull()
    expect(amostra!.valorOriginal).toMatch(/\d\s*\/\s*\d/)
    expect(amostra!.acertos).not.toBeNull()
    expect(amostra!.itensPossiveis).not.toBeNull()
    expect(amostra!.percentual).not.toBeNull()
  })

  it('AUSÊNCIA NUNCA VIRA ZERO nos não avaliados', async () => {
    const naoAvaliados = await prisma.assessmentStudentResult.findMany({
      where: { assessmentId, avaliado: false },
      include: { skillResults: true },
    })

    expect(naoAvaliados).toHaveLength(5)
    for (const r of naoAvaliados) {
      expect(r.acertosTotais).toBeNull()
      expect(r.itensTotais).toBeNull()
      expect(r.percentualGeral).toBeNull()
      for (const s of r.skillResults) {
        expect(s.acertos).toBeNull()
        expect(s.itensPossiveis).toBeNull()
      }
    }
  })

  it('preserva o Nível de aprendizagem da fonte', async () => {
    const originais = await prisma.assessmentStudentResult.groupBy({
      by: ['nivelOriginal'],
      where: { assessmentId },
    })
    const valores = originais.map((o) => o.nivelOriginal)
    expect(valores).toContain('Adequado')
    expect(valores).toContain('Intermediário')
    expect(valores).toContain('Defasagem')
  })

  it('distribui 96 Adequado, 7 Intermediário e 3 Defasagem entre os avaliados', async () => {
    const contar = (n: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM') =>
      prisma.assessmentStudentResult.count({
        where: { assessmentId, avaliado: true, nivelNormalizado: n },
      })

    expect(await contar('ADEQUADO')).toBe(96)
    expect(await contar('INTERMEDIARIO')).toBe(7)
    expect(await contar('DEFASAGEM')).toBe(3)
  })

  it('nenhum não avaliado foi classificado com nível', async () => {
    const errado = await prisma.assessmentStudentResult.count({
      where: { assessmentId, avaliado: false, nivelNormalizado: { not: null } },
    })
    expect(errado).toBe(0)
  })

  it('apura os denominadores de referência dos dados, sem hardcode', async () => {
    const denominadores = await prisma.assessmentSkill.findMany({
      where: { assessmentId },
      include: { skill: { select: { shortCode: true } } },
    })

    expect(denominadores).toHaveLength(12)

    const esperado: Record<string, number> = {
      H01: 1, H02: 1, H03: 3, H04: 1, H05: 2, H06: 2,
      H07: 2, H08: 2, H09: 2, H10: 1, H11: 2, H12: 3,
    }
    for (const d of denominadores) {
      expect(d.referenceItems, d.skill.shortCode).toBe(esperado[d.skill.shortCode])
      expect(d.referenceItemsTiebreak).toBe(false)
    }

    const soma = denominadores.reduce((s, d) => s + d.referenceItems, 0)
    expect(soma).toBe(22)
  })

  it('registra a confirmação em auditoria', async () => {
    const auditoria = await prisma.auditLog.findFirst({
      where: { action: 'IMPORT_CONFIRM', entityId: importId },
    })
    expect(auditoria).not.toBeNull()
    expect(auditoria!.userId).toBe(userId)
    expect(JSON.stringify(auditoria!.metadata)).not.toContain('nome')
  })

  it('bloqueia a reimportação do mesmo arquivo por colisão de chave', async () => {
    const segunda = await createImport(ctx, {
      assessmentId,
      schoolId,
      nomeArquivo: 'resultados-referencia.csv',
      conteudo: readFileSync(FIXTURE),
    })

    const r = await runValidation(segunda.importId)
    expect(r.errorCount).toBe(111)
    expect(r.bloqueada).toBe(true)

    const colisoes = await prisma.importIssue.count({
      where: { importId: segunda.importId, code: 'DUPLICATE_KEY_IN_ASSESSMENT' },
    })
    expect(colisoes).toBe(111)

    await expect(confirmImport(ctx, segunda.importId)).rejects.toThrow(
      /inconsistência\(s\) crítica\(s\)/,
    )

    const alertaArquivoRepetido = await prisma.importIssue.count({
      where: { importId: segunda.importId, code: 'FILE_ALREADY_IMPORTED' },
    })
    expect(alertaArquivoRepetido).toBe(1)

    await prisma.importIssue.deleteMany({ where: { importId: segunda.importId } })
    await prisma.importRow.deleteMany({ where: { importId: segunda.importId } })
    await prisma.import.delete({ where: { id: segunda.importId } })
  }, 120_000)

  it('a exclusão remove resultados e preserva a auditoria', async () => {
    const r = await deleteImport(ctx, importId)
    expect(r.resultadosRemovidos).toBe(111)

    expect(await prisma.assessmentStudentResult.count({ where: { assessmentId } })).toBe(0)
    expect(await prisma.assessmentSkill.count({ where: { assessmentId } })).toBe(0)

    expect(await prisma.import.count({ where: { id: importId } })).toBe(1)
    expect(
      await prisma.auditLog.count({ where: { action: 'IMPORT_CONFIRM', entityId: importId } }),
    ).toBe(1)
    expect(
      await prisma.auditLog.count({ where: { action: 'IMPORT_DELETE', entityId: importId } }),
    ).toBe(1)
  }, 60_000)
})
