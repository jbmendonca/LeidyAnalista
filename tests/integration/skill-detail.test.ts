import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { resolveAllowedSchoolIds, type AuthContext } from '@/server/authorization'
import { NOME_SUPRIMIDO } from '@/server/nominal-data'
import { toPercent } from '@/lib/decimal'
import { recalcularDenominadoresDeReferencia } from '@/modules/skills/application/resolve-reference-items'
import { distribuicaoDaHabilidade } from '@/modules/analytics/infra/aggregate-queries'
import {
  listarHabilidadesDoRecorte,
  obterDetalheDaHabilidade,
} from '@/modules/analytics/application/skill-detail'
import type { FiltrosPainel } from '@/modules/analytics/schemas/filters'

/**
 * ===========================================================================
 *  TELA POR HABILIDADE, CONTRA O POSTGRES REAL
 * ===========================================================================
 *
 * O caso central é o denominador divergente (FR-157 a FR-159), e ele só se sustenta com
 * banco de verdade: a partilha entre distribuição e lista à parte depende do denominador de
 * referência **apurado** por `recalcularDenominadoresDeReferencia`, e é justamente essa
 * apuração que um teste com dados falsos substituiria por uma constante — reintroduzindo o
 * "22 fixo" que FR-016 proíbe.
 *
 * O recorte sintético (habilidade ZZH03) é:
 *
 * | estudante | avaliado | resultado | denominador |
 * |-----------|----------|-----------|-------------|
 * | A         | sim      | 3 / 3     | 3           |
 * | B         | sim      | 2 / 3     | 3           |
 * | C         | sim      | 0 / 3     | 3           |
 * | D         | sim      | 1 / 2     | 2 ← divergente |
 * | E         | sim      | ausente   | —           |
 * | F         | NÃO      | ausente   | —           |
 *
 * Denominador mais frequente: 3 (três ocorrências contra uma). Portanto:
 * - distribuição sobre `0/3 … 3/3`, sem o registro de D;
 * - D listado à parte, com turma, denominador e resultado original;
 * - consolidado `(3+2+0+1) / (3+3+3+2)` = `6/11` — D **continua** na soma;
 * - a faixa `1/3`, sem ninguém, aparece com quantidade 0 (medição, não ausência).
 *
 * Tudo é criado com o prefixo `ZZTEST-` e removido no `afterAll`.
 */

const PREFIXO = `ZZTEST-SKILL-${Date.now()}`

type Fixtura = {
  admin: AuthContext
  semNomes: AuthContext
  escolaAId: string
  escolaBId: string
  avaliacaoId: string
  skillId: string
  skillSecundariaId: string
  turmaAId: string
  turmaBId: string
  estudantes: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', string>
}

const criados = {
  userIds: [] as string[],
  schoolIds: [] as string[],
  classIds: [] as string[],
  studentIds: [] as string[],
  skillIds: [] as string[],
  assessmentIds: [] as string[],
  importIds: [] as string[],
  settingsId: null as string | null,
}

let f: Fixtura

const SEM_FILTRO: FiltrosPainel = {}

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
  role: 'ADMIN' | 'ANALISTA',
  sufixo: string,
  canAccessNominalData: boolean,
): Promise<string> {
  const usuario = await prisma.user.create({
    data: {
      email: `${PREFIXO}-${sufixo}@teste.local`.toLowerCase(),
      passwordHash: 'hash-de-teste-nao-utilizado',
      name: `Usuário de teste ${sufixo}`,
      role,
      canAccessNominalData,
    },
    select: { id: true },
  })
  criados.userIds.push(usuario.id)
  return usuario.id
}

