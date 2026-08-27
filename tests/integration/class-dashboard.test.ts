import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/server/prisma'
import { resolveAllowedSchoolIds, type AuthContext } from '@/server/authorization'
import { obterDashboardDaTurma } from '@/modules/analytics/application/class-dashboard'
import { obterFichaDoEstudante } from '@/modules/analytics/application/student-record'
import { ABSENCE_PLACEHOLDER, toPercent } from '@/lib/decimal'

/**
 * Dashboard da turma contra o Postgres real — FR-077 a FR-082, FR-093.
 *
 * O que estes testes protegem não é aritmética: é o conjunto de regras que só existe quando
 * consulta, escopo e agregação se encontram no banco de verdade. Um mock passaria com o
 * filtro `avaliado: true` esquecido — e o esquecimento não geraria erro, apenas rebaixaria a
 * turma inteira em silêncio. É esse o defeito que a suíte precisa flagrar.
 *
 * Cenário sintético: 8 estudantes, 2 deles não avaliados, níveis variados e percentuais
 * escolhidos para que a ordem esperada seja única — sem empate, o teste de ordenação prova
 * exatamente o que promete.
 *
 * Tudo leva o prefixo `ZZTEST-` e é removido no `afterAll`.
 */

const PREFIXO = `ZZTEST-DASH-${Date.now()}`

/** 4 habilidades, 3 itens cada: 12 itens possíveis por estudante avaliado. */
const ITENS_POR_HABILIDADE = 3
const HABILIDADES = ['H01', 'H02', 'H03', 'H04'] as const

type Semente = {
  chave: string
  nome: string
  avaliado: boolean
  nivelOriginal: string
  nivelNormalizado: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | null
  /** Acertos por habilidade, na ordem de HABILIDADES. `null` é célula ausente. */
  acertos: readonly (number | null)[]
}

/**
 * Os percentuais gerais foram escolhidos para produzir uma ordem total estrita dentro de
 * cada grupo: 2/12, 5/12 em Defasagem; 7/12, 8/12 em Intermediário; 10/12, 12/12 em Adequado.
 */
const SEMENTES: readonly Semente[] = [
  {
    chave: 'adeq-alto',
    nome: 'Ana Adequada Alta',
    avaliado: true,
    nivelOriginal: 'Adequado',
    nivelNormalizado: 'ADEQUADO',
    acertos: [3, 3, 3, 3], // 12/12 = 100%
  },
  {
    chave: 'defas-baixo',
    nome: 'Bruno Defasagem Baixa',
    avaliado: true,
    nivelOriginal: 'Defasagem',
    nivelNormalizado: 'DEFASAGEM',
    acertos: [0, 1, 1, 0], // 2/12 ≈ 16,67%
  },
  {
    chave: 'inter-alto',
    nome: 'Carla Intermediária Alta',
    avaliado: true,
    nivelOriginal: 'Intermediário',
    nivelNormalizado: 'INTERMEDIARIO',
    acertos: [2, 2, 2, 2], // 8/12 ≈ 66,67%
  },
  {
    chave: 'nao-aval-um',
    nome: 'Davi Ausente Um',
    avaliado: false,
    nivelOriginal: '',
    nivelNormalizado: null,
    acertos: [null, null, null, null],
  },
  {
    chave: 'inter-baixo',
    nome: 'Elisa Intermediária Baixa',
    avaliado: true,
    nivelOriginal: 'Intermediário',
    nivelNormalizado: 'INTERMEDIARIO',
    acertos: [2, 2, 2, 1], // 7/12 ≈ 58,33%
  },
  {
    chave: 'defas-alto',
    nome: 'Felipe Defasagem Alta',
    avaliado: true,
    nivelOriginal: 'Defasagem',
    nivelNormalizado: 'DEFASAGEM',
    acertos: [1, 2, 1, 1], // 5/12 ≈ 41,67%
  },
  {
    chave: 'nao-aval-dois',
    nome: 'Gabi Ausente Dois',
    avaliado: false,
    nivelOriginal: '',
    nivelNormalizado: null,
    acertos: [null, null, null, null],
  },
  {
    chave: 'adeq-baixo',
    nome: 'Helena Adequada Baixa',
    avaliado: true,
    nivelOriginal: 'Adequado',
    nivelNormalizado: 'ADEQUADO',
    acertos: [3, 2, 3, 2], // 10/12 ≈ 83,33%
  },
]

