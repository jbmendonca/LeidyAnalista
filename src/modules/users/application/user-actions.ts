'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import { logger } from '@/server/logger'
import {
  camposComErroDe,
  lerNovoUsuarioDoFormulario,
  novoUsuarioSchema,
  type EstadoUsuario,
} from '@/modules/users/schemas'
import {
  criarUsuario,
  definirPermissaoDadosNominais,
  definirSituacaoDoUsuario,
} from '@/modules/users/application/user-mutations'

/**
 * Fronteira de formulário da gestão de usuários.
 *
 * ÚNICO arquivo `'use server'` do módulo. Toda função exportada daqui é um endpoint que o
 * navegador pode chamar com os argumentos que quiser — por isso nenhuma delas recebe
 * `AuthContext`: todas resolvem a identidade do cookie de sessão, no servidor, e exigem
 * ADMIN antes de tocar em qualquer coisa. As funções que recebem contexto ficam em
 * `user-mutations.ts`, do outro lado desta fronteira.
 *
 * As ações de alternância recebem `FormData` diretamente (não `useActionState`) porque são
 * acionadas por `<form action={...}>` em componente de servidor: funcionam sem JavaScript no
 * cliente, que é o comportamento certo para um controle de permissão.
 */

function tratar(erro: unknown, contexto: string): EstadoUsuario {
  if (erro instanceof AppError) return { erro: erro.message }

  logger.error(`falha em ${contexto}`, {
    tipo: erro instanceof Error ? erro.name : typeof erro,
  })
  return { erro: 'Não foi possível concluir a operação. Tente novamente.' }
}

export async function criarUsuarioAction(
  _anterior: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const analisado = novoUsuarioSchema.safeParse(lerNovoUsuarioDoFormulario(formData))
  if (!analisado.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(analisado.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    await criarUsuario(ctx, analisado.data)
  } catch (erro) {
    return tratar(erro, 'criarUsuarioAction')
  }

  revalidatePath('/usuarios')
  // Fora do `try`: `redirect` sinaliza por exceção (`NEXT_REDIRECT`), e um `catch` ao redor
  // engoliria a navegação, deixando o usuário parado numa tela que já gravou.
  redirect('/usuarios')
}

function idDoFormulario(formData: FormData, campo: string): string {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor : ''
}

/** Alterna a permissão de dados nominais de um usuário — FR-007. */
export async function alternarPermissaoNominalAction(formData: FormData): Promise<void> {
  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    await definirPermissaoDadosNominais(
      ctx,
      idDoFormulario(formData, 'userId'),
      idDoFormulario(formData, 'conceder') === 'true',
    )
  } catch (erro) {
    // O resultado é relido da listagem; erro aqui vira log sem PII e a tela recarrega com o
    // estado real, que é a informação que importa para quem opera.
    logger.error('falha em alternarPermissaoNominalAction', {
      tipo: erro instanceof Error ? erro.name : typeof erro,
    })
  }

  revalidatePath('/usuarios')
}

/** Ativa ou desativa a conta — FR-005. */
export async function alternarSituacaoUsuarioAction(formData: FormData): Promise<void> {
  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    await definirSituacaoDoUsuario(
      ctx,
      idDoFormulario(formData, 'userId'),
      idDoFormulario(formData, 'ativar') === 'true',
    )
  } catch (erro) {
    logger.error('falha em alternarSituacaoUsuarioAction', {
      tipo: erro instanceof Error ? erro.name : typeof erro,
    })
  }

  revalidatePath('/usuarios')
}
