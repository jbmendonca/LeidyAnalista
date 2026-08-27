import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/server/prisma'
import type { AuthContext } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import { NOME_SUPRIMIDO } from '@/server/nominal-data'
import { ehCodigoUnicoValido } from '@/modules/students/domain/unique-code'
import { criarEstudante } from '@/modules/students/application/create-student'
import { atualizarEstudante } from '@/modules/students/application/update-student'
import { listarEstudantes } from '@/modules/students/application/list-students'
import { buscarEstudantePorCodigo } from '@/modules/students/application/find-by-code'
import { importarNominata } from '@/modules/students/application/import-roster'
import { gerarCsvNominata } from '@/modules/students/application/export-roster'

/**
 * Cadastro de estudantes contra o banco real.
 *
 * O que estes testes protegem, na ordem em que a constituição os coloca: a permanência do
 * código único, o direito de dois homônimos existirem na mesma turma, a supressão nominal que
 * entrega o dado agregado em vez de negar o acesso, o escopo por escola resolvido na camada de
 * dados e a separação entre dado cadastral e resultado de avaliação.
 */

const PREFIXO = 'TEST-STU'

const CAMINHO_NOMINATA = fileURLToPath(
  new URL('../fixtures/nominata-referencia.csv', import.meta.url),
)
const NOMINATA = readFileSync(CAMINHO_NOMINATA)

/** Total de crianças do arquivo de referência — o mesmo da fixture de resultados. */
const CRIANCAS_NA_NOMINATA = 111

type Ambiente = {
  escolaA: string
  escolaB: string
  escolaNominata: string
  turmaA: string
  turmaB: string
  usuarioAnalista: string
  usuarioSemNomes: string
  usuarioEscolaA: string
  usuarioEscolaB: string
}

let amb: Ambiente

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

let ctxAnalista: AuthContext
let ctxSemNomes: AuthContext
let ctxEscolaA: AuthContext
let ctxEscolaB: AuthContext

beforeAll(async () => {
  const escolaA = await prisma.school.create({
    data: {
      code: `${PREFIXO}-A`,
      name: 'Escola de Teste A',
      rede: 'MUNICIPAL',
      municipio: 'TESTE',
      estado: 'RR',
    },
  })
  const escolaB = await prisma.school.create({
    data: {
      code: `${PREFIXO}-B`,
      name: 'Escola de Teste B',
      rede: 'MUNICIPAL',
      municipio: 'TESTE',
      estado: 'RR',
    },
  })
  // O nome precisa bater com a coluna Escola do arquivo de nominata: é por ele que cada linha
  // é resolvida. O código, esse sim, é próprio do teste.
  const escolaNominata = await prisma.school.create({
    data: {
      code: `${PREFIXO}-NOMINATA`,
      name: 'Escola Municipal de Demonstração',
      rede: 'MUNICIPAL',
      municipio: 'TESTE',
      estado: 'RR',
    },
  })

  const turmaA = await prisma.class.create({
    data: {
      schoolId: escolaA.id,
      externalCode: `${PREFIXO}-TURMA-A`,
      name: '4º ANO A',
      anoEscolar: 'ENSINO FUNDAMENTAL DE 9 ANOS - 4º ANO',
    },
  })
  const turmaB = await prisma.class.create({
    data: {
      schoolId: escolaB.id,
      externalCode: `${PREFIXO}-TURMA-B`,
      name: '4º ANO B',
      anoEscolar: 'ENSINO FUNDAMENTAL DE 9 ANOS - 4º ANO',
    },
  })

  async function usuario(sufixo: string, nominal: boolean) {
    return prisma.user.create({
      data: {
        email: `${PREFIXO.toLowerCase()}-${sufixo}@teste.local`,
        name: `Usuário ${sufixo}`,
        passwordHash: 'hash-de-teste',
        role: sufixo.startsWith('escola') ? 'ESCOLA' : 'ANALISTA',
        canAccessNominalData: nominal,
      },
    })
  }

  const analista = await usuario('analista', true)
  const semNomes = await usuario('sem-nomes', false)
  const daEscolaA = await usuario('escola-a', true)
  const daEscolaB = await usuario('escola-b', true)

  amb = {
    escolaA: escolaA.id,
    escolaB: escolaB.id,
    escolaNominata: escolaNominata.id,
    turmaA: turmaA.id,
    turmaB: turmaB.id,
    usuarioAnalista: analista.id,
    usuarioSemNomes: semNomes.id,
    usuarioEscolaA: daEscolaA.id,
    usuarioEscolaB: daEscolaB.id,
  }

  const todas = [escolaA.id, escolaB.id, escolaNominata.id]
  ctxAnalista = contexto(analista.id, todas)
  ctxSemNomes = contexto(semNomes.id, todas, { nominal: false })
  ctxEscolaA = contexto(daEscolaA.id, [escolaA.id], { role: 'ESCOLA' })
  ctxEscolaB = contexto(daEscolaB.id, [escolaB.id], { role: 'ESCOLA' })
})

