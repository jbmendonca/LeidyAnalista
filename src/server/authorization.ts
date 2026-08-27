import type { Role } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { naoAutenticado, naoEncontrado, semPermissao } from '@/server/http-errors'

/**
 * ===========================================================================
 *  PONTO ÚNICO DE AUTORIZAÇÃO  —  Const. IV, spec FR-006, research R-003
 * ===========================================================================
 *
 * Cinco regras valem para TODA leitura e TODA escrita do sistema:
 *
 *  1. A identidade vem do cookie de sessão, resolvido no servidor. Nunca de
 *     cabeçalho, corpo ou parâmetro.
 *  2. `schoolId` recebido do cliente é FILTRO, NUNCA AUTORIZAÇÃO. Fora do
 *     conjunto permitido, a requisição é rejeitada — não ajustada em silêncio.
 *  3. ADMIN tem escopo de todas as escolas, resolvido aqui, no servidor.
 *  4. Recurso fora do escopo responde 404, JAMAIS 403 — 403 confirmaria a
 *     existência da escola a quem não pode vê-la.
 *  5. Toda mutação registra AuditLog na mesma transação da escrita.
 *
 * Violar qualquer uma delas é defeito bloqueante em revisão.
 */

export type AuthContext = Readonly<{
  userId: string
  role: Role
  /** Resolvido de UserSchool no servidor. Nunca vem do cliente. */
  allowedSchoolIds: readonly string[]
  /** FR-007 — permissão específica, ortogonal ao perfil e ao escopo. */
  canAccessNominalData: boolean
}>

/**
 * Deriva as escolas que o usuário pode acessar. Esta é a ÚNICA fonte de
 * autorização por escola do sistema.
 */
export async function resolveAllowedSchoolIds(
  userId: string,
  role: Role,
): Promise<string[]> {
  if (role === 'ADMIN') {
    const todas = await prisma.school.findMany({ select: { id: true } })
    return todas.map((e) => e.id)
  }
  const vinculos = await prisma.userSchool.findMany({
    where: { userId },
    select: { schoolId: true },
  })
  return vinculos.map((v) => v.schoolId)
}

export function requireUser(ctx: AuthContext | null): AuthContext {
  if (!ctx) throw naoAutenticado()
  return ctx
}

export function requireRole(ctx: AuthContext | null, ...papeis: Role[]): AuthContext {
  const c = requireUser(ctx)
  if (!papeis.includes(c.role)) throw semPermissao()
  return c
}

/**
 * Converte um `schoolId` vindo do cliente em filtro validado.
 *
 * Fora do escopo, lança 404. É aqui que a regra 2 é aplicada; nenhuma consulta
 * deve receber `schoolId` sem passar por esta função.
 */
export function assertSchoolInScope(ctx: AuthContext, schoolId: string): string {
  if (!ctx.allowedSchoolIds.includes(schoolId)) {
    throw naoEncontrado('Escola')
  }
  return schoolId
}

/**
 * Constrói o filtro de escola de uma consulta.
 *
 * Sem `schoolId`, restringe a todas as escolas permitidas. Com `schoolId`,
 * restringe àquela — depois de validá-la. Nos dois casos o resultado está
 * dentro do escopo: não existe caminho em que o cliente amplie o próprio
 * alcance.
 */
export function schoolScopeFilter(
  ctx: AuthContext,
  schoolId?: string | null,
): { in: readonly string[] } {
  if (schoolId) {
    return { in: [assertSchoolInScope(ctx, schoolId)] }
  }
  return { in: ctx.allowedSchoolIds }
}

/** Escopo vazio significa nada a mostrar — e não "mostrar tudo". */
export function escopoVazio(ctx: AuthContext): boolean {
  return ctx.allowedSchoolIds.length === 0
}
