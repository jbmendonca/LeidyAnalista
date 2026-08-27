import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/server/prisma'
import type { AuthContext } from '@/server/authorization'
import { NOME_SUPRIMIDO } from '@/server/nominal-data'
import { formatPercent, toPercent } from '@/lib/decimal'
import { AUSENTE } from '@/lib/format'
import {
  contarParticipacao,
  desempenhoGeral,
  desempenhoPorHabilidade,
} from '@/modules/analytics/infra/aggregate-queries'
import type { RelatorioMontado } from '@/modules/reports/domain/report-header'
import {
  montarRelatorio,
  registrarExportacaoDeRelatorio,
} from '@/modules/reports/application/report-scope'
import { BOM_UTF8, gerarCsvDoRelatorio } from '@/modules/reports/infra/csv-writer'
import { gerarXlsxDoRelatorio } from '@/modules/reports/infra/xlsx-writer'

/**
 * Relatórios e exportações contra o banco real.
 *
 * O que estes testes protegem, na ordem da constituição:
 *
 *  1. os números do relatório são **os mesmos** das agregações que alimentam a tela;
 *  2. quem não tem a permissão nominal recebe o relatório **inteiro**, sem nomes — e a
 *     estrutura devolvida pelo servidor não contém nome algum, não é a interface que
 *     esconde;
 *  3. o escopo por escola é resolvido na camada de dados: a Escola A não alcança a B;
 *  4. o não avaliado aparece na participação e em nenhum denominador de desempenho;
 *  5. o CSV abre corretamente no Excel pt-BR — BOM e `;`;
 *  6. toda exportação deixa rastro em `AuditLog`, sem PII.
 */

const PREFIXO = 'TEST-REP'

/** Nomes reais das crianças sintéticas. Nenhum deles pode aparecer na versão agregada. */
const NOMES = {
  e1: 'Ariadne Quixote Zumbi',
  e2: 'Belisario Quixote Zumbi',
  e3: 'Casimiro Quixote Zumbi',
  e4: 'Doralice Quixote Zumbi',
} as const

type Ambiente = {
  escolaA: string
  escolaB: string
  turmaA: string
  turmaB: string
  avaliacao: string
  importacao: string
  h01: string
  h02: string
  h03: string
  estudanteE1: string
  estudanteE2: string
  estudanteE3: string
  usuarioAnalista: string
  usuarioSemNomes: string
  usuarioEscolaA: string
}

let amb: Ambiente
let ctxAnalista: AuthContext
let ctxSemNomes: AuthContext
let ctxEscolaA: AuthContext

const EMAIL_PREFIXO = `${PREFIXO.toLowerCase()}-`

/**
 * Remove tudo o que esta suíte cria, na ordem das dependências.
 *
 * Roda **antes e depois**: uma execução interrompida no meio deixa escolas com o código
 * já tomado, e a corrida seguinte falharia na criação em vez de no que se quer testar.
 * O recorte é sempre pelo prefixo do teste — nada fora dele é tocado, e a configuração
 * analítica semeada permanece intacta porque não foi criada por um usuário do teste.
 */
async function limparResiduos(): Promise<void> {
  const escolas = await prisma.school.findMany({
    where: { code: { startsWith: PREFIXO } },
    select: { id: true },
  })
  const usuarios = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIXO } },
    select: { id: true },
  })

  const idsEscola = escolas.map((e) => e.id)
  const idsUsuario = usuarios.map((u) => u.id)

  if (idsEscola.length > 0) {
    // `StudentSkillResult` cai por cascata a partir do resultado.
    await prisma.assessmentStudentResult.deleteMany({
      where: { schoolId: { in: idsEscola } },
    })
    await prisma.import.deleteMany({ where: { schoolId: { in: idsEscola } } })
    await prisma.student.deleteMany({ where: { schoolId: { in: idsEscola } } })
    await prisma.class.deleteMany({ where: { schoolId: { in: idsEscola } } })
  }

  if (idsUsuario.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: idsUsuario } } })
    await prisma.analyticalSettings.deleteMany({
      where: { createdByUserId: { in: idsUsuario } },
    })
  }

  // `AssessmentSkill` cai por cascata a partir da avaliação.
  await prisma.assessment.deleteMany({ where: { nome: { startsWith: PREFIXO } } })

  if (idsEscola.length > 0) {
    await prisma.school.deleteMany({ where: { id: { in: idsEscola } } })
  }
  if (idsUsuario.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: idsUsuario } } })
  }
}

