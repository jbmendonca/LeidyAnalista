import { prisma } from '@/server/prisma'
import { assertSchoolInScope, type AuthContext } from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'

/**
 * Lê uma escola pelo identificador.
 *
 * `assertSchoolInScope` vem **antes** da consulta: escola fora do escopo responde 404 sem que
 * o banco chegue a ser tocado. Se a checagem viesse depois, o tempo de resposta já
 * denunciaria a diferença entre "não existe" e "existe, mas não é sua" — que é exatamente a
 * informação que o 404 uniforme esconde.
 */

export type EscolaDetalhada = {
  id: string
  code: string
  name: string
  rede: string
  municipio: string
  estado: string
}

export async function obterEscola(
  ctx: AuthContext,
  schoolId: string,
): Promise<EscolaDetalhada> {
  const idNoEscopo = assertSchoolInScope(ctx, schoolId)

  const escola = await prisma.school.findUnique({
    where: { id: idNoEscopo },
    select: {
      id: true,
      code: true,
      name: true,
      rede: true,
      municipio: true,
      estado: true,
    },
  })

  // Mesma resposta do caso fora do escopo — os dois caminhos são indistinguíveis de fora.
  if (!escola) throw naoEncontrado('Escola')

  return escola
}
