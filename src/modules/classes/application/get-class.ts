import { prisma } from '@/server/prisma'
import { schoolScopeFilter, type AuthContext } from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'

/**
 * Lê uma turma pelo identificador.
 *
 * A busca é por `findFirst` com o filtro de escopo embutido na cláusula `where`, e não por
 * `findUnique` seguido de conferência: assim a turma de outra escola simplesmente não é
 * encontrada pela consulta. Não existe instante em que a linha alheia esteve em memória, e a
 * resposta é a mesma de um identificador inexistente — 404, nunca 403.
 */

export type TurmaDetalhada = {
  id: string
  externalCode: string
  name: string
  anoEscolar: string
  schoolId: string
  escolaNome: string
}

export async function obterTurma(
  ctx: AuthContext,
  classId: string,
): Promise<TurmaDetalhada> {
  const escopo = schoolScopeFilter(ctx)

  const turma = await prisma.class.findFirst({
    where: { id: classId, schoolId: { in: [...escopo.in] } },
    select: {
      id: true,
      externalCode: true,
      name: true,
      anoEscolar: true,
      schoolId: true,
      school: { select: { name: true } },
    },
  })

  if (!turma) throw naoEncontrado('Turma')

  return {
    id: turma.id,
    externalCode: turma.externalCode,
    name: turma.name,
    anoEscolar: turma.anoEscolar,
    schoolId: turma.schoolId,
    escolaNome: turma.school.name,
  }
}