function contexto(
  userId: string,
  escolas: string[],
  opcoes?: { nominal?: boolean; role?: AuthContext['role'] },
): AuthContext {
  return {
    userId,
    role: opcoes?.role ?? 'ANALISTA',
    allowedSchoolIds: escolas,
    canAccessNominalData: opcoes?.nominal ?? true,
  }
}

/** Percentual derivado com `Decimal`, no formato que a coluna `Decimal(7,4)` aceita. */
function decimalDoPercentual(acertos: number, itens: number): string {
  const valor = toPercent({ acertos, itens })
  if (valor === null) throw new Error('Denominador não positivo na fixture.')
  return valor.toDecimalPlaces(4).toFixed(4)
}

/** Todas as células de todas as seções, para busca textual. */
function textos(relatorio: RelatorioMontado): string[] {
  return relatorio.secoes.flatMap((s) => s.linhas.flatMap((l) => l.map((c) => c.texto)))
}

function secaoPorId(relatorio: RelatorioMontado, id: string) {
  const secao = relatorio.secoes.find((s) => s.id === id)
  if (!secao) throw new Error(`Seção "${id}" ausente no relatório ${relatorio.tipo}.`)
  return secao
}

/** Valor da coluna "Valor" numa seção de resumo, pelo rótulo do indicador. */
function valorDoResumo(relatorio: RelatorioMontado, id: string, rotulo: string): string {
  const linha = secaoPorId(relatorio, id).linhas.find((l) => l[0]?.texto === rotulo)
  if (!linha) throw new Error(`Indicador "${rotulo}" ausente na seção "${id}".`)
  return linha[1]?.texto ?? ''
}

