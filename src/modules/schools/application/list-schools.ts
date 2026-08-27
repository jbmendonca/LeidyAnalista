import { prisma } from '@/server/prisma'
import { schoolScopeFilter, type AuthContext } from '@/server/authorization'

/**
 * Lista as escolas visíveis ao requisitante.
 *
 * O filtro nasce de `schoolScopeFilter`, que só conhece `ctx.allowedSchoolIds` — resolvido no
 * servidor a partir de `UserSchool`. Não existe parâmetro nesta função capaz de ampliar o
 * alcance: o usuário de escola simplesmente não recebe a linha da escola vizinha, e não há
 * caminho de código que o permita.
 *
 * Escopo vazio devolve lista vazia. Isso é deliberado: `in: []` no Prisma não casa com nada,
 * enquanto omitir o filtro devolveria o banco inteiro. Vazio significa "nada a mostrar",
 * nunca "mostrar tudo".
 */

export type EscolaDaLista = {
  id: string
  code: string
  name: string
  rede: string
  municipio: string
  estado: string
  totalTurmas: number
  totalEstudantes: number
}

export async function listarEscolas(ctx: AuthContext): Promise<EscolaDaLista[]> {
  const escopo = schoolScopeFilter(ctx)

  const escolas = await prisma.school.findMany({
    where: { id: { in: [...escopo.in] } },
    orderBy: [{ estado: 'asc' }, { municipio: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      rede: true,
      municipio: true,
      estado: true,
      _count: { select: { classes: true, students: true } },
    },
  })

  return escolas.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    rede: e.rede,
    municipio: e.municipio,
    estado: e.estado,
    totalTurmas: e._count.classes,
    totalEstudantes: e._count.students,
  }))
}

/** Versão enxuta para preencher seletores de escola em formulários e filtros. */
export async function listarEscolasParaSelecao(
  ctx: AuthContext,
): Promise<{ id: string; name: string; municipio: string; estado: string }[]> {
  const escopo = schoolScopeFilter(ctx)

  return prisma.school.findMany({
    where: { id: { in: [...escopo.in] } },
    orderBy: [{ name: 'asc' }],
    select: { id: true, name: true, municipio: true, estado: true },
  })
}
