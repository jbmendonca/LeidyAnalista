'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import {
  avaliacaoSchema,
  camposComErroDe,
  lerAvaliacaoDoFormulario,
  type EstadoFormulario,
} from '@/modules/assessments/schemas'
import { criarAvaliacao } from '@/modules/assessments/application/assessment-mutations'

/**
 * Server action de criação de avaliação. Só ADMIN escreve; o perfil vem da sessão resolvida
 * no servidor, jamais de campo enviado pelo navegador.
 */
export async function criarAvaliacaoAction(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = avaliacaoSchema.safeParse(lerAvaliacaoDoFormulario(formData))
  if (!parsed.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(parsed.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    await criarAvaliacao(ctx, parsed.data)
  } catch (erro) {
    if (erro instanceof AppError) return { erro: erro.message }
    throw erro
  }

  revalidatePath('/avaliacoes')
  redirect('/avaliacoes')
}