beforeAll(async () => {
  await limparResiduos()

  const escolaA = await prisma.school.create({
    data: {
      code: `${PREFIXO}-A`,
      name: 'Escola de Relatórios A',
      rede: 'MUNICIPAL',
      municipio: 'TESTE',
      estado: 'RR',
    },
  })
  const escolaB = await prisma.school.create({
    data: {
      code: `${PREFIXO}-B`,
      name: 'Escola de Relatórios B',
      rede: 'MUNICIPAL',
      municipio: 'TESTE',
      estado: 'RR',
    },
  })

  const turmaA = await prisma.class.create({
    data: {
      schoolId: escolaA.id,
      externalCode: `${PREFIXO}-T-A`,
      name: '4º ANO A',
      anoEscolar: 'ENSINO FUNDAMENTAL DE 9 ANOS - 4º ANO',
    },
  })
  const turmaB = await prisma.class.create({
    data: {
      schoolId: escolaB.id,
      externalCode: `${PREFIXO}-T-B`,
      name: '4º ANO B',
      anoEscolar: 'ENSINO FUNDAMENTAL DE 9 ANOS - 4º ANO',
    },
  })

  async function usuario(sufixo: string, nominal: boolean) {
    return prisma.user.create({
      data: {
        email: `${PREFIXO.toLowerCase()}-${sufixo}@teste.local`,
        passwordHash: 'x',
        name: `Usuário ${sufixo}`,
        role: 'ANALISTA',
        canAccessNominalData: nominal,
      },
    })
  }

  const uAnalista = await usuario('analista', true)
  const uSemNomes = await usuario('sem-nomes', false)
  const uEscolaA = await usuario('escola-a', true)

  const avaliacao = await prisma.assessment.create({
    data: {
      nome: `${PREFIXO} Leitura II Ciclo`,
      ano: 2026,
      ciclo: 'II CICLO',
      componenteCurricular: 'LEITURA',
      dataAplicacao: new Date('2026-05-10T00:00:00Z'),
    },
  })

  const importacao = await prisma.import.create({
    data: {
      assessmentId: avaliacao.id,
      schoolId: escolaA.id,
      fileName: `${PREFIXO}.csv`,
      fileHash: `${PREFIXO}-hash`,
      fileSize: 1,
      // O caminho só é nulo depois do expurgo — invariante do próprio banco (FR-038b).
      storagePath: `${PREFIXO}/arquivo.csv`,
      fileRetainedUntil: new Date('2027-01-01T00:00:00Z'),
      status: 'COMPLETED',
      userId: uAnalista.id,
    },
  })

  // Habilidades do catálogo semeado. O denominador de referência é apurado sobre os dados
  // e gravado em `AssessmentSkill` — nunca fixado no código (FR-015, FR-016).
  const catalogo = await prisma.skill.findMany({
    orderBy: { ordem: 'asc' },
    take: 3,
    select: { id: true },
  })
  const [s1, s2, s3] = catalogo
  if (!s1 || !s2 || !s3) {
    throw new Error(
      'Catálogo de habilidades vazio: rode `npm run db:seed` antes dos testes.',
    )
  }

  // Fixado fora do fechamento abaixo: a narrowing de `s1`/`s2`/`s3` não sobrevive à
  // fronteira da função interna.
  const idsHabilidade: readonly [string, string, string] = [s1.id, s2.id, s3.id]

  await prisma.assessmentSkill.createMany({
    data: [
      { assessmentId: avaliacao.id, skillId: idsHabilidade[0], referenceItems: 2 },
      { assessmentId: avaliacao.id, skillId: idsHabilidade[1], referenceItems: 3 },
      { assessmentId: avaliacao.id, skillId: idsHabilidade[2], referenceItems: 2 },
    ],
  })

  async function criarResultado(entrada: {
    nome: string
    schoolId: string
    classId: string
    codigo: string
    avaliado: boolean
    nivelOriginal: string
    nivelNormalizado: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | null
    habilidades: readonly [number, number][] | null
  }): Promise<string> {
    const estudante = await prisma.student.create({
      data: {
        uniqueCode: entrada.codigo,
        schoolId: entrada.schoolId,
        classId: entrada.classId,
        nomeOriginal: entrada.nome,
        nomeNormalizado: entrada.nome.toUpperCase(),
      },
    })

    const totais = entrada.habilidades
      ? entrada.habilidades.reduce(
          (soma, [acertos, itens]) => ({
            acertos: soma.acertos + acertos,
            itens: soma.itens + itens,
          }),
          { acertos: 0, itens: 0 },
        )
      : null

    await prisma.assessmentStudentResult.create({
      data: {
        assessmentId: avaliacao.id,
        schoolId: entrada.schoolId,
        classId: entrada.classId,
        studentId: estudante.id,
        importId: importacao.id,
        avaliado: entrada.avaliado,
        nivelOriginal: entrada.nivelOriginal,
        nivelNormalizado: entrada.nivelNormalizado,
        // Ausência é NULL do começo ao fim — nunca 0 (Const. I).
        acertosTotais: totais?.acertos ?? null,
        itensTotais: totais?.itens ?? null,
        percentualGeral: totais
          ? decimalDoPercentual(totais.acertos, totais.itens)
          : null,
        ...(entrada.habilidades
          ? {
              skillResults: {
                create: entrada.habilidades.map(([acertos, itens], indice) => ({
                  skillId: idsHabilidade[indice] ?? idsHabilidade[0],
                  valorOriginal: `${acertos} / ${itens}`,
                  acertos,
                  itensPossiveis: itens,
                  // O banco exige o percentual junto da fração que o origina.
                  percentual: decimalDoPercentual(acertos, itens),
                })),
              },
            }
          : {}),
      },
    })

    return estudante.id
  }

  const e1 = await criarResultado({
    nome: NOMES.e1,
    schoolId: escolaA.id,
    classId: turmaA.id,
    codigo: `${PREFIXO}-C1`,
    avaliado: true,
    nivelOriginal: 'Adequado',
    nivelNormalizado: 'ADEQUADO',
    habilidades: [
      [2, 2],
      [3, 3],
      [2, 2],
    ],
  })

  const e2 = await criarResultado({
    nome: NOMES.e2,
    schoolId: escolaA.id,
    classId: turmaA.id,
    codigo: `${PREFIXO}-C2`,
    avaliado: true,
    nivelOriginal: 'Defasagem',
    nivelNormalizado: 'DEFASAGEM',
    habilidades: [
      [0, 2],
      [1, 3],
      [1, 2],
    ],
  })

  // Não avaliado: sem nível, sem acertos, sem itens. Se algum denominador de desempenho
  // o incluísse, os números abaixo mudariam — e é isso que os testes verificam.
  const e3 = await criarResultado({
    nome: NOMES.e3,
    schoolId: escolaA.id,
    classId: turmaA.id,
    codigo: `${PREFIXO}-C3`,
    avaliado: false,
    nivelOriginal: '',
    nivelNormalizado: null,
    habilidades: null,
  })

  await criarResultado({
    nome: NOMES.e4,
    schoolId: escolaB.id,
    classId: turmaB.id,
    codigo: `${PREFIXO}-C4`,
    avaliado: true,
    nivelOriginal: 'Adequado',
    nivelNormalizado: 'ADEQUADO',
    habilidades: [
      [2, 2],
      [2, 3],
      [2, 2],
    ],
  })

  // As faixas analíticas não têm padrão em código (FR-111). Se o banco de teste ainda não
  // foi semeado, a suíte cria uma versão própria e a remove no fim.
  const existente = await prisma.analyticalSettings.findFirst()
  if (!existente) {
    await prisma.analyticalSettings.create({
      data: {
        version: 1,
        fragilidadeMax: '60.00',
        atencaoMax: '80.00',
        baixoRendimento: ['DEFASAGEM', 'INTERMEDIARIO'],
        createdByUserId: uAnalista.id,
      },
    })
  }

  amb = {
    escolaA: escolaA.id,
    escolaB: escolaB.id,
    turmaA: turmaA.id,
    turmaB: turmaB.id,
    avaliacao: avaliacao.id,
    importacao: importacao.id,
    h01: s1.id,
    h02: s2.id,
    h03: s3.id,
    estudanteE1: e1,
    estudanteE2: e2,
    estudanteE3: e3,
    usuarioAnalista: uAnalista.id,
    usuarioSemNomes: uSemNomes.id,
    usuarioEscolaA: uEscolaA.id,
  }

  ctxAnalista = contexto(uAnalista.id, [escolaA.id, escolaB.id])
  ctxSemNomes = contexto(uSemNomes.id, [escolaA.id, escolaB.id], { nominal: false })
  ctxEscolaA = contexto(uEscolaA.id, [escolaA.id], { role: 'ESCOLA' })
}, 60_000)

