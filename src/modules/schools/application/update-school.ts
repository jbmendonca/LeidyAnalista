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
  schoolIdSchema,
  type EstadoFormulario,
} from '@/modules/schools/schemas'
import { atualizarEscola } from '@/modules/schools/application/school-mutations'

/**
 * Server action de edição de escola.
 *
 * O `schoolId` chega por campo oculto — e é tratado como **filtro**, não como autorização:
 * quem decide se aquela escola pode ser tocada é `assertSchoolInScope`, dentro de
 * `atualizarEscola`. Um identificador adulterado no navegador leva a 404, não a uma escrita
 * em escola alheia.
 */
export async function atualizarEscolaAction(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = schoolIdSchema.safeParse(formData.get('schoolId'))
  if (!id.success) {
    return { erro: 'Escola não informada.' }
  }

  const parsed = escolaSchema.safeParse(lerEscolaDoFormulario(formData))
  if (!parsed.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(parsed.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    await atualizarEscola(ctx, id.data, parsed.data)
  } catch (erro) {
    if (erro instanceof AppError) return { erro: erro.message }
    throw erro
  }

  revalidatePath('/escolas')
  revalidatePath(`/escolas/${id.data}/editar`)
  redirect('/escolas')
}
