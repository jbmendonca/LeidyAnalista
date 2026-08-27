import { prisma } from '@/server/prisma'
import { schoolScopeFilter, type AuthContext } from '@/server/authorization'

/**
 * Lista as turmas visíveis ao requisitante, opcionalmente restritas a uma escola.
 *
 * O `schoolId` que chega da tela é **filtro**. Ele nunca amplia o alcance: passa por
 * `schoolScopeFilter`, que só o aceita se já estiver dentro de `ctx.allowedSchoolIds` e, do
 * contrário, responde 404. Sem `schoolId`, o recorte é o conjunto inteiro de escolas
 * permitidas — nunca o banco inteiro.
 */

export type TurmaDaLista = {
  id: string
  externalCode: string
  name: string
  anoEscolar: string
  schoolId: string
  escolaNome: string
  totalEstudantes: number
}

export async function listarTurmas(
  ctx: AuthContext,
  schoolId?: string | null,
): Promise<TurmaDaLista[]> {
  const escopo = schoolScopeFilter(ctx, schoolId)

  const turmas = await prisma.class.findMany({
    where: { schoolId: { in: [...escopo.in] } },
    orderBy: [{ school: { name: 'asc' } }, { anoEscolar: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      externalCode: true,
      name: true,
      anoEscolar: true,
      schoolId: true,
      school: { select: { name: true } },
      _count: { select: { students: true } },
    },
  })

  return turmas.map((t) => ({
    id: t.id,
    externalCode: t.externalCode,
    name: t.name,
    anoEscolar: t.anoEscolar,
    schoolId: t.schoolId,
    escolaNome: t.school.name,
    totalEstudantes: t._count.students,
  }))
}
