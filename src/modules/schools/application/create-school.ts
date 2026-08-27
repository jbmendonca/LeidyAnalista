'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import {
  camposComErroDe,
  escolaSchema,
  lerEscolaDoFormulario,
  type EstadoFormulario,
} from '@/modules/schools/schemas'
import { criarEscola } from '@/modules/schools/application/school-mutations'

/**
 * Server action de criação de escola.
 *
 * Ordem obrigatória: validar a entrada, resolver a identidade **no servidor** e só então
 * escrever. O perfil chega de `getAuthContext`, que lê o cookie de sessão — nunca de campo
 * do formulário, que o cliente controla.
 *
 * O `redirect` fica fora do `try`: ele sinaliza por exceção (`NEXT_REDIRECT`), e um `catch`
 * ao redor engoliria a navegação, deixando o usuário parado numa tela que já gravou.
 */
export async function criarEscolaAction(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = escolaSchema.safeParse(lerEscolaDoFormulario(formData))
  if (!parsed.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(parsed.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    await criarEscola(ctx, parsed.data)
  } catch (erro) {
    if (erro instanceof AppError) return { erro: erro.message }
    throw erro
  }

  revalidatePath('/escolas')
  redirect('/escolas')
}
