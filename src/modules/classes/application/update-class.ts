'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import {
  camposComErroDe,
  classIdSchema,
  lerTurmaDoFormulario,
  turmaSchema,
  type EstadoFormulario,
} from '@/modules/classes/schemas'
import { atualizarTurma } from '@/modules/classes/application/class-mutations'

/** Server action de edição de turma. O identificador chega por campo oculto e é validado. */
export async function atualizarTurmaAction(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = classIdSchema.safeParse(formData.get('classId'))
  if (!id.success) {
    return { erro: 'Turma não informada.' }
  }

  const parsed = turmaSchema.safeParse(lerTurmaDoFormulario(formData))
  if (!parsed.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(parsed.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN', 'ANALISTA')
    await atualizarTurma(ctx, id.data, parsed.data)
  } catch (erro) {
    if (erro instanceof AppError) return { erro: erro.message }
    throw erro
  }

  revalidatePath('/turmas')
  redirect('/turmas')
}
