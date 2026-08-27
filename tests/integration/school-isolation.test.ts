import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

import { obterPainelAvaliacao } from '@/modules/analytics/application/assessment-dashboard'
import { obterPainelEscola } from '@/modules/analytics/application/school-dashboard'
import { obterDashboardDaTurma } from '@/modules/analytics/application/class-dashboard'
import { obterFichaDoEstudante } from '@/modules/analytics/application/student-record'
import { obterDetalheDaHabilidade } from '@/modules/analytics/application/skill-detail'
import { carregarOpcoesDeFiltro } from '@/modules/analytics/application/filter-options'
import { listarEstudantes } from '@/modules/students/application/list-students'
import { listarEscolas } from '@/modules/schools/application/list-schools'
import { listarTurmas } from '@/modules/classes/application/list-class'
import type { AuthContext } from '@/server/authorization'

/**
 * ===========================================================================
 *  AUDITORIA DE ISOLAMENTO POR ESCOLA  —  T164, FR-006, SC-009
 * ===========================================================================
 *
 * Cria duas escolas com dados reais e percorre **toda** entrada de leitura do
 * sistema com um usuário da Escola B, exigindo que nada da Escola A escape —
 * nem registro, nem nome, nem contagem agregada, nem opção de filtro.
 *
 * A verificação é feita sobre a resposta SERIALIZADA: se o identificador, o
 * nome do estudante ou o nome da escola aparecerem em qualquer lugar da
 * estrutura devolvida, o teste falha. Não basta a tela não mostrar — o
 * servidor não pode devolver.
 */

const prisma = new PrismaClient()
const SUFIXO = `iso-${Date.now()}`

const NOME_SECRETO_A = 'ZZESTUDANTESECRETODAESCOLAA'
const NOME_ESCOLA_A = 'ZZESCOLASECRETAA'

let escolaA: string
let escolaB: string
let avaliacaoId: string
let turmaA: string
let turmaB: string
let estudanteA: string
let habilidadeId: string
let userId: string

let ctxEscolaB: AuthContext

async function semear(
  schoolId: string,
  rotulo: string,
  nomeEstudante: string,
): Promise<{ classId: string; studentId: string }> {
  const turma = await prisma.class.create({
    data: {
      schoolId,
      externalCode: `T-${rotulo}-${SUFIXO}`,
      name: `Turma ${rotulo}`,
      anoEscolar: '4º ANO',
    },
  })

  const estudante = await prisma.student.create({
    data: {
      uniqueCode: `ISO${rotulo}${Date.now().toString(36).toUpperCase().slice(-6)}`,
      schoolId,
      classId: turma.id,
      nomeOriginal: nomeEstudante,
      nomeNormalizado: nomeEstudante,
    },
  })

  const importacao = await prisma.import.create({
    data: {
      assessmentId: avaliacaoId,
      schoolId,
      fileName: `${rotulo}.csv`,
      fileHash: `hash-${rotulo}-${SUFIXO}`,
      fileSize: 10,
      storagePath: `/tmp/${rotulo}.csv`,
      fileRetainedUntil: new Date(Date.now() + 86_400_000),
      status: 'COMPLETED',
      userId,
    },
  })

  const resultado = await prisma.assessmentStudentResult.create({
    data: {
      assessmentId: avaliacaoId,
      schoolId,
      classId: turma.id,
      studentId: estudante.id,
      importId: importacao.id,
      avaliado: true,
      nivelOriginal: 'Adequado',
      nivelNormalizado: 'ADEQUADO',
      acertosTotais: 20,
      itensTotais: 22,
      percentualGeral: '90.9091',
    },
  })

  await prisma.studentSkillResult.create({
    data: {
      resultId: resultado.id,
      skillId: habilidadeId,
      valorOriginal: '1 / 1',
      acertos: 1,
      itensPossiveis: 1,
      percentual: '100.0000',
    },
  })

  await prisma.assessmentSkill.upsert({
    where: { assessmentId_skillId: { assessmentId: avaliacaoId, skillId: habilidadeId } },
    update: { referenceItems: 1 },
    create: { assessmentId: avaliacaoId, skillId: habilidadeId, referenceItems: 1 },
  })

  return { classId: turma.id, studentId: estudante.id }
}

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: `iso-${SUFIXO}@teste.local`,
      name: 'Isolamento',
      passwordHash: 'x',
      role: 'ESCOLA',
      canAccessNominalData: true,
    },
  })
  userId = usuario.id

  habilidadeId = (await prisma.skill.findFirstOrThrow({ where: { shortCode: 'H01' } })).id

  const [a, b] = await Promise.all([
    prisma.school.create({
      data: {
        code: `ISOA-${SUFIXO}`,
        name: NOME_ESCOLA_A,
        rede: 'MUNICIPAL',
        municipio: 'BOA VISTA',
        estado: 'RR',
      },
    }),
    prisma.school.create({
      data: {
        code: `ISOB-${SUFIXO}`,
        name: 'Escola B Visível',
        rede: 'MUNICIPAL',
        municipio: 'BOA VISTA',
        estado: 'RR',
      },
    }),
  ])
  escolaA = a.id
  escolaB = b.id

  const avaliacao = await prisma.assessment.create({
    data: {
      nome: `Avaliação ${SUFIXO}`,
      ano: 2026,
      ciclo: 'II Ciclo',
      componenteCurricular: 'LÍNGUA PORTUGUESA',
    },
  })
  avaliacaoId = avaliacao.id

  const semeadoA = await semear(escolaA, 'A', NOME_SECRETO_A)
  const semeadoB = await semear(escolaB, 'B', 'ESTUDANTE VISIVEL DA B')
  turmaA = semeadoA.classId
  estudanteA = semeadoA.studentId
  turmaB = semeadoB.classId

  await prisma.userSchool.create({ data: { userId, schoolId: escolaB } })

  ctxEscolaB = {
    userId,
    role: 'ESCOLA',
    allowedSchoolIds: [escolaB],
    canAccessNominalData: true,
  }
}, 90_000)