/** Grava um resultado e, quando houver, a linha da habilidade. */
async function gravarResultado(opcoes: {
  assessmentId: string
  schoolId: string
  classId: string
  studentId: string
  importId: string
  avaliado: boolean
  nivel: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | null
  habilidades: { skillId: string; acertos: number; itens: number }[]
}): Promise<void> {
  const somaAcertos = opcoes.habilidades.reduce((s, h) => s + h.acertos, 0)
  const somaItens = opcoes.habilidades.reduce((s, h) => s + h.itens, 0)
  const temResultado = opcoes.avaliado && somaItens > 0

  const percentualGeral = temResultado
    ? toPercent({ acertos: somaAcertos, itens: somaItens })
    : null

  const resultado = await prisma.assessmentStudentResult.create({
    data: {
      assessmentId: opcoes.assessmentId,
      schoolId: opcoes.schoolId,
      classId: opcoes.classId,
      studentId: opcoes.studentId,
      importId: opcoes.importId,
      avaliado: opcoes.avaliado,
      nivelOriginal: opcoes.avaliado ? (opcoes.nivel ?? 'Adequado') : 'Não avaliado',
      nivelNormalizado: opcoes.avaliado ? opcoes.nivel : null,
      acertosTotais: temResultado ? somaAcertos : null,
      itensTotais: temResultado ? somaItens : null,
      percentualGeral:
        percentualGeral === null ? null : new Prisma.Decimal(percentualGeral.toFixed(4)),
    },
    select: { id: true },
  })

  if (opcoes.habilidades.length === 0) return

  await prisma.studentSkillResult.createMany({
    data: opcoes.habilidades.map((h) => {
      const percentual = toPercent({ acertos: h.acertos, itens: h.itens })
      return {
        resultId: resultado.id,
        skillId: h.skillId,
        valorOriginal: `${h.acertos} / ${h.itens}`,
        acertos: h.acertos,
        itensPossiveis: h.itens,
        percentual: percentual === null ? null : new Prisma.Decimal(percentual.toFixed(4)),
      }
    }),
  })
}