afterAll(async () => {
  const escolas = [amb.escolaA, amb.escolaB, amb.escolaNominata]
  const usuarios = [
    amb.usuarioAnalista,
    amb.usuarioSemNomes,
    amb.usuarioEscolaA,
    amb.usuarioEscolaB,
  ]

  // `StudentSkillResult` cai por cascata a partir do resultado.
  await prisma.assessmentStudentResult.deleteMany({
    where: { schoolId: { in: escolas } },
  })
  await prisma.import.deleteMany({ where: { schoolId: { in: escolas } } })
  await prisma.student.deleteMany({ where: { schoolId: { in: escolas } } })
  await prisma.class.deleteMany({ where: { schoolId: { in: escolas } } })
  await prisma.auditLog.deleteMany({ where: { userId: { in: usuarios } } })
  await prisma.assessment.deleteMany({ where: { nome: { startsWith: PREFIXO } } })
  await prisma.userSchool.deleteMany({ where: { schoolId: { in: escolas } } })
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } })
  await prisma.school.deleteMany({ where: { id: { in: escolas } } })
  await prisma.$disconnect()
})

describe('atribuição do código único', () => {
  it('gera um código no formato canônico já na criação do cadastro', async () => {
    const estudante = await criarEstudante(ctxAnalista, {
      schoolId: amb.escolaA,
      classId: amb.turmaA,
      nomeOriginal: '  José   da Silva  ',
      codigoExterno: '',
    })

    expect(ehCodigoUnicoValido(estudante.uniqueCode)).toBe(true)
    // O nome original é preservado para exibição; só os espaços das extremidades saem.
    expect(estudante.nomeOriginal).toBe('José   da Silva')
    expect(estudante.codigoExterno).toBeNull()

    const gravado = await prisma.student.findUniqueOrThrow({
      where: { id: estudante.id },
      select: { nomeNormalizado: true, uniqueCode: true },
    })
    // A forma normalizada existe para busca e duplicidade — e nunca é exibida.
    expect(gravado.nomeNormalizado).toBe('JOSE DA SILVA')
    expect(gravado.uniqueCode).toBe(estudante.uniqueCode)
  })

  it('registra STUDENT_CREATE em auditoria, sem nome, para cada cadastro', async () => {
    const estudante = await criarEstudante(ctxAnalista, {
      schoolId: amb.escolaA,
      classId: amb.turmaA,
      nomeOriginal: 'Maria Auditada',
      codigoExterno: 'MAT-2026-77',
    })

    const registros = await prisma.auditLog.findMany({
      where: { entityType: 'Student', entityId: estudante.id },
    })

    expect(registros).toHaveLength(1)
    expect(registros[0]?.action).toBe('STUDENT_CREATE')
    expect(registros[0]?.userId).toBe(amb.usuarioAnalista)
    expect(registros[0]?.schoolId).toBe(amb.escolaA)
    expect(JSON.stringify(registros[0]?.afterValue)).toContain(estudante.uniqueCode)
    expect(JSON.stringify(registros[0])).not.toContain('Maria Auditada')
  })

  it('permite dois homônimos na mesma turma, cada um com seu código (FR-175)', async () => {
    const entrada = {
      schoolId: amb.escolaA,
      classId: amb.turmaA,
      nomeOriginal: 'Ana Beatriz Homônima',
      codigoExterno: '',
    }

    const primeira = await criarEstudante(ctxAnalista, entrada)
    const segunda = await criarEstudante(ctxAnalista, entrada)

    expect(primeira.id).not.toBe(segunda.id)
    expect(primeira.uniqueCode).not.toBe(segunda.uniqueCode)
    expect(primeira.classId).toBe(segunda.classId)

    const naTurma = await prisma.student.count({
      where: { classId: amb.turmaA, nomeNormalizado: 'ANA BEATRIZ HOMONIMA' },
    })
    expect(naTurma).toBe(2)
  })

  it('encontra o estudante pelo código único, tolerando caixa e espaços (FR-133)', async () => {
    const estudante = await criarEstudante(ctxAnalista, {
      schoolId: amb.escolaA,
      classId: amb.turmaA,
      nomeOriginal: 'Pedro Buscado',
      codigoExterno: '',
    })

    const digitado = ` ${estudante.uniqueCode.replace('-', '').toLowerCase()} `
    const encontrado = await buscarEstudantePorCodigo(ctxAnalista, digitado)

    expect(encontrado?.id).toBe(estudante.id)
    expect(await buscarEstudantePorCodigo(ctxAnalista, 'nao-e-um-codigo')).toBeNull()
  })
})

