import { prisma } from '@/server/prisma'
import { escopoVazio, type AuthContext } from '@/server/authorization'
import { aplicarSupressaoNominalEm } from '@/server/nominal-data'
import {
  ehCodigoUnicoValido,
  normalizarCodigoUnico,
} from '@/modules/students/domain/unique-code'
import {
  SELECAO_ESTUDANTE,
  filtroDeEscola,
  mapearEstudante,
  type EstudanteListado,
} from '@/modules/students/infra/student-repository'

/**
 * Busca por código único — FR-133.
 *
 * O código digitado passa por `normalizarCodigoUnico`, que arruma espaços, caixa e hífen —
 * e **não** corrige símbolo ambíguo: uma "correção" silenciosa de `0` para `O` poderia
 * apontar para outro estudante, e o operador nunca saberia.
 *
 * Código fora do formato devolve `null` em vez de erro: quem digita o código de outro
 * sistema por engano precisa de "não encontrado", não de uma exceção.
 *
 * Estudante de escola fora do escopo também devolve `null` — o filtro de escola entra na
 * consulta, de modo que "existe mas você não pode ver" e "não existe" são indistinguíveis
 * daqui de fora (FR-006).
 */
export async function buscarEstudantePorCodigo(
  ctx: AuthContext,
  codigo: string,
): Promise<EstudanteListado | null> {
  if (escopoVazio(ctx)) return null

  const normalizado = normalizarCodigoUnico(codigo)
  if (!ehCodigoUnicoValido(normalizado)) return null

  const linha = await prisma.student.findFirst({
    where: { uniqueCode: normalizado, schoolId: filtroDeEscola(ctx) },
    select: SELECAO_ESTUDANTE,
  })

  if (!linha) return null

  return aplicarSupressaoNominalEm(ctx, mapearEstudante(linha))
}