/** Σ acertos e Σ itens entre os AVALIADOS: 12 + 2 + 8 + 7 + 5 + 10 = 44 sobre 6 × 12 = 72. */
const ACERTOS_ESPERADOS = 44
const ITENS_ESPERADOS = 72

type Fixtura = {
  admin: AuthContext
  schoolId: string
  classId: string
  assessmentId: string
  skillIds: readonly string[]
  studentIds: Map<string, string>
}

const criados = {
  userIds: [] as string[],
  schoolIds: [] as string[],
  assessmentIds: [] as string[],
  skillIds: [] as string[],
  settingsIds: [] as string[],
}

let f: Fixtura

/**
 * Percentual persistido, no formato `Decimal(7,4)` do schema.
 *
 * O banco exige (`ssr_percentual_derivado`, `asr_nao_avaliado_sem_desempenho`) que o
 * percentual exista exatamente quando a fração existe — e não exista em nenhum outro caso.
 * A derivação passa por `toPercent`, nunca por divisão em ponto flutuante (Const. II).
 */
function percentualPersistido(
  acertos: number | null,
  itens: number | null,
): string | null {
  if (acertos === null || itens === null || itens <= 0) return null
  return (toPercent({ acertos, itens }) ?? null)?.toFixed(4) ?? null
}

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

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: `${PREFIXO}-admin@teste.local`.toLowerCase(),
      passwordHash: 'hash-de-teste-nao-utilizado',
      name: 'Administrador de teste do painel',
      role: 'ADMIN',
      canAccessNominalData: true,
    },
    select: { id: true },
  })
  criados.userIds.push(usuario.id)

  // As faixas analíticas vêm SEMPRE do banco (FR-111). Se a semeadura não rodou neste
  // ambiente, o teste cria a configuração e a remove no fim — nunca assume 60/80 em código.
  const configuracao = await prisma.analyticalSettings.findFirst({
    orderBy: { version: 'desc' },
  })
  if (!configuracao) {
    const nova = await prisma.analyticalSettings.create({
      data: {
        version: 1,
        fragilidadeMax: '60.00',
        atencaoMax: '80.00',
        baixoRendimento: ['DEFASAGEM'],
        createdByUserId: usuario.id,
      },
      select: { id: true },
    })
    criados.settingsIds.push(nova.id)
  }

  const escola = await prisma.school.create({
    data: {
      code: `${PREFIXO}-ESC`,
      name: 'Escola de teste do painel',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RORAIMA',
    },
    select: { id: true },
  })
  criados.schoolIds.push(escola.id)

  const turma = await prisma.class.create({
    data: {
      schoolId: escola.id,
      externalCode: `${PREFIXO}-T1`,
      name: '4º ano A de teste',
      anoEscolar: '4º ano',
    },
    select: { id: true },
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

  const skillIds: string[] = []
  for (const [indice, curto] of HABILIDADES.entries()) {
    const habilidade = await prisma.skill.create({
      data: {
        shortCode: `${PREFIXO}-${curto}`,
        referenceCode: `4EF0${indice + 1}_P`,
        descricao: `Habilidade sintética ${curto} da suíte de teste.`,
        ordem: indice + 1,
      },
      select: { id: true },
    })
    skillIds.push(habilidade.id)
    criados.skillIds.push(habilidade.id)

    await prisma.assessmentSkill.create({
      data: {
        assessmentId: avaliacao.id,
        skillId: habilidade.id,
        referenceItems: ITENS_POR_HABILIDADE,
      },
    })
  }

  const importacao = await prisma.import.create({
    data: {
      assessmentId: avaliacao.id,
      schoolId: escola.id,
      fileName: `${PREFIXO}.csv`,
      fileHash: `${PREFIXO}-hash`,
      fileSize: 1024,
      // `import_expurgo_coerente` exige caminho presente enquanto não houve expurgo.
      storagePath: `${PREFIXO}/arquivo.csv`,
      fileRetainedUntil: new Date(Date.now() + 86_400_000),
      status: 'COMPLETED',
      userId: usuario.id,
      totalRows: SEMENTES.length,
    },
    select: { id: true },
  })

  const studentIds = new Map<string, string>()

  for (const semente of SEMENTES) {
    const estudante = await prisma.student.create({
      data: {
        uniqueCode: `${PREFIXO}-${semente.chave}`.toUpperCase(),
        schoolId: escola.id,
        classId: turma.id,
        nomeOriginal: semente.nome,
        nomeNormalizado: semente.nome.toUpperCase(),
      },
      select: { id: true },
    })
    studentIds.set(semente.chave, estudante.id)

    const totais = semente.avaliado
      ? semente.acertos.reduce<number>((soma, a) => soma + (a ?? 0), 0)
      : null
    const itensTotais = semente.avaliado
      ? HABILIDADES.length * ITENS_POR_HABILIDADE
      : null

    await prisma.assessmentStudentResult.create({
      data: {
        assessmentId: avaliacao.id,
        schoolId: escola.id,
        classId: turma.id,
        studentId: estudante.id,
        importId: importacao.id,
        avaliado: semente.avaliado,
        nivelOriginal: semente.nivelOriginal,
        nivelNormalizado: semente.nivelNormalizado,
        // Const. I — o não avaliado nasce NULL no banco, não zero. A restrição
        // `asr_nao_avaliado_sem_desempenho` recusaria qualquer outra coisa.
        acertosTotais: totais,
        itensTotais,
        percentualGeral: percentualPersistido(totais, itensTotais),
        skillResults: {
          create: semente.acertos.map((acertos, indice) => ({
            skillId: skillIds[indice] ?? '',
            valorOriginal:
              acertos === null ? null : `${acertos} / ${ITENS_POR_HABILIDADE}`,
            acertos,
            itensPossiveis: acertos === null ? null : ITENS_POR_HABILIDADE,
            percentual: percentualPersistido(
              acertos,
              acertos === null ? null : ITENS_POR_HABILIDADE,
            ),
          })),
        },
      },
    })
  }

  f = {
    admin: await contextoDe(usuario.id),
    schoolId: escola.id,
    classId: turma.id,
    assessmentId: avaliacao.id,
    skillIds,
    studentIds,
  }
})

