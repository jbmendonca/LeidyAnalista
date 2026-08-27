import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/server/prisma'
import { resolveAllowedSchoolIds, type AuthContext } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import { criteriosSchema } from '@/modules/settings/schemas'
import { criarVersaoDeCriterios } from '@/modules/settings/application/create-version'
import {
  lerConfiguracaoVigente,
  obterConfiguracaoVigente,
} from '@/modules/settings/application/get-current-settings'
import { listarVersoesDeCriterios } from '@/modules/settings/application/list-versions'
import {
  atualizarUsuario,
  criarUsuario,
  definirPermissaoDadosNominais,
  definirSituacaoDoUsuario,
} from '@/modules/users/application/user-mutations'
import { listarUsuarios } from '@/modules/users/application/list-users'
import { listarAuditoria } from '@/modules/audit/application/list-audit'
import { reprocessarAvaliacao } from '@/modules/results/application/reprocess'

/**
 * ===========================================================================
 *  CRITÉRIOS ANALÍTICOS, AUDITORIA E USUÁRIOS — contra o Postgres real
 * ===========================================================================
 *
 * A suíte roda no banco de verdade de propósito. O que ela protege não é lógica de cálculo:
 * é o índice único de `version`, a CHECK constraint que recusa total em não avaliado, a
 * transação que une escrita e auditoria, e a ausência de UPDATE em `AnalyticalSettings`.
 * Nenhuma dessas quatro coisas existe em um banco falso — um mock passaria com todas elas
 * quebradas.
 *
 * O teste central é o do dump integral: `dumpResultados` fotografa cada campo de cada
 * resultado e de cada parcela de habilidade, e a comparação é campo a campo. É a única forma
 * de provar que trocar as faixas e reprocessar não encostou em `valorOriginal`, `acertos`,
 * `itensPossiveis` nem `nivelOriginal` — uma comparação por amostragem deixaria passar
 * exatamente o defeito que o produto não pode ter.
 *
 * Todos os registros criados levam o prefixo `ZZTEST-` e são removidos no `afterAll`.
 */

const PREFIXO = `ZZTEST-CFG-${Date.now()}`

const criados = {
  userIds: [] as string[],
  schoolIds: [] as string[],
  assessmentIds: [] as string[],
  skillIds: [] as string[],
  settingsIds: [] as string[],
  importIds: [] as string[],
}

type Fixtura = {
  admin: AuthContext
  analista: AuthContext
  escola: AuthContext
  schoolId: string
  assessmentId: string
  /** Resultado com totais gravados incoerentes com as parcelas. */
  resultadoIncoerenteId: string
  resultadoNaoAvaliadoId: string
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

async function criarUsuarioBruto(
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

// ---------------------------------------------------------------------------
// Dump integral dos resultados
// ---------------------------------------------------------------------------

type ParcelaDump = {
  id: string
  skillId: string
  valorOriginal: string | null
  acertos: number | null
  itensPossiveis: number | null
  percentual: string | null
}

type ResultadoDump = {
  id: string
  assessmentId: string
  schoolId: string
  classId: string
  studentId: string
  importId: string
  avaliado: boolean
  nivelOriginal: string
  nivelNormalizado: string | null
  acertosTotais: number | null
  itensTotais: number | null
  percentualGeral: string | null
  parcelas: ParcelaDump[]
}

/**
 * Fotografia integral. Nenhum `Decimal` sobrevive: vira literal de 4 casas, para que a
 * comparação seja de texto exato e não dependa de igualdade de objeto.
 */
async function dumpResultados(assessmentId: string): Promise<ResultadoDump[]> {
  const resultados = await prisma.assessmentStudentResult.findMany({
    where: { assessmentId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      assessmentId: true,
      schoolId: true,
      classId: true,
      studentId: true,
      importId: true,
      avaliado: true,
      nivelOriginal: true,
      nivelNormalizado: true,
      acertosTotais: true,
      itensTotais: true,
      percentualGeral: true,
      skillResults: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          skillId: true,
          valorOriginal: true,
          acertos: true,
          itensPossiveis: true,
          percentual: true,
        },
      },
    },
  })

  return resultados.map((r) => ({
    id: r.id,
    assessmentId: r.assessmentId,
    schoolId: r.schoolId,
    classId: r.classId,
    studentId: r.studentId,
    importId: r.importId,
    avaliado: r.avaliado,
    nivelOriginal: r.nivelOriginal,
    nivelNormalizado: r.nivelNormalizado,
    acertosTotais: r.acertosTotais,
    itensTotais: r.itensTotais,
    percentualGeral: r.percentualGeral === null ? null : r.percentualGeral.toFixed(4),
    parcelas: r.skillResults.map((p) => ({
      id: p.id,
      skillId: p.skillId,
      valorOriginal: p.valorOriginal,
      acertos: p.acertos,
      itensPossiveis: p.itensPossiveis,
      percentual: p.percentual === null ? null : p.percentual.toFixed(4),
    })),
  }))
}

