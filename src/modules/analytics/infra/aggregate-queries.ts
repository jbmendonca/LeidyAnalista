import { Prisma } from '@prisma/client'
import { prisma } from '@/server/prisma'
import type { AuthContext } from '@/server/authorization'
import { schoolScopeFilter } from '@/server/authorization'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  CONSULTAS AGREGADAS
 * ===========================================================================
 *
 * Duas regras governam todo este arquivo:
 *
 *  1. **`avaliado: true` é obrigatório em toda consulta de DESEMPENHO e
 *     proibido na de PARTICIPAÇÃO.** A diferença entre as duas é a tradução
 *     exata de FR-059 e FR-060, e é o ponto do sistema que mais merece
 *     atenção em revisão. Um filtro esquecido aqui rebaixa turmas inteiras
 *     sem gerar erro visível.
 *
 *  2. **O escopo de escola vem de `AuthContext`, nunca do cliente.** Todo
 *     filtro passa por `schoolScopeFilter`, que valida o `schoolId` recebido
 *     contra as escolas permitidas antes de usá-lo (FR-006).
 *
 * Os percentuais NÃO são calculados aqui. Estas funções devolvem somas de
 * inteiros; a divisão acontece uma única vez, na borda de apresentação, com
 * `Decimal` (Const. II).
 */

export type FiltrosAnalise = Readonly<{
  assessmentId: string
  schoolId?: string | null
  classId?: string | null
  anoEscolar?: string | null
  rede?: string | null
  estado?: string | null
  municipio?: string | null
  componenteCurricular?: string | null
  avaliado?: boolean | null
  nivel?: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | null
  studentId?: string | null
}>

/** Cláusula base. NÃO inclui `avaliado` — quem chama decide, conscientemente. */
function whereBase(ctx: AuthContext, f: FiltrosAnalise): Prisma.AssessmentStudentResultWhereInput {
  const where: Prisma.AssessmentStudentResultWhereInput = {
    assessmentId: f.assessmentId,
    schoolId: schoolScopeFilter(ctx, f.schoolId),
  }

  if (f.classId) where.classId = f.classId
  if (f.studentId) where.studentId = f.studentId
  if (f.nivel) where.nivelNormalizado = f.nivel
  if (f.avaliado !== null && f.avaliado !== undefined) where.avaliado = f.avaliado

  const turma: Prisma.ClassWhereInput = {}
  if (f.anoEscolar) turma.anoEscolar = f.anoEscolar
  if (Object.keys(turma).length > 0) where.class = turma

  const escola: Prisma.SchoolWhereInput = {}
  if (f.rede) escola.rede = f.rede
  if (f.estado) escola.estado = f.estado
  if (f.municipio) escola.municipio = f.municipio
  if (Object.keys(escola).length > 0) where.school = escola

  return where
}

/**
 * PARTICIPAÇÃO — FR-061.
 * Denominador é TODO registro importado. É a única métrica em que os não
 * avaliados entram (FR-060).
 */
export async function contarParticipacao(
  ctx: AuthContext,
  f: FiltrosAnalise,
): Promise<{ total: number; avaliados: number; naoAvaliados: number }> {
  const where = whereBase(ctx, f)
  // O filtro de `avaliado` do usuário é ignorado de propósito: participação
  // sempre considera o universo completo do recorte.
  delete where.avaliado

  const [total, avaliados] = await Promise.all([
    prisma.assessmentStudentResult.count({ where }),
    prisma.assessmentStudentResult.count({ where: { ...where, avaliado: true } }),
  ])

  return { total, avaliados, naoAvaliados: total - avaliados }
}

/**
 * DISTRIBUIÇÃO POR NÍVEL — FR-062.
 * Denominador: SOMENTE avaliados. Não avaliados NUNCA são contados como
 * Defasagem — eles saem numa contagem própria.
 */