describe('importação da nominata', () => {
  it('cadastra as 111 crianças do arquivo de referência com códigos distintos', async () => {
    const relatorio = await importarNominata(ctxAnalista, {
      conteudo: NOMINATA,
      nomeArquivo: 'nominata-referencia.csv',
      schoolId: amb.escolaNominata,
    })

    expect(relatorio.problemas.filter((p) => p.severidade === 'ERROR')).toEqual([])
    expect(relatorio.aplicado).toBe(true)
    expect(relatorio.totalLinhas).toBe(CRIANCAS_NA_NOMINATA)
    expect(relatorio.criados).toBe(CRIANCAS_NA_NOMINATA)
    expect(relatorio.turmasCriadas).toBe(4)

    const criados = await prisma.student.findMany({
      where: { schoolId: amb.escolaNominata },
      select: { uniqueCode: true, nomeOriginal: true },
    })

    expect(criados).toHaveLength(CRIANCAS_NA_NOMINATA)
    expect(new Set(criados.map((c) => c.uniqueCode)).size).toBe(CRIANCAS_NA_NOMINATA)
    expect(criados.every((c) => ehCodigoUnicoValido(c.uniqueCode))).toBe(true)
    // Acentuação e caixa do arquivo chegam intactas ao nome exibido.
    expect(criados.some((c) => c.nomeOriginal.includes('ÃO'))).toBe(true)

    const auditados = await prisma.auditLog.count({
      where: { action: 'STUDENT_CREATE', schoolId: amb.escolaNominata },
    })
    expect(auditados).toBe(CRIANCAS_NA_NOMINATA)
  })

  it('reconhece quem já está cadastrado em vez de duplicar', async () => {
    const relatorio = await importarNominata(ctxAnalista, {
      conteudo: NOMINATA,
      nomeArquivo: 'nominata-referencia.csv',
      schoolId: amb.escolaNominata,
    })

    expect(relatorio.aplicado).toBe(true)
    expect(relatorio.criados).toBe(0)
    expect(relatorio.jaExistentes).toBe(CRIANCAS_NA_NOMINATA)
    expect(relatorio.turmasCriadas).toBe(0)

    const total = await prisma.student.count({ where: { schoolId: amb.escolaNominata } })
    expect(total).toBe(CRIANCAS_NA_NOMINATA)
  })

  it('não grava nada quando há linha com erro, e aponta o número da linha', async () => {
    const antes = await prisma.student.count({ where: { schoolId: amb.escolaA } })

    const cabecalho = 'Escola;Código da Turma;Turma;Ano Escolar;Estudante'
    const arquivo = [
      cabecalho,
      'Escola de Teste A; TESTE-NOVA ;5º ANO A;5º ANO;Criança Válida',
      'Escola de Teste A; TESTE-NOVA ;5º ANO A;5º ANO;',
    ].join('\r\n')

    const relatorio = await importarNominata(ctxAnalista, {
      conteudo: Buffer.from(`\uFEFF${arquivo}`, 'utf-8'),
      nomeArquivo: 'nominata-com-erro.csv',
      schoolId: amb.escolaA,
    })

    expect(relatorio.aplicado).toBe(false)
    expect(relatorio.criados).toBe(0)
    expect(relatorio.criaveis).toBe(1)
    expect(relatorio.problemas).toEqual([
      {
        linha: 3,
        coluna: 'Estudante',
        codigo: 'NOME_VAZIO',
        severidade: 'ERROR',
        mensagem: 'A linha não traz o nome do estudante.',
      },
    ])

    expect(await prisma.student.count({ where: { schoolId: amb.escolaA } })).toBe(antes)
    expect(
      await prisma.class.count({
        where: { schoolId: amb.escolaA, externalCode: 'TESTE-NOVA' },
      }),
    ).toBe(0)
  })
})