afterAll(async () => {
  // Ordem imposta pelas chaves estrangeiras: filhos antes dos pais.
  await prisma.studentSkillResult.deleteMany({
    where: { result: { schoolId: { in: criados.schoolIds } } },
  })
  await prisma.assessmentStudentResult.deleteMany({
    where: { schoolId: { in: criados.schoolIds } },
  })
  await prisma.assessmentSkill.deleteMany({
    where: { assessmentId: { in: criados.assessmentIds } },
  })
  await prisma.import.deleteMany({ where: { schoolId: { in: criados.schoolIds } } })
  await prisma.student.deleteMany({ where: { schoolId: { in: criados.schoolIds } } })
  await prisma.class.deleteMany({ where: { schoolId: { in: criados.schoolIds } } })
  await prisma.skill.deleteMany({ where: { id: { in: criados.skillIds } } })
  await prisma.assessment.deleteMany({ where: { id: { in: criados.assessmentIds } } })
  await prisma.school.deleteMany({ where: { id: { in: criados.schoolIds } } })
  await prisma.analyticalSettings.deleteMany({
    where: { id: { in: criados.settingsIds } },
  })
  await prisma.auditLog.deleteMany({ where: { userId: { in: criados.userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: criados.userIds } } })
  await prisma.$disconnect()
})

