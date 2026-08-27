'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import {
  camposComErroDe,
  lerTurmaDoFormulario,
  turmaSchema,
  type EstadoFormulario,
} from '@/modules/classes/schemas'
import { criarTurma } from '@/modules/classes/application/class-mutations'

/**
 * Server action de criação de turma. Escrevem ADMIN e ANALISTA.
 *
 * A escola selecionada no `<select>` é filtro: `criarTurma` a submete a
 * `assertSchoolInScope` antes de gravar. Um `schoolId` trocado no navegador resulta em 404,
 * não em turma criada na escola de outra rede.
 */
export async function criarTurmaAction(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = turmaSchema.safeParse(lerTurmaDoFormulario(formData))
  if (!parsed.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(parsed.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN', 'ANALISTA')
    await criarTurma(ctx, parsed.data)
  } catch (erro) {
    if (erro instanceof AppError) return { erro: erro.message }
    throw erro
  }

  revalidatePath('/turmas')
  redirect('/turmas')
}
