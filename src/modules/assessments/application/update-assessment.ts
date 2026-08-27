'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import {
  assessmentIdSchema,
  avaliacaoSchema,
  camposComErroDe,
  lerAvaliacaoDoFormulario,
  type EstadoFormulario,
} from '@/modules/assessments/schemas'
import { atualizarAvaliacao } from '@/modules/assessments/application/assessment-mutations'

/** Server action de edição de avaliação. O identificador chega por campo oculto e é validado. */
export async function atualizarAvaliacaoAction(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = assessmentIdSchema.safeParse(formData.get('assessmentId'))
  if (!id.success) {
    return { erro: 'Avaliação não informada.' }
  }

  const parsed = avaliacaoSchema.safeParse(lerAvaliacaoDoFormulario(formData))
  if (!parsed.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(parsed.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    await atualizarAvaliacao(ctx, id.data, parsed.data)
  } catch (erro) {
    if (erro instanceof AppError) return { erro: erro.message }
    throw erro
  }

  revalidatePath('/avaliacoes')
  redirect('/avaliacoes')
}