describe('cabeçalho e indicadores da turma', () => {
  it('exibe escola, turma, código da turma, ano escolar e componente curricular', async () => {
    const { turma, conteudo } = await obterDashboardDaTurma(
      f.admin,
      f.classId,
      f.assessmentId,
    )

    expect(turma.escolaNome).toBe('Escola de teste do painel')
    expect(turma.turmaNome).toBe('4º ano A de teste')
    expect(turma.codigoTurma).toBe(`${PREFIXO}-T1`)
    expect(turma.anoEscolar).toBe('4º ano')
    expect(conteudo?.avaliacao.componenteCurricular).toBe('Leitura')
  })

  it('conta participação com os não avaliados no denominador — e só ali', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    expect(conteudo?.participacao).toMatchObject({
      total: 8,
      avaliados: 6,
      naoAvaliados: 2,
    })
    // 6 / 8 = 75%
    expect(conteudo?.participacao.taxaTexto).toBe('75,00%')
  })

  it('não conta o não avaliado como Defasagem na distribuição por nível', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    expect(conteudo?.distribuicao).toMatchObject({
      defasagem: 2,
      intermediario: 2,
      adequado: 2,
      totalAvaliados: 6,
    })
    // Se os não avaliados vazassem para cá, a soma daria 8 e Defasagem, 4.
    expect(conteudo?.distribuicao.totalAvaliados).toBe(6)
  })
})

describe('percentual geral da turma', () => {
  it('exclui os não avaliados do numerador e do denominador', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    expect(conteudo?.desempenho.acertos).toBe(ACERTOS_ESPERADOS)
    expect(conteudo?.desempenho.itens).toBe(ITENS_ESPERADOS)

    // 44 / 72 = 61,111...% → 61,11%. Com os 2 não avaliados contados como zero o
    // denominador seria 96 e o percentual cairia para 45,83% — a turma inteira rebaixada
    // por um filtro esquecido.
    expect(conteudo?.desempenho.percentualTexto).toBe('61,11%')
    expect(conteudo?.desempenho.itens).not.toBe(
      SEMENTES.length * HABILIDADES.length * ITENS_POR_HABILIDADE,
    )
  })

  it('é Σ acertos ÷ Σ itens, e não a média simples dos percentuais', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    // A média simples dos seis percentuais daria 61,11% por coincidência de desenho?
    // Não: 100 + 16,67 + 66,67 + 58,33 + 41,67 + 83,33 = 366,67 / 6 = 61,11%.
    // Aqui os denominadores são idênticos, então as duas contas coincidem — o que este
    // teste fixa é a fração, verificável termo a termo, e não o número arredondado.
    expect(conteudo?.desempenho.fracaoTexto).toBe('44 / 72')
  })
})

describe('ordenação por prioridade pedagógica (FR-082)', () => {
  it('ordena Defasagem, Intermediário e Adequado, do menor percentual ao maior', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    const codigos = conteudo?.estudantesAvaliados.map((e) => e.uniqueCode) ?? []

    expect(codigos).toEqual([
      `${PREFIXO}-defas-baixo`.toUpperCase(), // 2/12
      `${PREFIXO}-defas-alto`.toUpperCase(), // 5/12
      `${PREFIXO}-inter-baixo`.toUpperCase(), // 7/12
      `${PREFIXO}-inter-alto`.toUpperCase(), // 8/12
      `${PREFIXO}-adeq-baixo`.toUpperCase(), // 10/12
      `${PREFIXO}-adeq-alto`.toUpperCase(), // 12/12
    ])
  })

  it('mantém o grupo como chave primária: o Adequado de 83% vem depois do Intermediário de 66%', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)
    const niveis = conteudo?.estudantesAvaliados.map((e) => e.nivelNormalizado) ?? []

    expect(niveis).toEqual([
      'DEFASAGEM',
      'DEFASAGEM',
      'INTERMEDIARIO',
      'INTERMEDIARIO',
      'ADEQUADO',
      'ADEQUADO',
    ])
  })
})