export async function distribuicaoPorNivel(
  ctx: AuthContext,
  f: FiltrosAnalise,
): Promise<{
  adequado: number
  intermediario: number
  defasagem: number
  semNivel: number
  totalAvaliados: number
}> {
  const where = { ...whereBase(ctx, f), avaliado: true }

  const grupos = await prisma.assessmentStudentResult.groupBy({
    by: ['nivelNormalizado'],
    where,
    _count: { _all: true },
  })

  let adequado = 0
  let intermediario = 0
  let defasagem = 0
  let semNivel = 0

  for (const g of grupos) {
    const n = g._count._all
    if (g.nivelNormalizado === 'ADEQUADO') adequado = n
    else if (g.nivelNormalizado === 'INTERMEDIARIO') intermediario = n
    else if (g.nivelNormalizado === 'DEFASAGEM') defasagem = n
    else semNivel = n
  }

  return {
    adequado,
    intermediario,
    defasagem,
    semNivel,
    totalAvaliados: adequado + intermediario + defasagem + semNivel,
  }
}

/**
 * DESEMPENHO GERAL do recorte — FR-056, FR-057.
 * Σ acertos ÷ Σ itens, restrito a avaliados. Devolve a fração, não o percentual.
 */
export async function desempenhoGeral(
  ctx: AuthContext,
  f: FiltrosAnalise,
): Promise<MaybeFraction> {
  const agregado = await prisma.assessmentStudentResult.aggregate({
    where: { ...whereBase(ctx, f), avaliado: true },
    _sum: { acertosTotais: true, itensTotais: true },
  })

  const acertos = agregado._sum.acertosTotais
  const itens = agregado._sum.itensTotais

  if (acertos === null || itens === null || itens <= 0) return null
  return { acertos, itens }
}

/**
 * DESEMPENHO POR HABILIDADE — FR-057.
 * Σ acertos ÷ Σ itens da habilidade, entre os avaliados do recorte.
 * Registros nulos ficam de fora da soma sem virar zero (Const. I).
 */
export async function desempenhoPorHabilidade(
  ctx: AuthContext,
  f: FiltrosAnalise,
): Promise<Map<string, { acertos: number; itens: number; estudantesComResultado: number }>> {
  const where = { ...whereBase(ctx, f), avaliado: true }

  const linhas = await prisma.studentSkillResult.groupBy({
    by: ['skillId'],
    where: {
      result: where,
      // Ausência não participa da soma. Sem este filtro, a agregação do Prisma
      // ignoraria os nulos de qualquer forma — mas deixá-lo explícito é o que
      // impede alguém de "consertar" isso com COALESCE(...,0) mais adiante.
      acertos: { not: null },
    },
    _sum: { acertos: true, itensPossiveis: true },
    _count: { _all: true },
  })

  const mapa = new Map<
    string,
    { acertos: number; itens: number; estudantesComResultado: number }
  >()

  for (const l of linhas) {
    const acertos = l._sum.acertos
    const itens = l._sum.itensPossiveis
    if (acertos === null || itens === null || itens <= 0) continue
    mapa.set(l.skillId, {
      acertos,
      itens,
      estudantesComResultado: l._count._all,
    })
  }

  return mapa
}

/**
 * Quantidade de estudantes em cada faixa analítica por habilidade.
 * As faixas vêm de `AnalyticalSettings` e são aplicadas com multiplicação
 * cruzada em SQL — sem divisão, sem ponto flutuante:
 *   acertos/itens < limite/100   ⟺   acertos × 100 < limite × itens
 */
export async function estudantesEmFragilidadePorHabilidade(
  ctx: AuthContext,
  f: FiltrosAnalise,
  fragilidadeMax: string,
): Promise<Map<string, number>> {
  const where = { ...whereBase(ctx, f), avaliado: true }

  const ids = await prisma.assessmentStudentResult.findMany({
    where,
    select: { id: true },
  })
  if (ids.length === 0) return new Map()

  const linhas = await prisma.$queryRaw<{ skillId: string; total: bigint }[]>(
    Prisma.sql`
      SELECT "skillId", COUNT(*)::bigint AS total
      FROM "student_skill_result"
      WHERE "resultId" IN (${Prisma.join(ids.map((i) => i.id))})
        AND "acertos" IS NOT NULL
        AND "acertos" * 100 < ${Prisma.raw(`'${fragilidadeMax}'::numeric`)} * "itensPossiveis"
      GROUP BY "skillId"
    `,
  )

  return new Map(linhas.map((l) => [l.skillId, Number(l.total)]))
}