beforeAll(async () => {
  const adminId = await criarUsuario('ADMIN', 'admin', true)
  const analistaId = await criarUsuario('ANALISTA', 'sem-nomes', false)

  const escolaA = await prisma.school.create({
    data: {
      code: `${PREFIXO}-A`,
      name: 'Escola A de Teste',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RORAIMA',
    },
    select: { id: true },
  })
  const escolaB = await prisma.school.create({
    data: {
      code: `${PREFIXO}-B`,
      name: 'Escola B de Teste',
      rede: 'ESTADUAL',
      municipio: 'SOBRAL',
      estado: 'CEARA',
    },
    select: { id: true },
  })
  criados.schoolIds.push(escolaA.id, escolaB.id)

  await prisma.userSchool.create({ data: { userId: analistaId, schoolId: escolaA.id } })

  const avaliacao = await prisma.assessment.create({
    data: {
      nome: `${PREFIXO} Leitura`,
      ano: 2026,
      ciclo: 'II Ciclo',
      componenteCurricular: 'Leitura',
    },
    select: { id: true },
  })
  criados.assessmentIds.push(avaliacao.id)

  const skill = await prisma.skill.create({
    data: {
      shortCode: `${PREFIXO}-H03`,
      referenceCode: '4EF14_P',
      descricao: 'Localizar informações explícitas em texto narrativo',
      ordem: 903,
    },
    select: { id: true },
  })
  const skillSecundaria = await prisma.skill.create({
    data: {
      shortCode: `${PREFIXO}-H07`,
      referenceCode: '4EF07_P',
      descricao: 'Inferir o sentido de palavra pelo contexto',
      ordem: 907,
    },
    select: { id: true },
  })
  criados.skillIds.push(skill.id, skillSecundaria.id)

  const turmaA = await prisma.class.create({
    data: {
      schoolId: escolaA.id,
      externalCode: `${PREFIXO}-T1`,
      name: '4º ano A',
      anoEscolar: '4º ano',
    },
    select: { id: true },
  })
  const turmaB = await prisma.class.create({
    data: {
      schoolId: escolaA.id,
      externalCode: `${PREFIXO}-T2`,
      name: '4º ano B',
      anoEscolar: '4º ano',
    },
    select: { id: true },
  })
  criados.classIds.push(turmaA.id, turmaB.id)

  const importacao = await prisma.import.create({
    data: {
      assessmentId: avaliacao.id,
      schoolId: escolaA.id,
      fileName: 'sintetico.csv',
      fileHash: `${PREFIXO}-hash`,
      fileSize: 128,
      storagePath: `/tmp/${PREFIXO}.csv`,
      fileRetainedUntil: new Date(Date.now() + 86_400_000),
      status: 'COMPLETED',
      userId: adminId,
    },
    select: { id: true },
  })
  criados.importIds.push(importacao.id)

  const nomes = {
    A: 'Ana de Teste',
    B: 'Bruno de Teste',
    C: 'Carla de Teste',
    D: 'Davi de Teste',
    E: 'Elisa de Teste',
    F: 'Fabio de Teste',
  } as const

  const turmaPorEstudante: Record<keyof typeof nomes, string> = {
    A: turmaA.id,
    B: turmaA.id,
    C: turmaA.id,
    D: turmaB.id,
    E: turmaB.id,
    F: turmaB.id,
  }

  const estudantes = {} as Fixtura['estudantes']
  for (const chave of Object.keys(nomes) as (keyof typeof nomes)[]) {
    const criado = await prisma.student.create({
      data: {
        uniqueCode: `${PREFIXO}-${chave}`,
        schoolId: escolaA.id,
        classId: turmaPorEstudante[chave],
        nomeOriginal: nomes[chave],
        nomeNormalizado: nomes[chave].toUpperCase(),
      },
      select: { id: true },
    })
    criados.studentIds.push(criado.id)
    estudantes[chave] = criado.id
  }

  const base = {
    assessmentId: avaliacao.id,
    schoolId: escolaA.id,
    importId: importacao.id,
  }

  await gravarResultado({
    ...base,
    classId: turmaA.id,
    studentId: estudantes.A,
    avaliado: true,
    nivel: 'ADEQUADO',
    habilidades: [
      { skillId: skill.id, acertos: 3, itens: 3 },
      { skillId: skillSecundaria.id, acertos: 1, itens: 2 },
    ],
  })
  await gravarResultado({
    ...base,
    classId: turmaA.id,
    studentId: estudantes.B,
    avaliado: true,
    nivel: 'INTERMEDIARIO',
    habilidades: [{ skillId: skill.id, acertos: 2, itens: 3 }],
  })
  await gravarResultado({
    ...base,
    classId: turmaA.id,
    studentId: estudantes.C,
    avaliado: true,
    nivel: 'DEFASAGEM',
    habilidades: [{ skillId: skill.id, acertos: 0, itens: 3 }],
  })
  // O caso de FR-158: mesma habilidade, denominador diferente do da maioria.
  await gravarResultado({
    ...base,
    classId: turmaB.id,
    studentId: estudantes.D,
    avaliado: true,
    nivel: 'DEFASAGEM',
    habilidades: [{ skillId: skill.id, acertos: 1, itens: 2 }],
  })
  // Avaliado, porém sem resultado nesta habilidade: ausência, nunca zero.
  await gravarResultado({
    ...base,
    classId: turmaB.id,
    studentId: estudantes.E,
    avaliado: true,
    nivel: null,
    habilidades: [],
  })
  // Não avaliado: fora de todo denominador de desempenho.
  await gravarResultado({
    ...base,
    classId: turmaB.id,
    studentId: estudantes.F,
    avaliado: false,
    nivel: null,
    habilidades: [],
  })

  // O denominador de referência NASCE daqui — nunca de constante no código.
  await recalcularDenominadoresDeReferencia(prisma, avaliacao.id)

  // As faixas analíticas precisam existir para a classificação; se o banco ainda não tiver
  // nenhuma versão, a suíte cria a sua e a remove no fim.
  const faixas = await prisma.analyticalSettings.findFirst({ orderBy: { version: 'desc' } })
  if (!faixas) {
    const nova = await prisma.analyticalSettings.create({
      data: {
        version: 1,
        fragilidadeMax: '60.00',
        atencaoMax: '80.00',
        baixoRendimento: ['DEFASAGEM'],
        createdByUserId: adminId,
      },
      select: { id: true },
    })
    criados.settingsId = nova.id
  }

  f = {
    admin: await contextoDe(adminId),
    semNomes: await contextoDe(analistaId),
    escolaAId: escolaA.id,
    escolaBId: escolaB.id,
    avaliacaoId: avaliacao.id,
    skillId: skill.id,
    skillSecundariaId: skillSecundaria.id,
    turmaAId: turmaA.id,
    turmaBId: turmaB.id,
    estudantes,
  }
})

