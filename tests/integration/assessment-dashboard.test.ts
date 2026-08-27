import Decimal from 'decimal.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, type LearningLevel, type Role } from '@prisma/client'

import type { AuthContext } from '@/server/authorization'
import { obterPainelAvaliacao } from '@/modules/analytics/application/assessment-dashboard'
import { obterPainelEscola } from '@/modules/analytics/application/school-dashboard'

/**
 * Painel geral da avaliação e painel da escola, contra o banco real.
 *
 * O conjunto sintético é pequeno de propósito: 10 estudantes, 7 avaliados e 3 não avaliados,
 * com números escolhidos para que cada asserção tenha um único resultado correto e verificável
 * à mão. É o que permite provar, e não apenas afirmar, as quatro regras que o painel não pode
 * violar:
 *
 *  1. participação conta os 10; desempenho conta os 7;
 *  2. a distribuição por nível divide por 7 (avaliados), nunca por 10 (importados);
 *  3. nenhum não avaliado aparece como Defasagem;
 *  4. desempenho é `Σ acertos ÷ Σ itens` — 24/35 —, jamais a média dos percentuais.
 *
 * Se alguém esquecer `avaliado: true` numa consulta de desempenho, o denominador vira 50 e
 * três destes testes quebram ao mesmo tempo.
 */

const prisma = new PrismaClient()
const SUFIXO = `painel-${Date.now()}`

let userId: string
let escolaId: string
let outraEscolaId: string
let assessmentId: string
let importId: string
let turmaAId: string
let turmaBId: string
let skillIds: [string, string, string]
let criamosConfiguracao = false
let configuracaoId: string | null = null

function contextoDe(role: Role, escolas: string[]): AuthContext {
  return { userId, role, allowedSchoolIds: escolas, canAccessNominalData: true }
}

/** Contexto do administrador da rede: enxerga as duas escolas do cenário. */
function ctxAdmin(): AuthContext {
  return contextoDe('ADMIN', [escolaId, outraEscolaId])
}

/** Contexto de um usuário vinculado APENAS à outra escola. */
function ctxOutraEscola(): AuthContext {
  return contextoDe('ESCOLA', [outraEscolaId])
}

/**
 * Cenário. Cada estudante avaliado responde às três habilidades com denominadores 2, 2 e 1.
 *
 * E3 tem a terceira habilidade **ausente** — `null`, não zero. É o que faz os denominadores
 * variarem entre estudantes e, com isso, separa `Σ acertos ÷ Σ itens` da média simples dos
 * percentuais: se todos tivessem os mesmos 5 itens, os dois indicadores coincidiriam e o
 * teste não provaria nada.
 *
 * Somas verificáveis à mão:
 *   H01 → 5 / 14      H02 → 12 / 14      H03 → 6 / 6      geral → 23 / 34
 */
const AVALIADOS: readonly {
  nome: string
  turma: 'A' | 'B'
  nivel: LearningLevel
  acertos: readonly [number, number, number | null]
}[] = [
  { nome: 'E1', turma: 'A', nivel: 'DEFASAGEM', acertos: [0, 2, 1] },
  { nome: 'E2', turma: 'A', nivel: 'INTERMEDIARIO', acertos: [1, 2, 1] },
  { nome: 'E3', turma: 'A', nivel: 'DEFASAGEM', acertos: [0, 1, null] },
  { nome: 'E4', turma: 'A', nivel: 'ADEQUADO', acertos: [1, 2, 1] },
  { nome: 'E5', turma: 'B', nivel: 'ADEQUADO', acertos: [2, 2, 1] },
  { nome: 'E6', turma: 'B', nivel: 'INTERMEDIARIO', acertos: [0, 1, 1] },
  { nome: 'E7', turma: 'B', nivel: 'ADEQUADO', acertos: [1, 2, 1] },
]

/** Os três não avaliados: tudo NULL, nunca zero (Const. I). */
const NAO_AVALIADOS: readonly { nome: string; turma: 'A' | 'B' }[] = [
  { nome: 'N1', turma: 'A' },
  { nome: 'N2', turma: 'A' },
  { nome: 'N3', turma: 'B' },
]

const ITENS_POR_HABILIDADE: [number, number, number] = [2, 2, 1]