/**
 * DESEMPENHO POR TURMA — mesma regra: somente avaliados.
 *
 * ATENÇÃO ao consumir: `itens === 0` significa **ausência de dado**, não
 * desempenho zero. Uma turma sem nenhum avaliado sai daqui como `0/0`, e
 * dividir isso produziria `0%` — a distorção que o produto existe para
 * evitar. Passe sempre por um construtor de fração que devolva `null` para
 * denominador não positivo antes de calcular percentual.
 */
export async function desempenhoPorTurma(
  ctx: AuthContext,
  f: FiltrosAnalise,
): Promise<
  Map<string, { acertos: number; itens: number; avaliados: number; total: number }>
> {
  const whereTotal = whereBase(ctx, f)
  delete whereTotal.avaliado

  const [totais, avaliados] = await Promise.all([
    prisma.assessmentStudentResult.groupBy({
      by: ['classId'],
      where: whereTotal,
      _count: { _all: true },
    }),
    prisma.assessmentStudentResult.groupBy({
      by: ['classId'],
      where: { ...whereTotal, avaliado: true },
      _sum: { acertosTotais: true, itensTotais: true },
      _count: { _all: true },
    }),
  ])

  const mapa = new Map<
    string,
    { acertos: number; itens: number; avaliados: number; total: number }
  >()

  for (const t of totais) {
    mapa.set(t.classId, { acertos: 0, itens: 0, avaliados: 0, total: t._count._all })
  }
  for (const a of avaliados) {
    const atual = mapa.get(a.classId)
    if (!atual) continue
    mapa.set(a.classId, {
      ...atual,
      acertos: a._sum.acertosTotais ?? 0,
      itens: a._sum.itensTotais ?? 0,
      avaliados: a._count._all,
    })
  }

  return mapa
}

/**
 * Distribuição de resultados de uma habilidade: quantos estudantes fizeram
 * 0/n, 1/n, ... n/n — FR-085.
 * Registros com denominador divergente do de referência saem à parte (FR-158).
 */
export async function distribuicaoDaHabilidade(
  ctx: AuthContext,
  f: FiltrosAnalise,
  skillId: string,
  denominadorReferencia: number,
): Promise<{
  distribuicao: { acertos: number; quantidade: number }[]
  divergentes: { acertos: number; itens: number; quantidade: number }[]
}> {
  const where = { ...whereBase(ctx, f), avaliado: true }

  const linhas = await prisma.studentSkillResult.groupBy({
    by: ['acertos', 'itensPossiveis'],
    where: { result: where, skillId, acertos: { not: null } },
    _count: { _all: true },
  })

  const distribuicao: { acertos: number; quantidade: number }[] = []
  const divergentes: { acertos: number; itens: number; quantidade: number }[] = []

  for (const l of linhas) {
    if (l.acertos === null || l.itensPossiveis === null) continue
    if (l.itensPossiveis === denominadorReferencia) {
      distribuicao.push({ acertos: l.acertos, quantidade: l._count._all })
    } else {
      divergentes.push({
        acertos: l.acertos,
        itens: l.itensPossiveis,
        quantidade: l._count._all,
      })
    }
  }

  // Completa as faixas sem ocorrência, para que a distribuição mostre o vazio
  // em vez de omiti-lo.
  for (let i = 0; i <= denominadorReferencia; i++) {
    if (!distribuicao.some((d) => d.acertos === i)) {
      distribuicao.push({ acertos: i, quantidade: 0 })
    }
  }
  distribuicao.sort((a, b) => a.acertos - b.acertos)

  return { distribuicao, divergentes }
}