afterAll(async () => {
  // Ordem imposta pelas chaves estrangeiras: filhos antes dos pais.
  await prisma.studentSkillResult.deleteMany({
    where: { skillId: { in: criados.skillIds } },
  })
  await prisma.assessmentStudentResult.deleteMany({
    where: { assessmentId: { in: criados.assessmentIds } },
  })
  await prisma.assessmentSkill.deleteMany({
    where: { assessmentId: { in: criados.assessmentIds } },
  })
  await prisma.import.deleteMany({ where: { id: { in: criados.importIds } } })
  await prisma.student.deleteMany({ where: { id: { in: criados.studentIds } } })
  await prisma.class.deleteMany({ where: { id: { in: criados.classIds } } })
  await prisma.skill.deleteMany({ where: { id: { in: criados.skillIds } } })
  await prisma.assessment.deleteMany({ where: { id: { in: criados.assessmentIds } } })
  await prisma.auditLog.deleteMany({ where: { userId: { in: criados.userIds } } })
  if (criados.settingsId) {
    await prisma.analyticalSettings.delete({ where: { id: criados.settingsId } })
  }
  await prisma.userSchool.deleteMany({ where: { userId: { in: criados.userIds } } })
  await prisma.school.deleteMany({ where: { id: { in: criados.schoolIds } } })
  await prisma.user.deleteMany({ where: { id: { in: criados.userIds } } })
  await prisma.$disconnect()
})

describe('denominador de referência — FR-016, FR-155, FR-156', () => {
  it('é apurado dos dados, e não fixado em código', async () => {
    const vinculo = await prisma.assessmentSkill.findUniqueOrThrow({
      where: { assessmentId_skillId: { assessmentId: f.avaliacaoId, skillId: f.skillId } },
      select: { referenceItems: true, referenceItemsTiebreak: true },
    })

    // Três registros com 3 itens contra um com 2: a maioria decide.
    expect(vinculo.referenceItems).toBe(3)
    expect(vinculo.referenceItemsTiebreak).toBe(false)
  })

  it('é o valor exibido como quantidade de itens da habilidade', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.denominadorReferencia).toBe(3)
  })

  it('habilidade sem vínculo na avaliação não é apresentada com número presumido', async () => {
    const outraAvaliacao = await prisma.assessment.create({
      data: {
        nome: `${PREFIXO} Sem resultados`,
        ano: 2026,
        ciclo: 'II Ciclo',
        componenteCurricular: 'Leitura',
      },
      select: { id: true },
    })
    criados.assessmentIds.push(outraAvaliacao.id)

    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      outraAvaliacao.id,
      f.skillId,
    )

    expect(detalhe).toBeNull()
  })
})

describe('distribuição por resultado — FR-085, FR-158', () => {
  it('usa o denominador de referência e deixa o divergente de fora', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )
    expect(detalhe).not.toBeNull()
    if (!detalhe) return

    expect(detalhe.distribuicao.map((d) => [d.acertos, d.quantidade])).toEqual([
      [0, 1],
      [1, 0],
      [2, 1],
      [3, 1],
    ])
    expect(detalhe.distribuicao.every((d) => d.itens === 3)).toBe(true)

    // Três registros na distribuição; o quarto (1/2) ficou fora.
    expect(detalhe.totalNaDistribuicao).toBe(3)
    expect(detalhe.estudantesComResultado).toBe(4)
  })

  it('faixa sem ocorrência aparece com quantidade 0 — medição, não ausência', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    const faixaVazia = detalhe?.distribuicao.find((d) => d.acertos === 1)
    expect(faixaVazia).toBeDefined()
    expect(faixaVazia?.quantidade).toBe(0)
    expect(faixaVazia?.proporcao?.toFixed(2)).toBe('0.00')

    // A faixa `0/3` tem uma criança que acertou zero — o que é diferente de faixa vazia.
    expect(detalhe?.distribuicao.find((d) => d.acertos === 0)?.quantidade).toBe(1)
  })

  it('os percentuais da distribuição somam o total, sem o divergente no denominador', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    const comOcorrencia = detalhe?.distribuicao.filter((d) => d.quantidade > 0) ?? []
    expect(comOcorrencia).toHaveLength(3)
    for (const faixa of comOcorrencia) {
      // 1 de 3 = 33,3333…% — o denominador é a distribuição, não o total de avaliados.
      expect(faixa.proporcao?.toFixed(4)).toBe('33.3333')
    }
  })

  it('concorda com `distribuicaoDaHabilidade`, a regra de partilha da camada de dados', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )
    const daInfra = await distribuicaoDaHabilidade(
      f.admin,
      { assessmentId: f.avaliacaoId },
      f.skillId,
      3,
    )

    expect(daInfra.distribuicao).toEqual(
      detalhe?.distribuicao.map((d) => ({ acertos: d.acertos, quantidade: d.quantidade })),
    )
    expect(daInfra.divergentes).toEqual([{ acertos: 1, itens: 2, quantidade: 1 }])
  })
})