function porId(dump: readonly ResultadoDump[]): Map<string, ResultadoDump> {
  return new Map(dump.map((r) => [r.id, r]))
}

// ---------------------------------------------------------------------------
// Fixtura
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const adminId = await criarUsuarioBruto('ADMIN', 'admin')
  const analistaId = await criarUsuarioBruto('ANALISTA', 'analista')
  const escolaId = await criarUsuarioBruto('ESCOLA', 'escola')

  const escola = await prisma.school.create({
    data: {
      code: `${PREFIXO}-ESC`,
      name: 'Escola de teste de critérios',
      rede: 'Municipal',
      municipio: 'Boa Vista',
      estado: 'RR',
    },
    select: { id: true },
  })
  criados.schoolIds.push(escola.id)

  await prisma.userSchool.createMany({
    data: [
      { userId: analistaId, schoolId: escola.id },
      { userId: escolaId, schoolId: escola.id },
    ],
  })

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

  const turma = await prisma.class.create({
    data: {
      schoolId: escola.id,
      externalCode: `${PREFIXO}-T1`,
      name: '4º ano A',
      anoEscolar: '4º ano',
    },
    select: { id: true },
  })

  const h1 = await prisma.skill.create({
    data: {
      shortCode: `${PREFIXO}-H01`,
      referenceCode: '4EF14_P',
      descricao: 'Localizar informação explícita',
      ordem: 1,
    },
    select: { id: true },
  })
  const h2 = await prisma.skill.create({
    data: {
      shortCode: `${PREFIXO}-H02`,
      referenceCode: '4EF15_P',
      descricao: 'Inferir sentido de palavra',
      ordem: 2,
    },
    select: { id: true },
  })
  criados.skillIds.push(h1.id, h2.id)

  await prisma.assessmentSkill.createMany({
    data: [
      { assessmentId: avaliacao.id, skillId: h1.id, referenceItems: 5 },
      { assessmentId: avaliacao.id, skillId: h2.id, referenceItems: 4 },
    ],
  })

  const importacao = await prisma.import.create({
    data: {
      assessmentId: avaliacao.id,
      schoolId: escola.id,
      fileName: `${PREFIXO}.csv`,
      fileHash: `${PREFIXO}-hash`,
      fileSize: 1024,
      storagePath: `imports/${PREFIXO}.csv`,
      fileRetainedUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: 'COMPLETED',
      userId: adminId,
    },
    select: { id: true },
  })
  criados.importIds.push(importacao.id)

  async function criarEstudanteComResultado(opcoes: {
    sufixo: string
    nome: string
    avaliado: boolean
    nivelOriginal: string
    nivelNormalizado: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | null
    acertosTotais: number | null
    itensTotais: number | null
    percentualGeral: string | null
    parcelas: {
      skillId: string
      valor: string | null
      acertos: number | null
      itens: number | null
      percentual: string | null
    }[]
  }): Promise<string> {
    const estudante = await prisma.student.create({
      data: {
        uniqueCode: `${PREFIXO}-${opcoes.sufixo}`,
        schoolId: escola.id,
        classId: turma.id,
        nomeOriginal: opcoes.nome,
        nomeNormalizado: opcoes.nome.toUpperCase(),
      },
      select: { id: true },
    })

    const resultado = await prisma.assessmentStudentResult.create({
      data: {
        assessmentId: avaliacao.id,
        schoolId: escola.id,
        classId: turma.id,
        studentId: estudante.id,
        importId: importacao.id,
        avaliado: opcoes.avaliado,
        nivelOriginal: opcoes.nivelOriginal,
        nivelNormalizado: opcoes.nivelNormalizado,
        acertosTotais: opcoes.acertosTotais,
        itensTotais: opcoes.itensTotais,
        percentualGeral: opcoes.percentualGeral,
      },
      select: { id: true },
    })

    await prisma.studentSkillResult.createMany({
      data: opcoes.parcelas.map((p) => ({
        resultId: resultado.id,
        skillId: p.skillId,
        valorOriginal: p.valor,
        acertos: p.acertos,
        itensPossiveis: p.itens,
        percentual: p.percentual,
      })),
    })

    return resultado.id
  }

  // Coerente: 2/3 + 3/4 = 5/7 → 71,4286%
  await criarEstudanteComResultado({
    sufixo: 'EST-A',
    nome: 'Aluna Coerente de Teste',
    avaliado: true,
    nivelOriginal: 'Adequado',
    nivelNormalizado: 'ADEQUADO',
    acertosTotais: 5,
    itensTotais: 7,
    percentualGeral: '71.4286',
    parcelas: [
      { skillId: h1.id, valor: '2 / 3', acertos: 2, itens: 3, percentual: '66.6667' },
      { skillId: h2.id, valor: '3 / 4', acertos: 3, itens: 4, percentual: '75.0000' },
    ],
  })

  // Avaliado com uma habilidade ausente: a ausente é ignorada, nunca somada como zero.
  await criarEstudanteComResultado({
    sufixo: 'EST-B',
    nome: 'Aluno Com Ausencia de Teste',
    avaliado: true,
    nivelOriginal: 'Defasagem',
    nivelNormalizado: 'DEFASAGEM',
    acertosTotais: 1,
    itensTotais: 3,
    percentualGeral: '33.3333',
    parcelas: [
      { skillId: h1.id, valor: '1 / 3', acertos: 1, itens: 3, percentual: '33.3333' },
      { skillId: h2.id, valor: null, acertos: null, itens: null, percentual: null },
    ],
  })

  // Não avaliado: os três campos NULL. A CHECK constraint do banco recusa qualquer
  // outra coisa — inclusive zero.
  const naoAvaliadoId = await criarEstudanteComResultado({
    sufixo: 'EST-C',
    nome: 'Crianca Nao Avaliada de Teste',
    avaliado: false,
    nivelOriginal: 'Não avaliado',
    nivelNormalizado: null,
    acertosTotais: null,
    itensTotais: null,
    percentualGeral: null,
    parcelas: [
      { skillId: h1.id, valor: null, acertos: null, itens: null, percentual: null },
      { skillId: h2.id, valor: null, acertos: null, itens: null, percentual: null },
    ],
  })

  // Totais gravados divergentes das parcelas: é o que dá o que fazer ao reprocessamento.
  // Real: 4/5 → 80,0000%. Gravado: 99/100.
  const incoerenteId = await criarEstudanteComResultado({
    sufixo: 'EST-D',
    nome: 'Aluno Com Total Divergente de Teste',
    avaliado: true,
    nivelOriginal: 'Intermediário',
    nivelNormalizado: 'INTERMEDIARIO',
    acertosTotais: 99,
    itensTotais: 100,
    percentualGeral: '99.0000',
    parcelas: [
      { skillId: h1.id, valor: '4 / 5', acertos: 4, itens: 5, percentual: '80.0000' },
    ],
  })

  f = {
    admin: await contextoDe(adminId),
    analista: await contextoDe(analistaId),
    escola: await contextoDe(escolaId),
    schoolId: escola.id,
    assessmentId: avaliacao.id,
    resultadoIncoerenteId: incoerenteId,
    resultadoNaoAvaliadoId: naoAvaliadoId,
  }
})