/** Percentual derivado da fração, como string exata para o `Decimal(7,4)` do banco. */
function percentualDe(acertos: number, itens: number): string {
  return new Decimal(acertos).times(100).dividedBy(itens).toFixed(4)
}

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: `${SUFIXO}@teste.local`,
      name: 'Teste Painel',
      passwordHash: 'x',
      role: 'ADMIN',
      canAccessNominalData: true,
    },
  })
  userId = usuario.id

  // Os limites das faixas vêm sempre da configuração (FR-111). Se o banco de teste ainda não
  // tiver nenhuma versão, criamos uma — e a removemos ao final, para não alterar a vigente.
  const configuracao = await prisma.analyticalSettings.findFirst({
    orderBy: { version: 'desc' },
  })
  if (!configuracao) {
    const criada = await prisma.analyticalSettings.create({
      data: {
        version: 1,
        fragilidadeMax: '60',
        atencaoMax: '80',
        baixoRendimento: ['DEFASAGEM'],
        createdByUserId: userId,
      },
    })
    criamosConfiguracao = true
    configuracaoId = criada.id
  }

  const escola = await prisma.school.create({
    data: {
      code: `ESC-A-${SUFIXO}`,
      name: 'Escola do Painel',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RORAIMA',
    },
  })
  escolaId = escola.id

  const outra = await prisma.school.create({
    data: {
      code: `ESC-B-${SUFIXO}`,
      name: 'Escola Vizinha',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RORAIMA',
    },
  })
  outraEscolaId = outra.id

  const avaliacao = await prisma.assessment.create({
    data: {
      nome: `Avaliação ${SUFIXO}`,
      ano: 2026,
      ciclo: 'II Ciclo',
      componenteCurricular: 'LÍNGUA PORTUGUESA',
    },
  })
  assessmentId = avaliacao.id

  const importacao = await prisma.import.create({
    data: {
      assessmentId,
      schoolId: escolaId,
      fileName: 'sintetico.csv',
      fileHash: SUFIXO.padEnd(64, '0').slice(0, 64),
      fileSize: 1,
      // `import_expurgo_coerente`: enquanto não houve expurgo, o caminho existe.
      storagePath: `./storage/imports-test/${SUFIXO}.csv`,
      fileRetainedUntil: new Date(Date.now() + 86_400_000),
      status: 'COMPLETED',
      userId,
    },
  })
  importId = importacao.id

  const turmaA = await prisma.class.create({
    data: {
      schoolId: escolaId,
      externalCode: `T-A-${SUFIXO}`,
      name: 'Turma A',
      anoEscolar: '2º ano',
    },
  })
  turmaAId = turmaA.id

  const turmaB = await prisma.class.create({
    data: {
      schoolId: escolaId,
      externalCode: `T-B-${SUFIXO}`,
      name: 'Turma B',
      anoEscolar: '2º ano',
    },
  })
  turmaBId = turmaB.id

  // Habilidades próprias do teste: não dependem do catálogo semeado nem o contaminam.
  const criadas = []
  for (let i = 0; i < 3; i++) {
    const codigo = `H0${i + 1}`
    criadas.push(
      await prisma.skill.create({
        data: {
          shortCode: `${codigo}-${SUFIXO}`,
          referenceCode: `REF${codigo}`,
          descricao: `Habilidade sintética ${codigo}`,
          ordem: i + 1,
        },
      }),
    )
  }
  const [s1, s2, s3] = criadas
  if (!s1 || !s2 || !s3) throw new Error('Falha ao criar as habilidades do cenário.')
  skillIds = [s1.id, s2.id, s3.id]

  for (let i = 0; i < 3; i++) {
    await prisma.assessmentSkill.create({
      data: {
        assessmentId,
        skillId: skillIds[i] as string,
        referenceItems: ITENS_POR_HABILIDADE[i] as number,
      },
    })
  }

  const turmaDe = (t: 'A' | 'B') => (t === 'A' ? turmaAId : turmaBId)

  for (const [indice, aluno] of AVALIADOS.entries()) {
    const estudante = await prisma.student.create({
      data: {
        uniqueCode: `AV-${indice}-${SUFIXO}`,
        schoolId: escolaId,
        classId: turmaDe(aluno.turma),
        nomeOriginal: aluno.nome,
        nomeNormalizado: aluno.nome.toLowerCase(),
      },
    })

    // Habilidade ausente não entra nem no numerador nem no denominador (Const. I).
    const acertosTotais = aluno.acertos.reduce<number>((s, a) => s + (a ?? 0), 0)
    const itensTotais = aluno.acertos.reduce<number>(
      (s, a, i) => s + (a === null ? 0 : (ITENS_POR_HABILIDADE[i] as number)),
      0,
    )

    await prisma.assessmentStudentResult.create({
      data: {
        assessmentId,
        schoolId: escolaId,
        classId: turmaDe(aluno.turma),
        studentId: estudante.id,
        importId,
        avaliado: true,
        nivelOriginal: aluno.nivel,
        nivelNormalizado: aluno.nivel,
        acertosTotais,
        itensTotais,
        percentualGeral: percentualDe(acertosTotais, itensTotais),
        skillResults: {
          create: aluno.acertos.map((acertos, i) => {
            const itens = ITENS_POR_HABILIDADE[i] as number
            if (acertos === null) {
              return {
                skillId: skillIds[i] as string,
                valorOriginal: null,
                acertos: null,
                itensPossiveis: null,
                percentual: null,
              }
            }
            return {
              skillId: skillIds[i] as string,
              valorOriginal: `${acertos} / ${itens}`,
              acertos,
              itensPossiveis: itens,
              // `ssr_percentual_derivado`: o percentual existe sempre que a fração existe.
              percentual: percentualDe(acertos, itens),
            }
          }),
        },
      },
    })
  }

  for (const [indice, aluno] of NAO_AVALIADOS.entries()) {
    const estudante = await prisma.student.create({
      data: {
        uniqueCode: `NA-${indice}-${SUFIXO}`,
        schoolId: escolaId,
        classId: turmaDe(aluno.turma),
        nomeOriginal: aluno.nome,
        nomeNormalizado: aluno.nome.toLowerCase(),
      },
    })

    await prisma.assessmentStudentResult.create({
      data: {
        assessmentId,
        schoolId: escolaId,
        classId: turmaDe(aluno.turma),
        studentId: estudante.id,
        importId,
        avaliado: false,
        nivelOriginal: '',
        nivelNormalizado: null,
        acertosTotais: null,
        itensTotais: null,
        // Ausência é NULL em toda a extensão, inclusive por habilidade.
        skillResults: {
          create: skillIds.map((skillId) => ({
            skillId,
            valorOriginal: null,
            acertos: null,
            itensPossiveis: null,
          })),
        },
      },
    })
  }
}, 120_000)