describe('não avaliados', () => {
  it('saem em lista própria e nunca entre os avaliados', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    expect(conteudo?.estudantesNaoAvaliados).toHaveLength(2)
    expect(conteudo?.estudantesAvaliados).toHaveLength(6)
    expect(conteudo?.estudantesAvaliados.every((e) => e.avaliado)).toBe(true)
    expect(conteudo?.estudantesNaoAvaliados.every((e) => !e.avaliado)).toBe(true)

    // Nenhum não avaliado aparece na lista dos avaliados, em posição alguma.
    const naoAvaliados = new Set(
      conteudo?.estudantesNaoAvaliados.map((e) => e.studentId) ?? [],
    )
    expect(conteudo?.estudantesAvaliados.some((e) => naoAvaliados.has(e.studentId))).toBe(
      false,
    )
  })

  it('nunca recebe rótulo de Defasagem nem nível normalizado inventado', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    for (const estudante of conteudo?.estudantesNaoAvaliados ?? []) {
      expect(estudante.nivelNormalizado).toBeNull()
    }
  })

  it('não tem zero em campo algum — todos os números são NULL e o texto é travessão', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    for (const estudante of conteudo?.estudantesNaoAvaliados ?? []) {
      expect(estudante.acertos).toBeNull()
      expect(estudante.itens).toBeNull()
      expect(estudante.performance).toBeNull()
      expect(estudante.habilidadesEmFragilidade).toBeNull()
      expect(estudante.habilidadesEmAtencao).toBeNull()

      expect(estudante.fracaoTexto).toBe(ABSENCE_PLACEHOLDER)
      expect(estudante.percentualTexto).toBe(ABSENCE_PLACEHOLDER)

      // A checagem que pega o defeito de verdade: nenhum campo numérico virou 0 no caminho.
      expect(estudante.acertos).not.toBe(0)
      expect(estudante.habilidadesEmFragilidade).not.toBe(0)
      expect(estudante.percentualTexto).not.toBe('0,00%')
    }
  })
})

describe('tabela de habilidades da turma (FR-080)', () => {
  it('ordena da maior fragilidade ao melhor desempenho, com posição base 1', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)
    const habilidades = conteudo?.habilidades ?? []

    expect(habilidades).toHaveLength(HABILIDADES.length)
    expect(habilidades.map((h) => h.posicao)).toEqual([1, 2, 3, 4])

    // Σ acertos por habilidade entre os 6 avaliados, denominador 18 (6 × 3):
    //   H01: 3+0+2+2+1+3 = 11   H02: 3+1+2+2+2+2 = 12
    //   H03: 3+1+2+2+1+3 = 12   H04: 3+0+2+1+1+2 =  9
    const primeira = habilidades[0]
    expect(primeira?.acertos).toBe(9)
    expect(primeira?.itens).toBe(18)
    expect(primeira?.fracaoTexto).toBe('9 / 18')
    expect(primeira?.faixa).toBe('FRAGILIDADE')

    const ultima = habilidades[habilidades.length - 1]
    expect(ultima?.acertos).toBe(12)
  })

  it('aponta a habilidade mais frágil e a de melhor desempenho da turma (FR-079)', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    expect(conteudo?.habilidadeMaisFragil?.acertos).toBe(9)
    expect(conteudo?.habilidadeMelhorDesempenho?.acertos).toBe(12)
  })
})