describe('registros divergentes listados à parte — FR-158, FR-159', () => {
  it('identifica estudante, turma, denominador encontrado e resultado original', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.totalDivergentes).toBe(1)

    const divergente = detalhe?.divergentes[0]
    expect(divergente?.studentId).toBe(f.estudantes.D)
    expect(divergente?.nomeOriginal).toBe('Davi de Teste')
    expect(divergente?.turma).toBe('4º ano B')
    expect(divergente?.codigoTurma).toBe(`${PREFIXO}-T2`)
    expect(divergente?.itensEncontrados).toBe(2)
    expect(divergente?.acertos).toBe(1)
    expect(divergente?.resultadoOriginal).toBe('1 / 2')
    expect(divergente?.percentual?.toFixed(2)).toBe('50.00')
  })

  it('nenhum divergente entra na distribuição', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    const soma = (detalhe?.distribuicao ?? []).reduce((s, d) => s + d.quantidade, 0)
    expect(soma + (detalhe?.totalDivergentes ?? 0)).toBe(detalhe?.estudantesComResultado)
  })

  it('o divergente aparece na lista de dificuldade, marcado como tal', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    const davi = detalhe?.dificuldades.find((e) => e.studentId === f.estudantes.D)
    expect(davi?.divergente).toBe(true)
    expect(detalhe?.dificuldades.filter((e) => e.divergente)).toHaveLength(1)
  })
})

describe('percentual consolidado — FR-157', () => {
  it('inclui o registro divergente na soma: Σ acertos ÷ Σ itens permanece inalterado', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    // 3 + 2 + 0 + 1 acertos sobre 3 + 3 + 3 + 2 itens.
    expect(detalhe?.totalAcertos).toBe(6)
    expect(detalhe?.totalItens).toBe(11)
    expect(detalhe?.percentual?.toFixed(4)).toBe('54.5455')
  })

  it('não é a soma apenas dos registros da distribuição', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    // Se o divergente tivesse sido excluído do cálculo, o resultado seria 5/9 = 55,5556%.
    expect(detalhe?.percentual?.toFixed(4)).not.toBe('55.5556')
  })

  it('não é a média simples dos percentuais', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    // Média simples de 100, 66,67, 0 e 50 seria 54,1667% — próximo o bastante para passar
    // despercebido, e errado.
    expect(detalhe?.percentual?.toFixed(4)).not.toBe('54.1667')
  })
})

describe('avaliados, não avaliados e ausência — FR-059, FR-060, Const. I', () => {
  it('conta os avaliados do recorte e separa quem não tem resultado na habilidade', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    // A, B, C, D e E são avaliados; F não é e fica fora.
    expect(detalhe?.avaliadosNoRecorte).toBe(5)
    expect(detalhe?.estudantesComResultado).toBe(4)
    expect(detalhe?.semResultado).toBe(1)
  })

  it('o não avaliado não entra em nenhum denominador de desempenho', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.dificuldades.map((e) => e.studentId)).not.toContain(f.estudantes.F)
    expect(detalhe?.totalItens).toBe(11)
  })
})

describe('ranking das turmas — FR-086', () => {
  it('agrega por turma e ordena da menor taxa de acerto para a maior', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    const turmas = detalhe?.turmas ?? []
    expect(turmas).toHaveLength(2)

    // 4º ano B: 1/2 = 50%. 4º ano A: 5/9 = 55,56%. O pior vem primeiro.
    expect(turmas[0]?.classId).toBe(f.turmaBId)
    expect(turmas[0]?.percentual?.toFixed(2)).toBe('50.00')
    expect(turmas[1]?.classId).toBe(f.turmaAId)
    expect(turmas[1]?.acertos).toBe(5)
    expect(turmas[1]?.itens).toBe(9)
  })
})