afterAll(async () => {
  await limparResiduos()
})

// ---------------------------------------------------------------------------
// FR-107 — os valores do relatório coincidem com os da consulta agregada
// ---------------------------------------------------------------------------

describe('coincidência com as agregações da tela (FR-107)', () => {
  it('usa o mesmo Σ acertos ÷ Σ itens do desempenho geral', async () => {
    const filtros = { assessmentId: amb.avaliacao, schoolId: amb.escolaA }

    const agregado = await desempenhoGeral(ctxAnalista, filtros)
    // Escola A: 7/7 do primeiro + 2/7 do segundo. O não avaliado não entra em nenhum lado.
    expect(agregado).toEqual({ acertos: 9, itens: 14 })

    const { relatorio } = await montarRelatorio(ctxAnalista, 'geral', filtros)

    expect(valorDoResumo(relatorio, 'desempenho', 'Soma dos acertos')).toBe('9')
    expect(valorDoResumo(relatorio, 'desempenho', 'Soma dos itens possíveis')).toBe('14')
    expect(valorDoResumo(relatorio, 'desempenho', 'Percentual geral de acerto')).toBe(
      formatPercent(toPercent(agregado)),
    )
  })

  it('reproduz a participação da consulta agregada, inclusive o não avaliado', async () => {
    const filtros = { assessmentId: amb.avaliacao, schoolId: amb.escolaA }

    const participacao = await contarParticipacao(ctxAnalista, filtros)
    expect(participacao).toEqual({ total: 3, avaliados: 2, naoAvaliados: 1 })

    const { relatorio } = await montarRelatorio(ctxAnalista, 'geral', filtros)

    expect(valorDoResumo(relatorio, 'participacao', 'Estudantes no recorte')).toBe('3')
    expect(valorDoResumo(relatorio, 'participacao', 'Avaliados')).toBe('2')
    expect(valorDoResumo(relatorio, 'participacao', 'Não avaliados')).toBe('1')
    expect(valorDoResumo(relatorio, 'participacao', 'Taxa de participação')).toBe(
      formatPercent(toPercent({ acertos: 2, itens: 3 })),
    )
  })

  it('reproduz o desempenho por habilidade no relatório da habilidade', async () => {
    const filtros = { assessmentId: amb.avaliacao, schoolId: amb.escolaA }

    const porHabilidade = await desempenhoPorHabilidade(ctxAnalista, filtros)
    const h02 = porHabilidade.get(amb.h02)
    // H02: 3/3 do primeiro avaliado + 1/3 do segundo.
    expect(h02).toMatchObject({ acertos: 4, itens: 6 })

    const { relatorio } = await montarRelatorio(ctxAnalista, 'habilidade', {
      ...filtros,
      skillId: amb.h02,
    })

    expect(valorDoResumo(relatorio, 'identificacao', 'Percentual de acerto')).toBe(
      formatPercent(toPercent({ acertos: 4, itens: 6 })),
    )
  })

  it('lê o total de itens de AssessmentSkill, nunca de constante', async () => {
    const { relatorio } = await montarRelatorio(ctxAnalista, 'habilidade', {
      assessmentId: amb.avaliacao,
      schoolId: amb.escolaA,
      skillId: amb.h02,
    })

    const gravado = await prisma.assessmentSkill.findUniqueOrThrow({
      where: {
        assessmentId_skillId: { assessmentId: amb.avaliacao, skillId: amb.h02 },
      },
      select: { referenceItems: true },
    })

    expect(gravado.referenceItems).toBe(3)
    expect(
      valorDoResumo(relatorio, 'identificacao', 'Itens de referência da avaliação'),
    ).toBe(String(gravado.referenceItems))
    expect(secaoPorId(relatorio, 'distribuicao').titulo).toContain('0/3 a 3/3')
  })
})