describe('mapa de calor (FR-094 a FR-097)', () => {
  it('inclui o não avaliado como linha inteira de células sem resultado', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)
    const mapa = conteudo?.mapaDeCalor

    expect(mapa?.linhas).toHaveLength(SEMENTES.length)
    expect(mapa?.habilidades).toHaveLength(HABILIDADES.length)
    // 6 avaliados × 4 habilidades.
    expect(mapa?.celulasComResultado).toBe(24)

    const linhaAusente = mapa?.linhas.find((l) => !l.avaliado)
    expect(linhaAusente).toBeDefined()
    for (const celula of linhaAusente?.celulas ?? []) {
      expect(celula.temResultado).toBe(false)
      expect(celula.acertos).toBeNull()
      expect(celula.fracaoTexto).toBe(ABSENCE_PLACEHOLDER)
      expect(celula.percentualTexto).toBe(ABSENCE_PLACEHOLDER)
      expect(celula.faixa).toBeNull()
    }
  })

  it('distingue célula sem resultado de célula com resultado zero', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    const zerada = conteudo?.mapaDeCalor.linhas
      .find((l) => l.uniqueCode === `${PREFIXO}-defas-baixo`.toUpperCase())
      ?.celulas.find((c) => c.acertos === 0)

    expect(zerada?.temResultado).toBe(true)
    expect(zerada?.fracaoTexto).toBe('0 / 3')
    expect(zerada?.percentualTexto).toBe('0,00%')
    expect(zerada?.faixa).toBe('FRAGILIDADE')
    // O valor numérico está no rótulo acessível: a cor nunca responde sozinha (FR-096).
    expect(zerada?.rotuloAcessivel).toContain('0 / 3')
    expect(zerada?.rotuloAcessivel).toContain('0,00%')
  })

  it('mantém a mesma ordem de prioridade da tabela de estudantes', async () => {
    const { conteudo } = await obterDashboardDaTurma(f.admin, f.classId, f.assessmentId)

    const ordemEsperada = [
      ...(conteudo?.estudantesAvaliados ?? []),
      ...(conteudo?.estudantesNaoAvaliados ?? []),
    ].map((e) => e.studentId)

    expect(conteudo?.mapaDeCalor.linhas.map((l) => l.studentId)).toEqual(ordemEsperada)
  })
})

describe('ficha individual do estudante (FR-088 a FR-093)', () => {
  it('exibe o nível da fonte, os totais e o detalhamento do avaliado', async () => {
    const studentId = f.studentIds.get('adeq-baixo')
    expect(studentId).toBeDefined()

    const ficha = await obterFichaDoEstudante(f.admin, studentId ?? '', f.assessmentId)

    expect(ficha.situacao).toBe('AVALIADO')
    expect(ficha.nivelOriginal).toBe('Adequado')
    expect(ficha.acertosTotais).toBe(10)
    expect(ficha.itensPossiveis).toBe(12)
    expect(ficha.percentualTexto).toBe('83,33%')
    expect(ficha.habilidades).toHaveLength(HABILIDADES.length)
    // 3/3, 2/3, 3/3, 2/3 → duas em Atenção (66,67%), duas Satisfatórias.
    expect(ficha.habilidadesEmAtencao).toBe(2)
    expect(ficha.habilidadesEmFragilidade).toBe(0)
  })

  it('não exibe zero em campo algum da ficha do não avaliado', async () => {
    const studentId = f.studentIds.get('nao-aval-um')
    expect(studentId).toBeDefined()

    const ficha = await obterFichaDoEstudante(f.admin, studentId ?? '', f.assessmentId)

    expect(ficha.situacao).toBe('NAO_AVALIADO')
    expect(ficha.acertosTotais).toBeNull()
    expect(ficha.itensPossiveis).toBeNull()
    expect(ficha.performance).toBeNull()
    expect(ficha.percentualTexto).toBe(ABSENCE_PLACEHOLDER)
    expect(ficha.nivelNormalizado).toBeNull()

    // Contagens de faixa também são ausência: `0` diria "nenhuma fragilidade", que é
    // afirmação sobre um desempenho que não existe (FR-093).
    expect(ficha.habilidadesEmFragilidade).toBeNull()
    expect(ficha.habilidadesEmAtencao).toBeNull()

    // O detalhamento continua listando as habilidades — a ausência aparece, não some.
    expect(ficha.habilidades).toHaveLength(HABILIDADES.length)
    for (const habilidade of ficha.habilidades) {
      expect(habilidade.acertos).toBeNull()
      expect(habilidade.percentualTexto).toBe(ABSENCE_PLACEHOLDER)
      expect(habilidade.faixa).toBeNull()
    }
  })
})

describe('escopo por escola', () => {
  it('responde 404 — não 403 — para turma fora do escopo do requisitante', async () => {
    const semEscopo: AuthContext = { ...f.admin, allowedSchoolIds: [] }

    await expect(
      obterDashboardDaTurma(semEscopo, f.classId, f.assessmentId),
    ).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO', status: 404 })
  })
})