describe('estudantes com maior dificuldade — FR-087', () => {
  it('ordena do menor desempenho para o maior', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.dificuldades.map((e) => e.studentId)).toEqual([
      f.estudantes.C, // 0/3
      f.estudantes.D, // 1/2
      f.estudantes.B, // 2/3
      f.estudantes.A, // 3/3
    ])
  })

  it('suprime o nome de quem não tem a permissão nominal, mantendo o código único', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.semNomes,
      SEM_FILTRO,
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.nomesVisiveis).toBe(false)
    expect(detalhe?.dificuldades.every((e) => e.nomeOriginal === NOME_SUPRIMIDO)).toBe(true)
    expect(detalhe?.dificuldades[0]?.uniqueCode).toBe(`${PREFIXO}-C`)
    expect(detalhe?.divergentes[0]?.nomeOriginal).toBe(NOME_SUPRIMIDO)
  })
})

describe('filtros aplicados a todos os blocos — FR-099', () => {
  it('o recorte por turma reduz distribuição, consolidado e ranking juntos', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      { turma: f.turmaAId },
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.totalAcertos).toBe(5)
    expect(detalhe?.totalItens).toBe(9)
    expect(detalhe?.totalDivergentes).toBe(0)
    expect(detalhe?.totalNaDistribuicao).toBe(3)
    expect(detalhe?.turmas).toHaveLength(1)
  })

  it('a faixa de percentual geral também recorta, e o divergente sai da soma com ela', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      { percentualMin: 60 },
      f.avaliacaoId,
      f.skillId,
    )

    // Só A (100%) e B (66,67%) permanecem; D (50%) e C (0%) saem.
    expect(detalhe?.estudantesComResultado).toBe(2)
    expect(detalhe?.totalAcertos).toBe(5)
    expect(detalhe?.totalItens).toBe(6)
    expect(detalhe?.totalDivergentes).toBe(0)
  })

  it('o filtro de nível de aprendizagem da fonte recorta sem alterar o dado', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      { nivel: 'DEFASAGEM' },
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.dificuldades.map((e) => e.studentId).sort()).toEqual(
      [f.estudantes.C, f.estudantes.D].sort(),
    )
  })

  it('componente curricular diferente do da avaliação esvazia o recorte, sem zerar indicadores', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.admin,
      { componenteCurricular: 'Matemática' },
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.estudantesComResultado).toBe(0)
    // Ausência de dado é `null`, jamais 0%.
    expect(detalhe?.percentual).toBeNull()
    expect(detalhe?.totalNaDistribuicao).toBe(0)
  })
})

describe('escopo por escola — FR-006', () => {
  it('recusa filtro por escola fora do escopo com 404, sem reduzir a lista em silêncio', async () => {
    await expect(
      obterDetalheDaHabilidade(
        f.semNomes,
        { escola: f.escolaBId },
        f.avaliacaoId,
        f.skillId,
      ),
    ).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO', status: 404 })
  })

  it('aceita o filtro por escola dentro do escopo', async () => {
    const detalhe = await obterDetalheDaHabilidade(
      f.semNomes,
      { escola: f.escolaAId },
      f.avaliacaoId,
      f.skillId,
    )

    expect(detalhe?.estudantesComResultado).toBe(4)
  })
})

describe('lista de habilidades do recorte', () => {
  it('traz as habilidades da avaliação com o denominador de referência de cada uma', async () => {
    const lista = await listarHabilidadesDoRecorte(f.admin, SEM_FILTRO, f.avaliacaoId)
    const porId = new Map(lista.map((h) => [h.id, h]))

    expect(porId.get(f.skillId)?.denominadorReferencia).toBe(3)
    expect(porId.get(f.skillSecundariaId)?.denominadorReferencia).toBe(2)
  })

  it('ordena da maior fragilidade para a menor', async () => {
    const lista = await listarHabilidadesDoRecorte(f.admin, SEM_FILTRO, f.avaliacaoId)
    const nossas = lista.filter((h) =>
      [f.skillId, f.skillSecundariaId].includes(h.id),
    )

    // A secundária tem 1/2 = 50%; a principal, 6/11 = 54,55%. A pior vem primeiro.
    expect(nossas[0]?.id).toBe(f.skillSecundariaId)
    expect(nossas[1]?.id).toBe(f.skillId)
  })
})