afterAll(async () => {
  await prisma.assessmentStudentResult.deleteMany({ where: { assessmentId } })
  await prisma.assessmentSkill.deleteMany({ where: { assessmentId } })
  await prisma.import.deleteMany({ where: { assessmentId } })
  await prisma.student.deleteMany({ where: { schoolId: escolaId } })
  await prisma.class.deleteMany({ where: { schoolId: escolaId } })
  await prisma.assessment.deleteMany({ where: { id: assessmentId } })
  await prisma.school.deleteMany({ where: { id: { in: [escolaId, outraEscolaId] } } })
  await prisma.skill.deleteMany({ where: { shortCode: { endsWith: SUFIXO } } })
  if (criamosConfiguracao && configuracaoId) {
    await prisma.analyticalSettings.deleteMany({ where: { id: configuracaoId } })
  }
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
}, 120_000)

describe('painel geral da avaliação', () => {
  it('a participação inclui os não avaliados; o desempenho os exclui', async () => {
    const painel = await obterPainelAvaliacao(ctxAdmin(), { assessmentId })

    expect(painel.participacao.total).toBe(10)
    expect(painel.participacao.avaliados).toBe(7)
    expect(painel.participacao.naoAvaliados).toBe(3)
    expect(painel.participacao.taxa.numerador).toBe(7)
    expect(painel.participacao.taxa.denominador).toBe(10)
    expect(painel.participacao.taxa.percentualFormatado).toBe('70,00%')

    // O desempenho enxerga apenas os 7 avaliados: 34 itens, nunca os 50 que sairiam se os
    // 10 importados entrassem com denominador cheio.
    expect(painel.desempenhoGeral.denominador).toBe(34)
    expect(painel.desempenhoGeral.denominador).not.toBe(50)
  })

  it('o desempenho geral é Σ acertos ÷ Σ itens — 23 / 34', async () => {
    const painel = await obterPainelAvaliacao(ctxAdmin(), { assessmentId })

    expect(painel.desempenhoGeral.numerador).toBe(23)
    expect(painel.desempenhoGeral.denominador).toBe(34)
    expect(painel.desempenhoGeral.percentual?.toFixed(10)).toBe('67.6470588235')
    expect(painel.desempenhoGeral.percentualFormatado).toBe('67,65%')

    // A média simples dos percentuais individuais dá 66,43% — número diferente, e o
    // indicador que a constituição proíbe como principal.
    const mediaSimples =
      AVALIADOS.reduce((soma, aluno) => {
        const acertos = aluno.acertos.reduce<number>((s, a) => s + (a ?? 0), 0)
        const itens = aluno.acertos.reduce<number>(
          (s, a, i) => s + (a === null ? 0 : (ITENS_POR_HABILIDADE[i] as number)),
          0,
        )
        return soma + (acertos / itens) * 100
      }, 0) / AVALIADOS.length

    expect(mediaSimples).toBeCloseTo(66.4285714, 5)
    expect(Number(painel.desempenhoGeral.percentual?.toFixed(6))).not.toBeCloseTo(
      mediaSimples,
      3,
    )
  })

  it('a distribuição por nível tem denominador igual aos avaliados, não aos importados', async () => {
    const painel = await obterPainelAvaliacao(ctxAdmin(), { assessmentId })
    const { distribuicao } = painel

    expect(distribuicao.totalAvaliados).toBe(7)

    const soma = distribuicao.linhas.reduce((s, l) => s + l.quantidade, 0)
    expect(soma).toBe(7)

    for (const linha of distribuicao.linhas) {
      expect(linha.proporcao.denominador).toBe(7)
      expect(linha.proporcao.denominador).not.toBe(10)
    }

    const adequado = distribuicao.linhas.find((l) => l.chave === 'ADEQUADO')
    expect(adequado?.quantidade).toBe(3)
    // 3/7 = 42,86% — se o denominador fosse 10, sairia 30,00%.
    expect(adequado?.proporcao.percentualFormatado).toBe('42,86%')
  })

  it('nenhum estudante não avaliado aparece como Defasagem', async () => {
    const painel = await obterPainelAvaliacao(ctxAdmin(), { assessmentId })

    const defasagem = painel.distribuicao.linhas.find((l) => l.chave === 'DEFASAGEM')
    // São 2 na fonte. Os 3 não avaliados não entram: não têm nível, e ausência de nível
    // não é Defasagem.
    expect(defasagem?.quantidade).toBe(2)
    expect(defasagem?.proporcao.percentualFormatado).toBe('28,57%')

    const semNivel = painel.distribuicao.linhas.find((l) => l.chave === 'SEM_NIVEL')
    expect(semNivel?.quantidade).toBe(0)

    const registros = await prisma.assessmentStudentResult.count({
      where: { assessmentId, avaliado: false, nivelNormalizado: { not: null } },
    })
    expect(registros).toBe(0)
  })

  it('"Abaixo do adequado" soma Defasagem + Intermediário sobre os avaliados', async () => {
    const painel = await obterPainelAvaliacao(ctxAdmin(), { assessmentId })
    const { abaixoDoAdequado } = painel.distribuicao

    expect(abaixoDoAdequado.quantidade).toBe(4)
    expect(abaixoDoAdequado.proporcao.denominador).toBe(7)
    expect(abaixoDoAdequado.proporcao.percentualFormatado).toBe('57,14%')
    expect(abaixoDoAdequado.componentes).toEqual(['Defasagem', 'Intermediário'])
  })

  it('o ranking ordena do menor percentual para o maior', async () => {
    const painel = await obterPainelAvaliacao(ctxAdmin(), {
      assessmentId,
      criterio: 'LOWEST_PERCENT',
    })

    expect(painel.habilidades).toHaveLength(3)
    expect(painel.habilidades.map((h) => h.posicao)).toEqual([1, 2, 3])

    const percentuais = painel.habilidades.map((h) => h.percentualFormatado)
    expect(percentuais).toEqual(['35,71%', '85,71%', '100,00%'])

    expect(painel.habilidades[0]?.acertos).toBe(5)
    expect(painel.habilidades[0]?.itens).toBe(14)
    // A terceira habilidade tem 6 itens, e não 7: a ausência de E3 não vira zero nem
    // engorda o denominador.
    expect(painel.habilidades[2]?.acertos).toBe(6)
    expect(painel.habilidades[2]?.itens).toBe(6)
    expect(painel.habilidades[2]?.estudantesComResultado).toBe(6)

    expect(painel.habilidadeMaisFragil?.shortCode).toBe(painel.habilidades[0]?.shortCode)
    expect(painel.habilidadeMelhorDesempenho?.shortCode).toBe(
      painel.habilidades[2]?.shortCode,
    )
    expect(painel.criterio).toBe('LOWEST_PERCENT')
    expect(painel.criterioRotulo).toBe('Menor percentual de acerto')
  })

  it('aceita os quatro critérios de ordenação e informa o ativo', async () => {
    const criterios = [
      'LOWEST_PERCENT',
      'FRAGILITY_RATE',
      'FRAGILITY_COUNT',
      'POINTS_LOST',
    ] as const

    for (const criterio of criterios) {
      const painel = await obterPainelAvaliacao(ctxAdmin(), { assessmentId, criterio })
      expect(painel.criterio).toBe(criterio)
      expect(painel.criterioRotulo).not.toBe('')
      expect(painel.habilidades).toHaveLength(3)
      expect(painel.habilidades.map((h) => h.posicao)).toEqual([1, 2, 3])
    }
  })

  it('ordena as turmas por menor desempenho e por maior Defasagem', async () => {
    const painel = await obterPainelAvaliacao(ctxAdmin(), { assessmentId })

    expect(painel.turmasPorMenorDesempenho).toHaveLength(2)

    const primeira = painel.turmasPorMenorDesempenho[0]
    expect(primeira?.nome).toBe('Turma A')
    expect(primeira?.total).toBe(6)
    expect(primeira?.avaliados).toBe(4)
    expect(primeira?.naoAvaliados).toBe(2)
    expect(primeira?.desempenho.numerador).toBe(12)
    expect(primeira?.desempenho.denominador).toBe(19)
    expect(primeira?.desempenho.percentualFormatado).toBe('63,16%')

    const segunda = painel.turmasPorMenorDesempenho[1]
    expect(segunda?.nome).toBe('Turma B')
    expect(segunda?.desempenho.percentualFormatado).toBe('73,33%')

    const maiorDefasagem = painel.turmasPorMaiorDefasagem[0]
    expect(maiorDefasagem?.nome).toBe('Turma A')
    expect(maiorDefasagem?.defasagem).toBe(2)
    // Denominador da Defasagem é o de avaliados da turma: 4, não os 6 importados.
    expect(maiorDefasagem?.proporcaoDefasagem.denominador).toBe(4)
    expect(maiorDefasagem?.proporcaoDefasagem.percentualFormatado).toBe('50,00%')
  })
})