describe('supressão nominal e escopo de escola', () => {
  it('entrega a lista completa com o nome suprimido a quem não tem a permissão (FR-007a)', async () => {
    const comNomes = await listarEstudantes(ctxAnalista, { schoolId: amb.escolaA })
    const semNomes = await listarEstudantes(ctxSemNomes, { schoolId: amb.escolaA })

    expect(semNomes.total).toBe(comNomes.total)
    expect(semNomes.total).toBeGreaterThan(0)
    expect(semNomes.nominal).toBe(false)

    // Não é negação: todos os demais campos continuam vindo.
    for (const item of semNomes.itens) {
      expect(item.nomeOriginal).toBe(NOME_SUPRIMIDO)
      expect(ehCodigoUnicoValido(item.uniqueCode)).toBe(true)
      expect(item.turmaNome).not.toBe('')
      expect(item.escolaNome).not.toBe('')
    }

    // E o nome também não vaza pela busca.
    const porNome = await listarEstudantes(ctxSemNomes, {
      schoolId: amb.escolaA,
      busca: 'Pedro Buscado',
    })
    expect(porNome.buscaPorNomeIgnorada).toBe(true)
    expect(porNome.total).toBe(semNomes.total)
  })

  it('não mostra à Escola A nenhum estudante da Escola B', async () => {
    const daEscolaB = await criarEstudante(ctxEscolaB, {
      schoolId: amb.escolaB,
      classId: amb.turmaB,
      nomeOriginal: 'Criança da Escola B',
      codigoExterno: '',
    })

    const listaA = await listarEstudantes(ctxEscolaA, {})
    expect(listaA.itens.every((e) => e.schoolId === amb.escolaA)).toBe(true)
    expect(listaA.itens.some((e) => e.id === daEscolaB.id)).toBe(false)

    // Nem pelo código único, que é global: o filtro de escola está na consulta.
    expect(await buscarEstudantePorCodigo(ctxEscolaA, daEscolaB.uniqueCode)).toBeNull()
    expect(
      await buscarEstudantePorCodigo(ctxEscolaB, daEscolaB.uniqueCode),
    ).not.toBeNull()
  })

  it('responde 404, e não 403, ao cadastrar em escola fora do escopo', async () => {
    const tentativa = criarEstudante(ctxEscolaA, {
      schoolId: amb.escolaB,
      classId: amb.turmaB,
      nomeOriginal: 'Criança Fora do Escopo',
      codigoExterno: '',
    })

    await expect(tentativa).rejects.toMatchObject({ status: 404 })
    await expect(tentativa).rejects.toBeInstanceOf(AppError)
  })

  it('exporta a nominata em CSV com BOM, separador ";" e os códigos únicos', async () => {
    const csv = await gerarCsvNominata(ctxAnalista, { schoolId: amb.escolaA })

    expect(csv.conteudo.startsWith('\uFEFF')).toBe(true)
    expect(csv.conteudo.split('\r\n')[0]).toBe(
      '\uFEFFCódigo Único;Escola;Código da Turma;Turma;Ano Escolar;Estudante;Código Externo',
    )
    expect(csv.totalLinhas).toBeGreaterThan(0)
    expect(csv.nominal).toBe(true)

    const suprimido = await gerarCsvNominata(ctxSemNomes, { schoolId: amb.escolaA })
    expect(suprimido.nominal).toBe(false)
    expect(suprimido.conteudo).toContain(NOME_SUPRIMIDO)
    expect(suprimido.totalLinhas).toBe(csv.totalLinhas)
  })
})

