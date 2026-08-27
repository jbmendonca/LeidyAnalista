'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import { logger } from '@/server/logger'
import {
  camposComErroDe,
  criteriosSchema,
  lerCriteriosDoFormulario,
  type EstadoCriterios,
} from '@/modules/settings/schemas'
import { criarVersaoDeCriterios } from '@/modules/settings/application/create-version'

/**
 * Fronteira de formulário dos critérios analíticos.
 *
 * Este é o ÚNICO arquivo `'use server'` do módulo, e é assim de propósito: em Next, toda
 * função assíncrona exportada de um arquivo com essa diretiva vira um endpoint chamável pelo
 * navegador com os argumentos que o cliente escolher. `criarVersaoDeCriterios` recebe
 * `AuthContext` por parâmetro — se morasse aqui, um cliente poderia enviar
 * `{ role: 'ADMIN' }` e configurar as faixas de toda a rede. Por isso ela fica em
 * `create-version.ts`, e a ação abaixo resolve a identidade do cookie de sessão, no servidor.
 *
 * Mesmo padrão de `src/modules/schools/application/school-mutations.ts`.
 */
export async function criarVersaoDeCriteriosAction(
  _anterior: EstadoCriterios,
  formData: FormData,
): Promise<EstadoCriterios> {
  const analisado = criteriosSchema.safeParse(lerCriteriosDoFormulario(formData))
  if (!analisado.success) {
    return {
      erro: 'Verifique os campos destacados.',
      camposComErro: camposComErroDe(analisado.error),
    }
  }

  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    const criada = await criarVersaoDeCriterios(ctx, analisado.data)

    revalidatePath('/configuracoes')
    revalidatePath('/configuracoes/historico')

    return { versaoCriada: criada.version }
  } catch (erro) {
    if (erro instanceof AppError) return { erro: erro.message }

    // A mensagem crua de uma falha inesperada pode carregar dado da consulta; o usuário
    // recebe texto neutro e o diagnóstico fica no log, sem PII.
    logger.error('falha em criarVersaoDeCriteriosAction', {
      tipo: erro instanceof Error ? erro.name : typeof erro,
    })
    return { erro: 'Não foi possível gravar os critérios. Tente novamente.' }
  }
}