// ---------------------------------------------------------------------------
// FR-007a — versão agregada, nunca negação; supressão na consulta
// ---------------------------------------------------------------------------

describe('permissão de dados nominais (FR-007a, FR-105)', () => {
  it('entrega o relatório completo, com a mesma quantidade de linhas, sem nomes', async () => {
    const filtros = { assessmentId: amb.avaliacao, schoolId: amb.escolaA }

    const nominal = await montarRelatorio(ctxAnalista, 'escola', filtros)
    const agregado = await montarRelatorio(ctxSemNomes, 'escola', filtros)

    // Nada foi negado nem omitido: as mesmas seções, com as mesmas linhas.
    expect(agregado.relatorio.secoes.map((s) => s.id)).toEqual(
      nominal.relatorio.secoes.map((s) => s.id),
    )
    expect(agregado.relatorio.secoes.map((s) => s.linhas.length)).toEqual(
      nominal.relatorio.secoes.map((s) => s.linhas.length),
    )

    // E os números são idênticos.
    expect(valorDoResumo(agregado.relatorio, 'participacao', 'Avaliados')).toBe(
      valorDoResumo(nominal.relatorio, 'participacao', 'Avaliados'),
    )
    expect(
      valorDoResumo(agregado.relatorio, 'desempenho', 'Percentual geral de acerto'),
    ).toBe(valorDoResumo(nominal.relatorio, 'desempenho', 'Percentual geral de acerto'))
  })

  it('não devolve nome algum na estrutura de dados — não é a interface que esconde', async () => {
    const { relatorio } = await montarRelatorio(ctxSemNomes, 'escola', {
      assessmentId: amb.avaliacao,
      schoolId: amb.escolaA,
    })

    const serializado = JSON.stringify(relatorio)
    for (const nome of Object.values(NOMES)) {
      expect(serializado).not.toContain(nome)
    }

    // O código único permanece: identifica sem revelar (FR-131). C2 está em Defasagem e
    // C3 é o não avaliado — as duas listas nominativas do relatório da escola.
    expect(serializado).toContain(`${PREFIXO}-C2`)
    expect(serializado).toContain(`${PREFIXO}-C3`)
    expect(serializado).toContain(NOME_SUPRIMIDO)
    expect(relatorio.nominal).toBe(false)
    expect(relatorio.cabecalho.rotuloVersao).toContain('agregada')

    // A supressão vale também no arquivo que sai do servidor.
    const csv = gerarCsvDoRelatorio(relatorio)
    for (const nome of Object.values(NOMES)) {
      expect(csv).not.toContain(nome)
    }
  })

  it('suprime o nome também no relatório individual, preservando os números', async () => {
    const entrada = {
      assessmentId: amb.avaliacao,
      classId: amb.turmaA,
      studentId: amb.estudanteE2,
    }

    const nominal = await montarRelatorio(ctxAnalista, 'individual', entrada)
    const agregado = await montarRelatorio(ctxSemNomes, 'individual', entrada)

    expect(valorDoResumo(nominal.relatorio, 'identificacao', 'Estudante')).toBe(NOMES.e2)
    expect(valorDoResumo(agregado.relatorio, 'identificacao', 'Estudante')).toBe(
      NOME_SUPRIMIDO,
    )

    // Nível da fonte transcrito, e percentual idêntico nas duas versões.
    expect(
      valorDoResumo(
        agregado.relatorio,
        'desempenho',
        'Nível de aprendizagem (valor da fonte)',
      ),
    ).toBe('Defasagem')
    expect(
      valorDoResumo(agregado.relatorio, 'desempenho', 'Percentual geral de acerto'),
    ).toBe(valorDoResumo(nominal.relatorio, 'desempenho', 'Percentual geral de acerto'))
    expect(
      valorDoResumo(nominal.relatorio, 'desempenho', 'Percentual geral de acerto'),
    ).toBe(formatPercent(toPercent({ acertos: 2, itens: 7 })))
  })
})

