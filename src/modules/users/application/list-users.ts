import { prisma } from '@/server/prisma'
import { requireRole, type AuthContext } from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'
import type { Perfil } from '@/modules/users/schemas'

/**
 * Listagem de usuários — restrita ao Administrador.
 *
 * `passwordHash` não é selecionado em lugar nenhum deste módulo. Não é cuidado de estilo: um
 * hash que nunca sai do banco não pode vazar por serialização de props de servidor para
 * cliente, que é como esse tipo de campo costuma escapar em App Router.
 *
 * As escolas vinculadas aparecem porque são a autorização real do usuário (`UserSchool` é a
 * única fonte de escopo, Const. IV) — o Administrador precisa ver o que de fato concedeu, e
 * não deduzir do perfil.
 */

export type EscolaVinculada = Readonly<{ id: string; name: string }>

export type UsuarioDaLista = Readonly<{
  id: string
  name: string
  email: string
  role: Perfil
  active: boolean
  canAccessNominalData: boolean
  escolas: readonly EscolaVinculada[]
  createdAt: Date
}>

const SELECAO = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  canAccessNominalData: true,
  createdAt: true,
  schools: {
    select: { school: { select: { id: true, name: true } } },
    orderBy: { school: { name: 'asc' } },
  },
} as const

type RegistroBruto = {
  id: string
  name: string
  email: string
  role: Perfil
  active: boolean
  canAccessNominalData: boolean
  createdAt: Date
  schools: { school: { id: string; name: string } }[]
}

function paraUsuario(registro: RegistroBruto): UsuarioDaLista {
  return {
    id: registro.id,
    name: registro.name,
    email: registro.email,
    role: registro.role,
    active: registro.active,
    canAccessNominalData: registro.canAccessNominalData,
    escolas: registro.schools.map((v) => v.school),
    createdAt: registro.createdAt,
  }
}

export async function listarUsuarios(ctx: AuthContext): Promise<UsuarioDaLista[]> {
  requireRole(ctx, 'ADMIN')

  const registros = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: SELECAO,
  })

  return registros.map(paraUsuario)
}

export async function obterUsuario(
  ctx: AuthContext,
  userId: string,
): Promise<UsuarioDaLista> {
  requireRole(ctx, 'ADMIN')

  const registro = await prisma.user.findUnique({
    where: { id: userId },
    select: SELECAO,
  })
  if (!registro) throw naoEncontrado('Usuário')

  return paraUsuario(registro)
}
