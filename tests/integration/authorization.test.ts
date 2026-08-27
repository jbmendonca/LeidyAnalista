import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

import {
  assertSchoolInScope,
  escopoVazio,
  requireRole,
  requireUser,
  resolveAllowedSchoolIds,
  schoolScopeFilter,
  type AuthContext,
} from '@/server/authorization'
import {
  contarParticipacao,
  desempenhoGeral,
  desempenhoPorHabilidade,
  desempenhoPorTurma,
  distribuicaoPorNivel,
} from '@/modules/analytics/infra/aggregate-queries'
import { createImport } from '@/modules/imports/application/create-import'
import { getPreview } from '@/modules/imports/application/get-preview'
import { deleteImport } from '@/modules/imports/application/delete-import'

/**
 * ===========================================================================
 *  MATRIZ DE AUTORIZAÇÃO
 * ===========================================================================
 *
 * Executa cada entrada de servidor com um usuário `ESCOLA` vinculado a OUTRA
 * escola e exige resultado vazio ou 404.
 *
 * A intenção é que uma rota nova sem linha nesta matriz quebre a suíte. É a
 * forma de impedir que o escopo por escola seja esquecido em uma entrada entre
 * dezenas — o modo de falha mais comum e mais silencioso deste tipo de sistema.
 *
 * Regra que este arquivo verifica em toda parte: **recurso fora do escopo
 * responde 404, JAMAIS 403.** Um 403 confirmaria a existência da escola a quem
 * não pode vê-la.
 */

const prisma = new PrismaClient()
const SUFIXO = `authz-${Date.now()}`

let escolaA: string
let escolaB: string
let avaliacaoId: string
let usuarioAdmin: string
let usuarioEscolaB: string

