import type { Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { entradaInvalida } from '@/server/http-errors'
import { escopoVazio, type AuthContext } from '@/server/authorization'
import { aplicarSupressaoNominal, podeVerNomes } from '@/server/nominal-data'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import {
  ehCodigoUnicoValido,
  normalizarCodigoUnico,
} from '@/modules/students/domain/unique-code'
import { filtrosEstudantesSchema } from '@/modules/students/schemas'
import {
  SELECAO_ESTUDANTE,
  filtroDeEscola,
  mapearEstudante,
  type EstudanteListado,
} from '@/modules/students/infra/student-repository'

/**
 * Listagem da base cadastral — FR-132, FR-133, FR-007a.
 *
 * Três decisões que não são de conveniência:
 *
 *  1. O escopo de escola entra na consulta, não no componente. `schoolId` recebido do cliente
 *     é filtro dentro do que já é permitido, nunca autorização (Const. IV).
 *  2. Quem não tem a permissão de dados nominais recebe a lista **completa** com os nomes
 *     suprimidos — nunca uma negação (FR-007a). O `uniqueCode` permanece: identifica sem
 *     revelar (FR-131).
 *  3. Para esse mesmo usuário, a busca por nome é ignorada e a ordenação passa a ser por
 *     código. Buscar por nome numa lista com nomes suprimidos devolveria a resposta pela
 *     seleção das linhas, e ordenar por nome revelaria a ordem alfabética — as duas coisas
 *     reconstituiriam, aos poucos, aquilo que a supressão retirou.
 */

export type ListaEstudantes = Readonly<{
  itens: readonly EstudanteListado[]
  total: number
  pagina: number
  tamanho: number
  /** `false` quando os nomes vieram suprimidos (FR-007a). */
  nominal: boolean
  /** Sinaliza à interface que o termo de busca não pôde ser aplicado sobre o nome. */
  buscaPorNomeIgnorada: boolean
}>

export async function listarEstudantes(
  ctx: AuthContext,
  filtros: unknown = {},
): Promise<ListaEstudantes> {
  const analise = filtrosEstudantesSchema.safeParse(filtros)
  if (!analise.success) {
    throw entradaInvalida(analise.error.flatten().fieldErrors as Record<string, string[]>)
  }

  const f = analise.data
  const nominal = podeVerNomes(ctx)

  // Escopo vazio significa nada a mostrar — jamais "mostrar tudo".
  if (escopoVazio(ctx)) {
    return {
      itens: [],
      total: 0,
      pagina: f.pagina,
      tamanho: f.tamanho,
      nominal,
      buscaPorNomeIgnorada: false,
    }
  }

  const where: Prisma.StudentWhereInput = {
    schoolId: filtroDeEscola(ctx, f.schoolId),
    ...(f.classId !== null ? { classId: f.classId } : {}),
    ...(f.incluirInativos ? {} : { active: true }),
  }

  let buscaPorNomeIgnorada = false

  if (f.busca !== null) {
    const codigo = normalizarCodigoUnico(f.busca)
    const alternativas: Prisma.StudentWhereInput[] = []

    if (ehCodigoUnicoValido(codigo)) alternativas.push({ uniqueCode: codigo })

    if (nominal) {
      alternativas.push({
        nomeNormalizado: { contains: normalizeStudentName(f.busca) },
      })
    } else {
      buscaPorNomeIgnorada = true
    }

    if (alternativas.length > 0) where.OR = alternativas
  }

  const [total, linhas] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      select: SELECAO_ESTUDANTE,
      orderBy: nominal
        ? [{ nomeNormalizado: 'asc' }, { uniqueCode: 'asc' }]
        : [{ uniqueCode: 'asc' }],
      skip: (f.pagina - 1) * f.tamanho,
      take: f.tamanho,
    }),
  ])

  return {
    // A supressão acontece aqui, na fronteira da consulta: um componente que apenas
    // escondesse a coluna deixaria o nome trafegar até o navegador.
    itens: aplicarSupressaoNominal(ctx, linhas.map(mapearEstudante)),
    total,
    pagina: f.pagina,
    tamanho: f.tamanho,
    nominal,
    buscaPorNomeIgnorada,
  }
}