describe('escopo por escola', () => {
  it('usuário de outra escola não obtém dados desta avaliação', async () => {
    const painel = await obterPainelAvaliacao(ctxOutraEscola(), { assessmentId })

    expect(painel.participacao.total).toBe(0)
    expect(painel.participacao.avaliados).toBe(0)
    expect(painel.distribuicao.totalAvaliados).toBe(0)
    // Sem denominador não existe percentual: travessão, jamais 0%.
    expect(painel.desempenhoGeral.percentual).toBeNull()
    expect(painel.desempenhoGeral.percentualFormatado).toBe('—')
    expect(painel.turmasPorMenorDesempenho).toHaveLength(0)
    expect(painel.habilidades.every((h) => h.percentual === null)).toBe(true)
  })

  it('escola fora do escopo responde 404, nunca 403', async () => {
    await expect(
      obterPainelAvaliacao(ctxOutraEscola(), { assessmentId, schoolId: escolaId }),
    ).rejects.toMatchObject({ status: 404 })

    await expect(
      obterPainelEscola(ctxOutraEscola(), { schoolId: escolaId }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('painel da escola', () => {
  it('traz cadastro, participação e desempenho da escola', async () => {
    const resultado = await obterPainelEscola(ctxAdmin(), { schoolId: escolaId })

    expect(resultado.escola.name).toBe('Escola do Painel')
    expect(resultado.escola.totalTurmas).toBe(2)
    expect(resultado.escola.totalEstudantes).toBe(10)

    expect(resultado.avaliacoes.map((a) => a.id)).toContain(assessmentId)
    expect(resultado.avaliacaoSelecionada?.id).toBe(assessmentId)

    const painel = resultado.painel
    expect(painel).not.toBeNull()
    expect(painel?.participacao.total).toBe(10)
    expect(painel?.participacao.avaliados).toBe(7)
    expect(painel?.desempenhoGeral.numerador).toBe(23)
    expect(painel?.desempenhoGeral.denominador).toBe(34)
    expect(painel?.distribuicao.totalAvaliados).toBe(7)
    expect(painel?.habilidades).toHaveLength(3)
    expect(painel?.turmasPorMenorDesempenho).toHaveLength(2)
  })

  it('escola sem resultado importado não exibe painel — e não exibe zeros', async () => {
    const resultado = await obterPainelEscola(ctxAdmin(), { schoolId: outraEscolaId })

    expect(resultado.avaliacoes).toHaveLength(0)
    expect(resultado.avaliacaoSelecionada).toBeNull()
    expect(resultado.painel).toBeNull()
  })
})