afterAll(async () => {
  // Ordem imposta pelas chaves estrangeiras: filhos antes dos pais.
  await prisma.assessmentStudentResult.deleteMany({
    where: { assessmentId: { in: criados.assessmentIds } },
  })
  await prisma.import.deleteMany({ where: { id: { in: criados.importIds } } })
  await prisma.student.deleteMany({ where: { schoolId: { in: criados.schoolIds } } })
  await prisma.class.deleteMany({ where: { schoolId: { in: criados.schoolIds } } })
  await prisma.assessment.deleteMany({ where: { id: { in: criados.assessmentIds } } })
  await prisma.skill.deleteMany({ where: { id: { in: criados.skillIds } } })
  // Antes dos usuários: `AnalyticalSettings.createdByUserId` referencia `User`.
  //
  // Apaga por AUTOR, não por id coletado. `AnalyticalSettings` é uma tabela
  // global — a versão vigente é lida por todo o sistema —, e uma versão que
  // escape daqui muda as faixas analíticas para os outros arquivos de teste,
  // que passam a classificar de forma diferente sem nenhum motivo aparente.
  // Confiar num array de ids exige que toda criação lembre de registrar o id;
  // filtrar pelo autor não depende dessa disciplina.
  await prisma.analyticalSettings.deleteMany({
    where: {
      OR: [
        { id: { in: criados.settingsIds } },
        { createdByUserId: { in: criados.userIds } },
      ],
    },
  })
  await prisma.auditLog.deleteMany({ where: { userId: { in: criados.userIds } } })
  await prisma.userSchool.deleteMany({ where: { userId: { in: criados.userIds } } })
  await prisma.school.deleteMany({ where: { id: { in: criados.schoolIds } } })
  await prisma.user.deleteMany({ where: { id: { in: criados.userIds } } })
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

describe('entrada dos critérios analíticos', () => {
  it('aceita vírgula e normaliza para literal decimal de duas casas', () => {
    const analisado = criteriosSchema.safeParse({
      fragilidadeMax: '62,5',
      atencaoMax: '80',
      baixoRendimento: ['DEFASAGEM'],
      abaixoDoAdequadoHabilitado: false,
    })

    expect(analisado.success).toBe(true)
    // Literal, não `number`: `Number('62.5')` funcionaria aqui e falharia em outros
    // valores. Nenhum ponto flutuante participa da conversão (Const. II).
    expect(analisado.success && analisado.data.fragilidadeMax).toBe('62.50')
    expect(analisado.success && analisado.data.atencaoMax).toBe('80.00')
  })

  it('recusa Fragilidade acima de Atenção — a faixa do meio ficaria vazia', () => {
    const analisado = criteriosSchema.safeParse({
      fragilidadeMax: '90',
      atencaoMax: '80',
      baixoRendimento: [],
      abaixoDoAdequadoHabilitado: false,
    })

    expect(analisado.success).toBe(false)
  })

  it('recusa limite acima de 100 e valor não numérico', () => {
    expect(
      criteriosSchema.safeParse({
        fragilidadeMax: '101',
        atencaoMax: '100',
        baixoRendimento: [],
        abaixoDoAdequadoHabilitado: false,
      }).success,
    ).toBe(false)

    expect(
      criteriosSchema.safeParse({
        fragilidadeMax: '1e2',
        atencaoMax: '100',
        baixoRendimento: [],
        abaixoDoAdequadoHabilitado: false,
      }).success,
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Versionamento
// ---------------------------------------------------------------------------

describe('versionamento dos critérios analíticos', () => {
  it('cria versão nova sem alterar nenhuma versão anterior', async () => {
    const antes = await prisma.analyticalSettings.findMany({
      orderBy: { version: 'asc' },
    })
    expect(antes.length).toBeGreaterThan(0)

    const criada = await criarVersaoDeCriterios(f.admin, {
      fragilidadeMax: '55.00',
      atencaoMax: '85.00',
      baixoRendimento: ['DEFASAGEM', 'INTERMEDIARIO'],
      abaixoDoAdequadoHabilitado: true,
    })
    criados.settingsIds.push(criada.id)

    // Cada versão que existia antes continua existindo, com os MESMOS valores. Um `update`
    // disfarçado de `upsert` quebraria exatamente aqui.
    const depois = await prisma.analyticalSettings.findMany({
      orderBy: { version: 'asc' },
    })
    const depoisPorId = new Map(depois.map((v) => [v.id, v]))

    for (const original of antes) {
      const atual = depoisPorId.get(original.id)
      expect(atual, `versão ${original.version} desapareceu`).toBeDefined()
      if (!atual) continue

      expect(atual.version).toBe(original.version)
      expect(atual.fragilidadeMax.toFixed(2)).toBe(original.fragilidadeMax.toFixed(2))
      expect(atual.atencaoMax.toFixed(2)).toBe(original.atencaoMax.toFixed(2))
      expect(atual.baixoRendimento).toEqual(original.baixoRendimento)
      expect(atual.abaixoDoAdequadoHabilitado).toBe(original.abaixoDoAdequadoHabilitado)
      expect(atual.effectiveFrom.toISOString()).toBe(original.effectiveFrom.toISOString())
      expect(atual.createdByUserId).toBe(original.createdByUserId)
    }

    expect(depois.length).toBe(antes.length + 1)

    const ultimaAnterior = antes[antes.length - 1]
    expect(criada.version).toBe((ultimaAnterior?.version ?? 0) + 1)
  })

  it('registra autor, início de vigência e auditoria SETTINGS_CHANGE', async () => {
    const idCriado = criados.settingsIds[criados.settingsIds.length - 1]
    expect(idCriado).toBeDefined()

    const registro = await prisma.analyticalSettings.findUniqueOrThrow({
      where: { id: idCriado ?? '' },
    })
    expect(registro.createdByUserId).toBe(f.admin.userId)
    expect(registro.effectiveFrom.getTime()).toBeLessThanOrEqual(Date.now())

    const auditorias = await prisma.auditLog.findMany({
      where: { entityType: 'AnalyticalSettings', entityId: idCriado ?? '' },
      select: { action: true, userId: true, schoolId: true, assessmentId: true },
    })

    expect(auditorias).toHaveLength(1)
    expect(auditorias[0]?.action).toBe('SETTINGS_CHANGE')
    expect(auditorias[0]?.userId).toBe(f.admin.userId)
    // Configuração é global: não pertence a escola nem a avaliação (FR-162, FR-167).
    expect(auditorias[0]?.schoolId).toBeNull()
    expect(auditorias[0]?.assessmentId).toBeNull()
  })

  it('a vigente é a de maior effectiveFrom NÃO futura', async () => {
    const idAtual = criados.settingsIds[criados.settingsIds.length - 1]

    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const futura = await criarVersaoDeCriterios(
      f.admin,
      {
        fragilidadeMax: '10.00',
        atencaoMax: '20.00',
        baixoRendimento: [],
        abaixoDoAdequadoHabilitado: false,
      },
      amanha,
    )
    criados.settingsIds.push(futura.id)

    const vigente = await lerConfiguracaoVigente()

    // A futura tem `version` maior. Se a vigência fosse decidida pelo número da versão,
    // ela já estaria valendo — e "início de vigência" não significaria nada.
    expect(vigente?.id).toBe(idAtual)
    expect(vigente?.fragilidadeMax).toBe('55.00')
    expect(vigente?.atencaoMax).toBe('85.00')

    const pelaAplicacao = await obterConfiguracaoVigente(f.admin)
    expect(pelaAplicacao?.id).toBe(idAtual)

    // E, depois de amanhã, a agendada assume.
    const depoisDeAmanha = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const futuraVigente = await lerConfiguracaoVigente(depoisDeAmanha)
    expect(futuraVigente?.id).toBe(futura.id)
  })

  it('lista o histórico com autor, período de vigência e situação', async () => {
    const versoes = await listarVersoesDeCriterios(f.admin)
    expect(versoes.length).toBeGreaterThanOrEqual(criados.settingsIds.length)

    const vigentes = versoes.filter((v) => v.situacao === 'VIGENTE')
    expect(vigentes).toHaveLength(1)
    expect(vigentes[0]?.fragilidadeMax).toBe('55.00')
    expect(vigentes[0]?.autor.id).toBe(f.admin.userId)

    const agendadas = versoes.filter((v) => v.situacao === 'AGENDADA')
    expect(agendadas).toHaveLength(1)

    // A versão vigente tem término definido: é o início da agendada.
    expect(vigentes[0]?.vigenteAte?.toISOString()).toBe(
      agendadas[0]?.effectiveFrom.toISOString(),
    )
    // A última da linha do tempo não tem término.
    expect(agendadas[0]?.vigenteAte).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Autorização
// ---------------------------------------------------------------------------

describe('autorização das telas administrativas', () => {
  it('usuário ESCOLA recebe 403 ao tentar criar versão de configuração', async () => {
    const antes = await prisma.analyticalSettings.count()

    const promessa = criarVersaoDeCriterios(f.escola, {
      fragilidadeMax: '1.00',
      atencaoMax: '2.00',
      baixoRendimento: [],
      abaixoDoAdequadoHabilitado: false,
    })

    await expect(promessa).rejects.toBeInstanceOf(AppError)
    await expect(promessa).rejects.toMatchObject({
      codigo: 'SEM_PERMISSAO',
      status: 403,
    })

    // A recusa é de verdade: nada foi gravado.
    expect(await prisma.analyticalSettings.count()).toBe(antes)
  })

  it('ESCOLA e ANALISTA recebem 403 em configuração, usuários, auditoria e reprocessamento', async () => {
    for (const ctx of [f.escola, f.analista]) {
      await expect(obterConfiguracaoVigente(ctx)).rejects.toMatchObject({ status: 403 })
      await expect(listarVersoesDeCriterios(ctx)).rejects.toMatchObject({ status: 403 })
      await expect(listarUsuarios(ctx)).rejects.toMatchObject({ status: 403 })
      await expect(listarAuditoria(ctx)).rejects.toMatchObject({ status: 403 })
      await expect(reprocessarAvaliacao(ctx, f.assessmentId)).rejects.toMatchObject({
        status: 403,
      })
    }
  })
})

// ---------------------------------------------------------------------------
// Reprocessamento
// ---------------------------------------------------------------------------

describe('reprocessamento após alteração das faixas', () => {
  it('não altera acertos, itens, valor original nem nível da fonte', async () => {
    const antes = await dumpResultados(f.assessmentId)
    expect(antes.length).toBe(4)

    // Faixas novas — e propositalmente diferentes das anteriores.
    const nova = await criarVersaoDeCriterios(f.admin, {
      fragilidadeMax: '40.00',
      atencaoMax: '70.00',
      baixoRendimento: ['DEFASAGEM'],
      abaixoDoAdequadoHabilitado: false,
    })
    criados.settingsIds.push(nova.id)

    const relatorio = await reprocessarAvaliacao(f.admin, f.assessmentId)
    expect(relatorio.examinados).toBe(4)
    expect(relatorio.naoAvaliados).toBe(1)
    // Só a linha com totais divergentes tinha o que corrigir.
    expect(relatorio.atualizados).toBe(1)

    const depois = await dumpResultados(f.assessmentId)
    const anteriores = porId(antes)

    expect(depois.length).toBe(antes.length)

    for (const atual of depois) {
      const original = anteriores.get(atual.id)
      expect(original, `resultado ${atual.id} sumiu`).toBeDefined()
      if (!original) continue

      // --- campos que NUNCA podem mudar, um a um ---
      expect(atual.assessmentId).toBe(original.assessmentId)
      expect(atual.schoolId).toBe(original.schoolId)
      expect(atual.classId).toBe(original.classId)
      expect(atual.studentId).toBe(original.studentId)
      expect(atual.importId).toBe(original.importId)
      expect(atual.avaliado).toBe(original.avaliado)
      // Const. III: o nível da fonte é intocável, e reprocessar não é ocasião de inferi-lo.
      expect(atual.nivelOriginal).toBe(original.nivelOriginal)
      expect(atual.nivelNormalizado).toBe(original.nivelNormalizado)

      // --- parcelas de habilidade: intocadas em todos os campos ---
      expect(atual.parcelas.length).toBe(original.parcelas.length)
      for (let i = 0; i < atual.parcelas.length; i += 1) {
        const p = atual.parcelas[i]
        const o = original.parcelas[i]
        expect(p).toBeDefined()
        expect(o).toBeDefined()
        if (!p || !o) continue

        expect(p.id).toBe(o.id)
        expect(p.skillId).toBe(o.skillId)
        expect(p.valorOriginal).toBe(o.valorOriginal)
        expect(p.acertos).toBe(o.acertos)
        expect(p.itensPossiveis).toBe(o.itensPossiveis)
        expect(p.percentual).toBe(o.percentual)
      }
    }

    // Os resultados coerentes não foram tocados nem nos totais.
    const intocados = depois.filter((r) => r.id !== f.resultadoIncoerenteId && r.avaliado)
    for (const r of intocados) {
      const o = anteriores.get(r.id)
      expect(r.acertosTotais).toBe(o?.acertosTotais)
      expect(r.itensTotais).toBe(o?.itensTotais)
      expect(r.percentualGeral).toBe(o?.percentualGeral)
    }
  })

  it('corrige apenas os três totais da linha divergente, a partir das parcelas', async () => {
    const corrigido = await prisma.assessmentStudentResult.findUniqueOrThrow({
      where: { id: f.resultadoIncoerenteId },
      select: {
        acertosTotais: true,
        itensTotais: true,
        percentualGeral: true,
        nivelOriginal: true,
        skillResults: { select: { acertos: true, itensPossiveis: true } },
      },
    })

    // Σ acertos ÷ Σ itens — nunca média de percentuais.
    expect(corrigido.acertosTotais).toBe(4)
    expect(corrigido.itensTotais).toBe(5)
    expect(corrigido.percentualGeral?.toFixed(4)).toBe('80.0000')

    // As parcelas que originaram o total continuam exatamente como estavam.
    expect(corrigido.skillResults).toEqual([{ acertos: 4, itensPossiveis: 5 }])
    expect(corrigido.nivelOriginal).toBe('Intermediário')
  })

  it('mantém NULL nos três campos do estudante não avaliado', async () => {
    const naoAvaliado = await prisma.assessmentStudentResult.findUniqueOrThrow({
      where: { id: f.resultadoNaoAvaliadoId },
      select: {
        avaliado: true,
        acertosTotais: true,
        itensTotais: true,
        percentualGeral: true,
      },
    })

    expect(naoAvaliado.avaliado).toBe(false)
    // Const. I: ausência nunca vira zero. A CHECK constraint do banco recusaria, mas o
    // teste existe para que a recusa não seja a primeira a descobrir o defeito.
    expect(naoAvaliado.acertosTotais).toBeNull()
    expect(naoAvaliado.itensTotais).toBeNull()
    expect(naoAvaliado.percentualGeral).toBeNull()
  })

  it('registra auditoria REPROCESS vinculada à avaliação', async () => {
    const auditorias = await prisma.auditLog.findMany({
      where: { action: 'REPROCESS', entityId: f.assessmentId },
      select: { entityType: true, assessmentId: true, userId: true },
    })

    expect(auditorias.length).toBeGreaterThanOrEqual(1)
    expect(auditorias[0]?.entityType).toBe('Assessment')
    expect(auditorias[0]?.assessmentId).toBe(f.assessmentId)
    expect(auditorias[0]?.userId).toBe(f.admin.userId)
  })

  it('reprocessar de novo não muda mais nada — a operação é idempotente', async () => {
    const antes = await dumpResultados(f.assessmentId)
    const relatorio = await reprocessarAvaliacao(f.admin, f.assessmentId)
    const depois = await dumpResultados(f.assessmentId)

    expect(relatorio.atualizados).toBe(0)
    expect(depois).toEqual(antes)
  })
})

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

describe('gestão de usuários', () => {
  let novoUsuarioId = ''

  it('cria usuário com senha em argon2id e grava USER_CREATE', async () => {
    const criado = await criarUsuario(f.admin, {
      name: 'Analista criada no teste',
      email: `${PREFIXO}-nova-analista@teste.local`.toLowerCase(),
      senha: 'senha-de-teste-bem-longa',
      role: 'ANALISTA',
      schoolIds: [f.schoolId],
      dadosNominais: 'PADRAO',
    })
    novoUsuarioId = criado.id
    criados.userIds.push(criado.id)

    const gravado = await prisma.user.findUniqueOrThrow({
      where: { id: criado.id },
      select: {
        passwordHash: true,
        canAccessNominalData: true,
        active: true,
        schools: { select: { schoolId: true } },
      },
    })

    expect(gravado.passwordHash.startsWith('$argon2id$')).toBe(true)
    expect(gravado.passwordHash).not.toContain('senha-de-teste-bem-longa')
    // FR-007: o padrão de ANALISTA é NEGADA.
    expect(gravado.canAccessNominalData).toBe(false)
    expect(gravado.active).toBe(true)
    expect(gravado.schools.map((v) => v.schoolId)).toEqual([f.schoolId])

    const auditorias = await prisma.auditLog.findMany({
      where: { entityType: 'User', entityId: criado.id, action: 'USER_CREATE' },
    })
    expect(auditorias).toHaveLength(1)
  })

  it('aplica o padrão de dados nominais por perfil — concedida a ESCOLA', async () => {
    const criado = await criarUsuario(f.admin, {
      name: 'Coordenação da escola de teste',
      email: `${PREFIXO}-nova-escola@teste.local`.toLowerCase(),
      senha: 'outra-senha-bem-longa',
      role: 'ESCOLA',
      schoolIds: [f.schoolId],
      dadosNominais: 'PADRAO',
    })
    criados.userIds.push(criado.id)

    const gravado = await prisma.user.findUniqueOrThrow({
      where: { id: criado.id },
      select: { canAccessNominalData: true },
    })
    expect(gravado.canAccessNominalData).toBe(true)
  })

  it('alterar canAccessNominalData grava USER_NOMINAL_PERMISSION_CHANGE', async () => {
    await definirPermissaoDadosNominais(f.admin, novoUsuarioId, true)

    const auditorias = await prisma.auditLog.findMany({
      where: {
        entityType: 'User',
        entityId: novoUsuarioId,
        action: 'USER_NOMINAL_PERMISSION_CHANGE',
      },
      select: { beforeValue: true, afterValue: true },
    })

    expect(auditorias).toHaveLength(1)
    expect(auditorias[0]?.beforeValue).toMatchObject({ canAccessNominalData: false })
    expect(auditorias[0]?.afterValue).toMatchObject({ canAccessNominalData: true })

    const gravado = await prisma.user.findUniqueOrThrow({
      where: { id: novoUsuarioId },
      select: { canAccessNominalData: true },
    })
    expect(gravado.canAccessNominalData).toBe(true)
  })

  it('não registra auditoria quando a permissão é reafirmada sem mudar', async () => {
    await definirPermissaoDadosNominais(f.admin, novoUsuarioId, true)

    const total = await prisma.auditLog.count({
      where: {
        entityType: 'User',
        entityId: novoUsuarioId,
        action: 'USER_NOMINAL_PERMISSION_CHANGE',
      },
    })
    expect(total).toBe(1)
  })

  it('atualização de cadastro grava USER_UPDATE e, se a permissão mudar, também o verbo específico', async () => {
    await atualizarUsuario(f.admin, novoUsuarioId, {
      name: 'Analista renomeada no teste',
      email: `${PREFIXO}-nova-analista@teste.local`.toLowerCase(),
      role: 'ANALISTA',
      active: true,
      canAccessNominalData: false,
      schoolIds: [f.schoolId],
    })

    expect(
      await prisma.auditLog.count({
        where: { entityType: 'User', entityId: novoUsuarioId, action: 'USER_UPDATE' },
      }),
    ).toBe(1)

    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'User',
          entityId: novoUsuarioId,
          action: 'USER_NOMINAL_PERMISSION_CHANGE',
        },
      }),
    ).toBe(2)
  })

  it('desativa a conta sem apagá-la e recusa a autodesativação do administrador', async () => {
    await definirSituacaoDoUsuario(f.admin, novoUsuarioId, false)

    const gravado = await prisma.user.findUniqueOrThrow({
      where: { id: novoUsuarioId },
      select: { active: true },
    })
    expect(gravado.active).toBe(false)

    await expect(
      definirSituacaoDoUsuario(f.admin, f.admin.userId, false),
    ).rejects.toMatchObject({ codigo: 'CONFLITO' })
  })

  it('recusa e-mail repetido com 409', async () => {
    const promessa = criarUsuario(f.admin, {
      name: 'Duplicata de e-mail',
      email: `${PREFIXO}-nova-analista@teste.local`.toLowerCase(),
      senha: 'mais-uma-senha-bem-longa',
      role: 'ANALISTA',
      schoolIds: [],
      dadosNominais: 'PADRAO',
    })

    await expect(promessa).rejects.toMatchObject({ codigo: 'CONFLITO' })
  })

  it('recusa vínculo com escola fora do escopo — 404, nunca 403', async () => {
    const promessa = criarUsuario(f.admin, {
      name: 'Usuário com escola inexistente',
      email: `${PREFIXO}-escola-fantasma@teste.local`.toLowerCase(),
      senha: 'senha-para-escola-fantasma',
      role: 'ESCOLA',
      schoolIds: ['escola-que-nao-existe'],
      dadosNominais: 'PADRAO',
    })

    await expect(promessa).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' })
  })
})

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

describe('trilha de auditoria', () => {
  it('lista com filtros por ação, autor e período, sem expor valores gravados', async () => {
    const pagina = await listarAuditoria(f.admin, {
      action: 'SETTINGS_CHANGE',
      userId: f.admin.userId,
      de: new Date(Date.now() - 24 * 60 * 60 * 1000),
      ate: new Date(),
    })

    expect(pagina.linhas.length).toBeGreaterThanOrEqual(3)
    expect(pagina.linhas.every((l) => l.action === 'SETTINGS_CHANGE')).toBe(true)
    expect(pagina.linhas.every((l) => l.entityType === 'AnalyticalSettings')).toBe(true)
    expect(pagina.linhas.every((l) => l.autor.id === f.admin.userId)).toBe(true)

    // A linha devolvida não carrega `beforeValue`/`afterValue`/`metadata`: o que a tela
    // não recebe, a tela não pode vazar.
    for (const linha of pagina.linhas) {
      expect(Object.keys(linha).sort()).toEqual(
        [
          'action',
          'autor',
          'entityId',
          'entityType',
          'id',
          'occurredAt',
          'rotuloAcao',
        ].sort(),
      )
    }
  })

  it('a tabela de auditoria não possui coluna de nome — referência é por identificador', async () => {
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audit_log'
    `
    const nomes = colunas.map((c) => c.column_name.toLowerCase())

    expect(nomes.length).toBeGreaterThan(0)
    expect(nomes).not.toContain('name')
    expect(nomes).not.toContain('nome')
    expect(nomes).not.toContain('studentname')
    expect(nomes).not.toContain('nomeoriginal')
  })

  it('nenhum registro de auditoria contém nome de estudante', async () => {
    const estudantes = await prisma.student.findMany({
      select: { nomeOriginal: true, nomeNormalizado: true },
    })

    // Nomes muito curtos gerariam falso positivo por casar com trecho de identificador.
    const nomes = [
      ...new Set(
        estudantes
          .flatMap((e) => [e.nomeOriginal, e.nomeNormalizado])
          .filter((n) => n.trim().length >= 4),
      ),
    ]
    expect(nomes.length).toBeGreaterThan(0)

    const registros = await prisma.auditLog.findMany({
      select: {
        id: true,
        entityType: true,
        entityId: true,
        beforeValue: true,
        afterValue: true,
        metadata: true,
      },
    })
    expect(registros.length).toBeGreaterThan(0)

    for (const registro of registros) {
      const serializado = JSON.stringify({
        entityType: registro.entityType,
        entityId: registro.entityId,
        beforeValue: registro.beforeValue,
        afterValue: registro.afterValue,
        metadata: registro.metadata,
      }).toUpperCase()

      for (const nome of nomes) {
        expect(
          serializado.includes(nome.toUpperCase()),
          `registro ${registro.id} contém nome de estudante`,
        ).toBe(false)
      }
    }
  })
})