afterAll(async () => {
  await prisma.studentSkillResult.deleteMany({
    where: { result: { assessmentId: avaliacaoId } },
  })
  await prisma.assessmentStudentResult.deleteMany({ where: { assessmentId: avaliacaoId } })
  await prisma.assessmentSkill.deleteMany({ where: { assessmentId: avaliacaoId } })
  await prisma.import.deleteMany({ where: { assessmentId: avaliacaoId } })
  await prisma.student.deleteMany({ where: { schoolId: { in: [escolaA, escolaB] } } })
  await prisma.class.deleteMany({ where: { schoolId: { in: [escolaA, escolaB] } } })
  await prisma.userSchool.deleteMany({ where: { userId } })
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.assessment.delete({ where: { id: avaliacaoId } })
  await prisma.school.deleteMany({ where: { id: { in: [escolaA, escolaB] } } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
}, 90_000)

/** Nada da Escola A pode aparecer na estrutura devolvida ao usuário da B. */
function naoVazaEscolaA(resultado: unknown, entrada: string): void {
  const serializado = JSON.stringify(resultado, (_k, v) =>
    typeof v === 'bigint' ? Number(v) : v,
  )
  if (serializado === undefined) return

  expect(serializado, `${entrada} vazou o id da Escola A`).not.toContain(escolaA)
  expect(serializado, `${entrada} vazou o nome da Escola A`).not.toContain(NOME_ESCOLA_A)
  expect(serializado, `${entrada} vazou o nome do estudante da Escola A`).not.toContain(
    NOME_SECRETO_A,
  )
  expect(serializado, `${entrada} vazou a turma da Escola A`).not.toContain(turmaA)
  expect(serializado, `${entrada} vazou o estudante da Escola A`).not.toContain(estudanteA)
}

describe('nenhuma leitura vaza a escola não autorizada', () => {
  it('painel da avaliação — sem filtro de escola', async () => {
    const r = await obterPainelAvaliacao(ctxEscolaB, { assessmentId: avaliacaoId })
    naoVazaEscolaA(r, 'obterPainelAvaliacao')
  })

  it('painel da escola própria', async () => {
    const r = await obterPainelEscola(ctxEscolaB, { schoolId: escolaB, assessmentId: avaliacaoId })
    naoVazaEscolaA(r, 'obterPainelEscola')
  })

  it('painel da turma própria', async () => {
    const r = await obterDashboardDaTurma(ctxEscolaB, turmaB, avaliacaoId)
    naoVazaEscolaA(r, 'obterDashboardDaTurma')
  })

  it('detalhe da habilidade — agrega apenas a escola permitida', async () => {
    const r = await obterDetalheDaHabilidade(ctxEscolaB, {}, avaliacaoId, habilidadeId)
    naoVazaEscolaA(r, 'obterDetalheDaHabilidade')
  })

  it('opções de filtro não oferecem valores da escola alheia', async () => {
    const r = await carregarOpcoesDeFiltro(ctxEscolaB, {})
    naoVazaEscolaA(r, 'carregarOpcoesDeFiltro')
  })

  it('listagem de estudantes', async () => {
    const r = await listarEstudantes(ctxEscolaB, {})
    naoVazaEscolaA(r, 'listarEstudantes')
  })

  it('listagem de escolas', async () => {
    const r = await listarEscolas(ctxEscolaB)
    naoVazaEscolaA(r, 'listarEscolas')
  })

  it('listagem de turmas', async () => {
    const r = await listarTurmas(ctxEscolaB)
    naoVazaEscolaA(r, 'listarTurmas')
  })
})

describe('acesso direto a recurso alheio responde 404, jamais 403', () => {
  const casos: readonly { nome: string; executar: () => Promise<unknown> }[] = [
    {
      nome: 'painel da escola alheia',
      executar: () =>
        obterPainelEscola(ctxEscolaB, { schoolId: escolaA, assessmentId: avaliacaoId }),
    },
    {
      nome: 'painel da turma alheia',
      executar: () => obterDashboardDaTurma(ctxEscolaB, turmaA, avaliacaoId),
    },
    {
      nome: 'ficha de estudante alheio',
      executar: () => obterFichaDoEstudante(ctxEscolaB, estudanteA, avaliacaoId),
    },
    {
      nome: 'painel filtrado pela escola alheia',
      executar: () =>
        obterPainelAvaliacao(ctxEscolaB, { assessmentId: avaliacaoId, schoolId: escolaA }),
    },
  ]

  for (const caso of casos) {
    it(caso.nome, async () => {
      await expect(caso.executar()).rejects.toMatchObject({ status: 404 })
      // O 403 confirmaria a existência do recurso a quem não pode vê-lo.
      await expect(caso.executar()).rejects.not.toMatchObject({ status: 403 })
    })
  }
})

describe('contagens agregadas não revelam a escola alheia', () => {
  it('o painel da avaliação conta apenas a escola permitida', async () => {
    const painel = await obterPainelAvaliacao(ctxEscolaB, { assessmentId: avaliacaoId })
    const serializado = JSON.stringify(painel)

    // Duas escolas foram semeadas com 1 estudante cada. Ver "2" no total
    // significaria que a agregação atravessou o escopo.
    const totalNoBanco = await prisma.assessmentStudentResult.count({
      where: { assessmentId: avaliacaoId },
    })
    expect(totalNoBanco).toBe(2)

    expect(serializado).toContain('"total":1')
  })
})