// ---------------------------------------------------------------------------
// FR-006, FR-104 — escopo por escola na camada de dados
// ---------------------------------------------------------------------------

describe('escopo por escola (FR-006, FR-104)', () => {
  it('recusa com 404 o relatório de escola fora do escopo', async () => {
    await expect(
      montarRelatorio(ctxEscolaA, 'escola', {
        assessmentId: amb.avaliacao,
        schoolId: amb.escolaB,
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('recusa com 404 a turma de outra escola', async () => {
    await expect(
      montarRelatorio(ctxEscolaA, 'turma', {
        assessmentId: amb.avaliacao,
        classId: amb.turmaB,
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('restringe o relatório geral sem schoolId às escolas do escopo', async () => {
    const { relatorio } = await montarRelatorio(ctxEscolaA, 'geral', {
      assessmentId: amb.avaliacao,
    })

    // A Escola B tem um avaliado a mais; ele não pode aparecer em nenhum total.
    expect(valorDoResumo(relatorio, 'participacao', 'Estudantes no recorte')).toBe('3')
    expect(valorDoResumo(relatorio, 'desempenho', 'Soma dos itens possíveis')).toBe('14')

    const conteudo = JSON.stringify(relatorio)
    expect(conteudo).not.toContain(NOMES.e4)
    expect(conteudo).not.toContain(`${PREFIXO}-C4`)
    expect(conteudo).not.toContain('Escola de Relatórios B')
  })

  it('o mesmo recorte com escopo amplo enxerga as duas escolas', async () => {
    const { relatorio } = await montarRelatorio(ctxAnalista, 'geral', {
      assessmentId: amb.avaliacao,
    })

    expect(valorDoResumo(relatorio, 'participacao', 'Estudantes no recorte')).toBe('4')
    expect(valorDoResumo(relatorio, 'desempenho', 'Soma dos itens possíveis')).toBe('21')
  })
})

// ---------------------------------------------------------------------------
// Const. I e V — ausência nunca vira zero
// ---------------------------------------------------------------------------

describe('não avaliados (Const. I e V, FR-060)', () => {
  it('entram na participação e ficam fora do desempenho e da distribuição', async () => {
    const { relatorio } = await montarRelatorio(ctxAnalista, 'escola', {
      assessmentId: amb.avaliacao,
      schoolId: amb.escolaA,
    })

    expect(valorDoResumo(relatorio, 'participacao', 'Não avaliados')).toBe('1')

    // Denominador da distribuição: somente avaliados. Nenhuma linha o conta como Defasagem.
    const distribuicao = secaoPorId(relatorio, 'distribuicao')
    const defasagem = distribuicao.linhas.find((l) => l[0]?.texto === 'Defasagem')
    expect(defasagem?.[1]?.texto).toBe('1')
    expect(distribuicao.descricao).toContain('2 estudante(s) avaliado(s)')

    // Lista própria, e nunca entre os de prioridade pedagógica.
    const naoAvaliados = secaoPorId(relatorio, 'nao-avaliados')
    expect(naoAvaliados.linhas).toHaveLength(1)
    expect(naoAvaliados.linhas[0]?.[0]?.texto).toBe(`${PREFIXO}-C3`)

    const emDefasagem = secaoPorId(relatorio, 'defasagem')
    expect(emDefasagem.linhas.map((l) => l[0]?.texto)).not.toContain(`${PREFIXO}-C3`)
  })

  it('mostra travessão, e nunca zero, nas colunas de desempenho do não avaliado', async () => {
    const { relatorio } = await montarRelatorio(ctxAnalista, 'turma', {
      assessmentId: amb.avaliacao,
      classId: amb.turmaA,
    })

    const linha = secaoPorId(relatorio, 'estudantes').linhas.find(
      (l) => l[0]?.texto === `${PREFIXO}-C3`,
    )
    expect(linha).toBeDefined()
    expect(linha?.[2]?.texto).toBe('Não')
    // Acertos, itens e percentual: travessão nos três, e `numero` nulo em todos.
    expect(linha?.[4]).toEqual({ texto: AUSENTE, numero: null })
    expect(linha?.[5]).toEqual({ texto: AUSENTE, numero: null })
    expect(linha?.[6]).toEqual({ texto: AUSENTE, numero: null })

    // E o não avaliado vai para o fim da lista, nunca junto aos de Defasagem.
    const codigos = secaoPorId(relatorio, 'estudantes').linhas.map((l) => l[0]?.texto)
    expect(codigos[codigos.length - 1]).toBe(`${PREFIXO}-C3`)
    expect(codigos[0]).toBe(`${PREFIXO}-C2`)
  })
})

// ---------------------------------------------------------------------------
// FR-106, FR-166 — cabeçalho obrigatório
// ---------------------------------------------------------------------------

describe('cabeçalho do relatório (FR-106, FR-166)', () => {
  it('declara avaliação, escola, recorte, faixas vigentes, geração e solicitante', async () => {
    const { relatorio } = await montarRelatorio(ctxAnalista, 'turma', {
      assessmentId: amb.avaliacao,
      classId: amb.turmaA,
    })

    const linhas = new Map(relatorio.cabecalho.linhas.map((l) => [l.rotulo, l.valor]))
    const configuracao = await prisma.analyticalSettings.findFirstOrThrow({
      orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    })

    expect(linhas.get('Avaliação')).toContain(`${PREFIXO} Leitura II Ciclo`)
    expect(linhas.get('Escola')).toContain('Escola de Relatórios A')
    expect(linhas.get('Recorte de filtros')).toContain('4º ANO A')
    expect(linhas.get('Faixas analíticas vigentes')).toContain(
      `versão ${configuracao.version}`,
    )
    expect(linhas.get('Gerado em')).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    expect(linhas.get('Solicitante')).toContain(amb.usuarioAnalista)
    expect(linhas.get('Versão do relatório')).toBe(relatorio.cabecalho.rotuloVersao)
  })
})

// ---------------------------------------------------------------------------
// FR-103, FR-108 — formatos de exportação
// ---------------------------------------------------------------------------

describe('exportações (FR-103, FR-108)', () => {
  it('gera CSV com BOM UTF-8, separador ; e acentuação preservada', async () => {
    const { relatorio } = await montarRelatorio(ctxAnalista, 'turma', {
      assessmentId: amb.avaliacao,
      classId: amb.turmaA,
    })

    const csv = gerarCsvDoRelatorio(relatorio)

    expect(csv.startsWith(BOM_UTF8)).toBe(true)
    expect(Buffer.from(csv, 'utf8').subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    )
    expect(csv).toContain(';')
    expect(csv).not.toContain('\t')
    // Acentuação viva e vírgula decimal, como o Excel pt-BR espera.
    expect(csv).toContain('Não avaliados')
    expect(csv).toContain(formatPercent(toPercent({ acertos: 9, itens: 14 })))
    expect(csv).toMatch(/\d,\d{2}%/)
    // Cabeçalho no mesmo arquivo (FR-106).
    expect(csv).toContain('Faixas analíticas vigentes')
  })

  it('gera XLSX legível, com uma aba por seção mais o cabeçalho', async () => {
    const { relatorio } = await montarRelatorio(ctxAnalista, 'geral', {
      assessmentId: amb.avaliacao,
      schoolId: amb.escolaA,
    })

    const planilha = gerarXlsxDoRelatorio(relatorio)

    expect(planilha.byteLength).toBeGreaterThan(0)
    // Assinatura de arquivo ZIP — todo XLSX é um contêiner OPC.
    expect(planilha.subarray(0, 2)).toEqual(Buffer.from('PK'))
  })

  it('todos os cinco relatórios são gerados sem erro', async () => {
    const base = { assessmentId: amb.avaliacao }

    const combinacoes = [
      ['geral', base],
      ['escola', { ...base, schoolId: amb.escolaA }],
      ['turma', { ...base, classId: amb.turmaA }],
      ['habilidade', { ...base, schoolId: amb.escolaA, skillId: amb.h01 }],
      ['individual', { ...base, classId: amb.turmaA, studentId: amb.estudanteE1 }],
    ] as const

    for (const [tipo, entrada] of combinacoes) {
      const { relatorio } = await montarRelatorio(ctxAnalista, tipo, entrada)
      expect(relatorio.tipo).toBe(tipo)
      expect(relatorio.secoes.length).toBeGreaterThan(0)
      expect(relatorio.cabecalho.linhas.length).toBeGreaterThan(0)
      // Nenhuma célula sai vazia: ausência é travessão, jamais string vazia.
      expect(textos(relatorio).every((t) => t.length > 0)).toBe(true)
    }
  })

  it('recusa com 404 um tipo de relatório inexistente', async () => {
    await expect(
      montarRelatorio(ctxAnalista, 'inventado', { assessmentId: amb.avaliacao }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('recusa com 422 o relatório individual sem estudante', async () => {
    await expect(
      montarRelatorio(ctxAnalista, 'individual', { assessmentId: amb.avaliacao }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

// ---------------------------------------------------------------------------
// FR-121, Const. IV — auditoria sem PII
// ---------------------------------------------------------------------------

describe('auditoria da exportação (FR-121)', () => {
  it('registra REPORT_EXPORT em cada formato, sem nenhum dado pessoal', async () => {
    const entrada = { assessmentId: amb.avaliacao, classId: amb.turmaA }
    const { escopo, relatorio } = await montarRelatorio(ctxAnalista, 'turma', entrada)

    await registrarExportacaoDeRelatorio(escopo, 'CSV', relatorio)
    await registrarExportacaoDeRelatorio(escopo, 'XLSX', relatorio)
    await registrarExportacaoDeRelatorio(escopo, 'IMPRESSAO', relatorio)

    const registros = await prisma.auditLog.findMany({
      where: { action: 'REPORT_EXPORT', userId: amb.usuarioAnalista },
      orderBy: { occurredAt: 'asc' },
    })

    expect(registros.length).toBeGreaterThanOrEqual(3)
    const formatos = registros.map((r) =>
      typeof r.metadata === 'object' && r.metadata !== null && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)['formato']
        : null,
    )
    expect(formatos).toEqual(expect.arrayContaining(['CSV', 'XLSX', 'IMPRESSAO']))

    for (const registro of registros) {
      expect(registro.entityType).toBe('Report')
      expect(registro.assessmentId).toBe(amb.avaliacao)

      // Referência por identificador, e só por identificador (Const. IV, FR-009).
      const serializado = JSON.stringify(registro)
      for (const nome of Object.values(NOMES)) {
        expect(serializado).not.toContain(nome)
      }
      expect(serializado).not.toContain('@teste.local')
    }
  })

  it('registra a exportação do usuário sem permissão nominal como versão agregada', async () => {
    const { escopo, relatorio } = await montarRelatorio(ctxSemNomes, 'escola', {
      assessmentId: amb.avaliacao,
      schoolId: amb.escolaA,
    })
    await registrarExportacaoDeRelatorio(escopo, 'CSV', relatorio)

    const registro = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'REPORT_EXPORT', userId: amb.usuarioSemNomes },
      orderBy: { occurredAt: 'desc' },
    })

    const metadata = registro.metadata as Record<string, unknown>
    expect(metadata['nominal']).toBe(false)
    expect(metadata['tipo']).toBe('escola')
    expect(registro.schoolId).toBe(amb.escolaA)
  })
})