describe('correção de dados cadastrais', () => {
  it('altera nome e turma sem tocar em nenhum resultado já importado (FR-178)', async () => {
    const estudante = await criarEstudante(ctxAnalista, {
      schoolId: amb.escolaA,
      classId: amb.turmaA,
      nomeOriginal: 'Nome Com Erro de Digitacao',
      codigoExterno: '',
    })

    const avaliacao = await prisma.assessment.create({
      data: {
        nome: `${PREFIXO} Avaliação`,
        ano: 2026,
        ciclo: 'II',
        componenteCurricular: 'LEITURA',
      },
    })

    const importacao = await prisma.import.create({
      data: {
        assessmentId: avaliacao.id,
        schoolId: amb.escolaA,
        fileName: 'resultados.csv',
        fileHash: `${PREFIXO}-hash`,
        fileSize: 10,
        // O banco exige coerência entre arquivo guardado e expurgo: sem `filePurgedAt`, o
        // caminho do arquivo precisa existir.
        storagePath: `${PREFIXO}/resultados.csv`,
        fileRetainedUntil: new Date(Date.now() + 86_400_000),
        userId: amb.usuarioAnalista,
        status: 'COMPLETED',
      },
    })

    const resultado = await prisma.assessmentStudentResult.create({
      data: {
        assessmentId: avaliacao.id,
        schoolId: amb.escolaA,
        classId: amb.turmaA,
        studentId: estudante.id,
        importId: importacao.id,
        avaliado: true,
        nivelOriginal: 'Adequado',
        nivelNormalizado: 'ADEQUADO',
        acertosTotais: 18,
        itensTotais: 22,
        percentualGeral: '81.8182',
      },
    })

    // Turma nova, na mesma escola, para exercitar a transferência.
    const outraTurma = await prisma.class.create({
      data: {
        schoolId: amb.escolaA,
        externalCode: `${PREFIXO}-TURMA-A2`,
        name: '4º ANO A2',
        anoEscolar: 'ENSINO FUNDAMENTAL DE 9 ANOS - 4º ANO',
      },
    })

    const atualizado = await atualizarEstudante(ctxAnalista, {
      id: estudante.id,
      schoolId: amb.escolaA,
      classId: outraTurma.id,
      nomeOriginal: 'Nome Corrigido',
      codigoExterno: 'MAT-9090',
    })

    expect(atualizado.nomeOriginal).toBe('Nome Corrigido')
    expect(atualizado.classId).toBe(outraTurma.id)
    // O código único é permanente: correção de cadastro não o regenera (FR-129).
    expect(atualizado.uniqueCode).toBe(estudante.uniqueCode)

    const depois = await prisma.assessmentStudentResult.findUniqueOrThrow({
      where: { id: resultado.id },
    })

    expect(depois.classId).toBe(amb.turmaA)
    expect(depois.schoolId).toBe(resultado.schoolId)
    expect(depois.acertosTotais).toBe(18)
    expect(depois.itensTotais).toBe(22)
    expect(depois.nivelOriginal).toBe('Adequado')
    expect(depois.percentualGeral?.toString()).toBe(resultado.percentualGeral?.toString())
    expect(depois.updatedAt.getTime()).toBe(resultado.updatedAt.getTime())

    const auditoria = await prisma.auditLog.findFirst({
      where: { action: 'STUDENT_UPDATE', entityId: estudante.id },
    })
    expect(auditoria).not.toBeNull()
    expect(JSON.stringify(auditoria)).not.toContain('Nome Corrigido')
  })

  it('recusa a edição de estudante de outra escola com 404', async () => {
    const daEscolaB = await criarEstudante(ctxEscolaB, {
      schoolId: amb.escolaB,
      classId: amb.turmaB,
      nomeOriginal: 'Outra Criança da Escola B',
      codigoExterno: '',
    })

    await expect(
      atualizarEstudante(ctxEscolaA, {
        id: daEscolaB.id,
        schoolId: amb.escolaA,
        classId: amb.turmaA,
        nomeOriginal: 'Sequestro de Cadastro',
        codigoExterno: '',
      }),
    ).rejects.toMatchObject({ status: 404 })

    const intacto = await prisma.student.findUniqueOrThrow({
      where: { id: daEscolaB.id },
    })
    expect(intacto.nomeOriginal).toBe('Outra Criança da Escola B')
    expect(intacto.schoolId).toBe(amb.escolaB)
  })
})