let ctxAdmin: AuthContext
let ctxEscolaB: AuthContext
let ctxSemEscola: AuthContext

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.school.create({
      data: {
        code: `A-${SUFIXO}`,
        name: 'Escola A',
        rede: 'MUNICIPAL',
        municipio: 'BOA VISTA',
        estado: 'RR',
      },
    }),
    prisma.school.create({
      data: {
        code: `B-${SUFIXO}`,
        name: 'Escola B',
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

  const admin = await prisma.user.create({
    data: {
      email: `admin-${SUFIXO}@teste.local`,
      name: 'Admin',
      passwordHash: 'x',
      role: 'ADMIN',
      canAccessNominalData: true,
    },
  })
  usuarioAdmin = admin.id

  const daEscolaB = await prisma.user.create({
    data: {
      email: `escola-b-${SUFIXO}@teste.local`,
      name: 'Usuário Escola B',
      passwordHash: 'x',
      role: 'ESCOLA',
      canAccessNominalData: true,
      schools: { create: { schoolId: escolaB } },
    },
  })
  usuarioEscolaB = daEscolaB.id

  ctxAdmin = {
    userId: usuarioAdmin,
    role: 'ADMIN',
    allowedSchoolIds: [escolaA, escolaB],
    canAccessNominalData: true,
  }
  ctxEscolaB = {
    userId: usuarioEscolaB,
    role: 'ESCOLA',
    allowedSchoolIds: [escolaB],
    canAccessNominalData: true,
  }
  ctxSemEscola = {
    userId: usuarioEscolaB,
    role: 'ESCOLA',
    allowedSchoolIds: [],
    canAccessNominalData: false,
  }
}, 60_000)

afterAll(async () => {
  await prisma.importIssue.deleteMany({ where: { import: { assessmentId: avaliacaoId } } })
  await prisma.importRow.deleteMany({ where: { import: { assessmentId: avaliacaoId } } })
  await prisma.import.deleteMany({ where: { assessmentId: avaliacaoId } })
  await prisma.auditLog.deleteMany({ where: { userId: { in: [usuarioAdmin, usuarioEscolaB] } } })
  await prisma.userSchool.deleteMany({ where: { userId: usuarioEscolaB } })
  await prisma.assessment.delete({ where: { id: avaliacaoId } })
  await prisma.user.deleteMany({ where: { id: { in: [usuarioAdmin, usuarioEscolaB] } } })
  await prisma.school.deleteMany({ where: { id: { in: [escolaA, escolaB] } } })
  await prisma.$disconnect()
}, 60_000)

describe('resolução do escopo — a única fonte de autorização', () => {
  it('deriva as escolas de UserSchool, nunca do cliente', async () => {
    const escopo = await resolveAllowedSchoolIds(usuarioEscolaB, 'ESCOLA')
    expect(escopo).toEqual([escolaB])
    expect(escopo).not.toContain(escolaA)
  })

  it('ADMIN recebe todas as escolas, resolvidas no servidor', async () => {
    const escopo = await resolveAllowedSchoolIds(usuarioAdmin, 'ADMIN')
    expect(escopo).toContain(escolaA)
    expect(escopo).toContain(escolaB)
  })

  it('ANALISTA sem vínculo recebe escopo vazio — e vazio significa nada, não tudo', async () => {
    const semVinculo = await prisma.user.create({
      data: {
        email: `analista-${SUFIXO}@teste.local`,
        name: 'Analista',
        passwordHash: 'x',
        role: 'ANALISTA',
      },
    })
    const escopo = await resolveAllowedSchoolIds(semVinculo.id, 'ANALISTA')
    expect(escopo).toEqual([])
    expect(
      escopoVazio({
        userId: semVinculo.id,
        role: 'ANALISTA',
        allowedSchoolIds: escopo,
        canAccessNominalData: false,
      }),
    ).toBe(true)
    await prisma.user.delete({ where: { id: semVinculo.id } })
  })
})

describe('schoolId do cliente é filtro, nunca autorização', () => {
  it('escola fora do escopo lança 404, NUNCA 403', () => {
    try {
      assertSchoolInScope(ctxEscolaB, escolaA)
      throw new Error('deveria ter lançado')
    } catch (erro) {
      expect((erro as { status: number }).status).toBe(404)
      expect((erro as { status: number }).status).not.toBe(403)
    }
  })

  it('sem schoolId, o filtro restringe a TODAS as escolas permitidas', () => {
    expect(schoolScopeFilter(ctxEscolaB)).toEqual({ in: [escolaB] })
  })

  it('com schoolId permitido, restringe àquela escola', () => {
    expect(schoolScopeFilter(ctxEscolaB, escolaB)).toEqual({ in: [escolaB] })
  })

  it('o filtro devolve cópia — alterá-lo não amplia o escopo do contexto', () => {
    const filtro = schoolScopeFilter(ctxEscolaB)
    filtro.in.push(escolaA)
    expect(ctxEscolaB.allowedSchoolIds).toEqual([escolaB])
  })
})

describe('guardas de papel', () => {
  it('requireUser rejeita contexto nulo com 401', () => {
    expect(() => requireUser(null)).toThrowError()
    try {
      requireUser(null)
    } catch (erro) {
      expect((erro as { status: number }).status).toBe(401)
    }
  })

  it('requireRole rejeita papel não autorizado com 403', () => {
    try {
      requireRole(ctxEscolaB, 'ADMIN')
      throw new Error('deveria ter lançado')
    } catch (erro) {
      expect((erro as { status: number }).status).toBe(403)
    }
  })

  it('requireRole aceita papel autorizado', () => {
    expect(() => requireRole(ctxAdmin, 'ADMIN', 'ANALISTA')).not.toThrow()
  })
})

describe('matriz: cada entrada de leitura respeita o escopo', () => {
  const filtrosEscolaA = () => ({ assessmentId: avaliacaoId, schoolId: escolaA })

  /**
   * Cada entrada é exercitada de duas formas complementares:
   *
   *  - **com `schoolId` de outra escola** — o `schoolId` do cliente é filtro, e
   *    fora do escopo a resposta é 404. Rejeitar é o correto aqui: ajustar em
   *    silêncio esconderia a tentativa.
   *  - **sem `schoolId`, com escopo vazio** — não há o que rejeitar, e o
   *    resultado tem de ser vazio. É onde mora o erro clássico: escopo vazio
   *    interpretado como "sem filtro", devolvendo o universo.
   */
  const entradas: readonly {
    nome: string
    comEscola: (ctx: AuthContext) => Promise<unknown>
    semEscola: (ctx: AuthContext) => Promise<unknown>
  }[] = [
    {
      nome: 'contarParticipacao',
      comEscola: (c) => contarParticipacao(c, filtrosEscolaA()),
      semEscola: (c) => contarParticipacao(c, { assessmentId: avaliacaoId }),
    },
    {
      nome: 'distribuicaoPorNivel',
      comEscola: (c) => distribuicaoPorNivel(c, filtrosEscolaA()),
      semEscola: (c) => distribuicaoPorNivel(c, { assessmentId: avaliacaoId }),
    },
    {
      nome: 'desempenhoGeral',
      comEscola: (c) => desempenhoGeral(c, filtrosEscolaA()),
      semEscola: (c) => desempenhoGeral(c, { assessmentId: avaliacaoId }),
    },
    {
      nome: 'desempenhoPorHabilidade',
      comEscola: (c) => desempenhoPorHabilidade(c, filtrosEscolaA()),
      semEscola: (c) => desempenhoPorHabilidade(c, { assessmentId: avaliacaoId }),
    },
    {
      nome: 'desempenhoPorTurma',
      comEscola: (c) => desempenhoPorTurma(c, filtrosEscolaA()),
      semEscola: (c) => desempenhoPorTurma(c, { assessmentId: avaliacaoId }),
    },
  ]

  for (const entrada of entradas) {
    it(`${entrada.nome} recusa escola fora do escopo com 404`, async () => {
      await expect(entrada.comEscola(ctxEscolaB)).rejects.toMatchObject({ status: 404 })
    })
  }

  for (const entrada of entradas) {
    it(`${entrada.nome} devolve vazio para usuário sem escola alguma`, async () => {
      const resultado = await entrada.semEscola(ctxSemEscola)

      // Escopo vazio significa nada a mostrar — e não "mostrar tudo".
      if (resultado instanceof Map) {
        expect(resultado.size).toBe(0)
      } else if (resultado === null) {
        expect(resultado).toBeNull()
      } else {
        const valores = Object.values(resultado as Record<string, unknown>).filter(
          (v) => typeof v === 'number',
        )
        expect(valores.every((v) => v === 0)).toBe(true)
      }
    })
  }
})

describe('matriz: cada entrada de escrita respeita o escopo', () => {
  it('createImport recusa escola fora do escopo com 404', async () => {
    await expect(
      createImport(ctxEscolaB, {
        assessmentId: avaliacaoId,
        schoolId: escolaA,
        nomeArquivo: 'x.csv',
        conteudo: Buffer.from('Rede;Estudante\nMUNICIPAL;FULANO'),
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('getPreview de importação de outra escola responde 404', async () => {
    const { importId } = await createImport(ctxAdmin, {
      assessmentId: avaliacaoId,
      schoolId: escolaA,
      nomeArquivo: 'x.csv',
      conteudo: Buffer.from('Rede;Estudante\nMUNICIPAL;FULANO'),
    })

    await expect(getPreview(ctxEscolaB, importId)).rejects.toMatchObject({ status: 404 })
  })

  it('deleteImport exige ADMIN — perfil ESCOLA recebe 403', async () => {
    const { importId } = await createImport(ctxAdmin, {
      assessmentId: avaliacaoId,
      schoolId: escolaB,
      nomeArquivo: 'y.csv',
      conteudo: Buffer.from('Rede;Estudante\nMUNICIPAL;FULANO'),
    })

    await expect(deleteImport(ctxEscolaB, importId)).rejects.toMatchObject({ status: 403 })
  })
})
