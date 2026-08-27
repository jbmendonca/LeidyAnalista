'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/server/auth-context'
import { requireUser } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import { env } from '@/lib/env'
import { logger } from '@/server/logger'
import { criarEstudante } from './create-student'
import { atualizarEstudante } from './update-student'
import { importarNominata, type RelatorioNominata } from './import-roster'

/**
 * Fronteira de formulário do módulo de estudantes.
 *
 * Este é o ÚNICO arquivo `'use server'` do módulo, e é assim de propósito: em Next, toda
 * função assíncrona exportada de um arquivo com essa diretiva vira um endpoint chamável pelo
 * navegador com os argumentos que o cliente quiser. Se as funções que recebem `AuthContext`
 * morassem aqui, um cliente poderia inventar o próprio escopo de escolas e a autorização
 * inteira cairia. Por isso as ações abaixo não recebem contexto: elas o resolvem do cookie
 * de sessão, no servidor, e só então chamam a camada de aplicação.
 */

export type EstadoEstudante = {
  erro?: string
  detalhes?: Record<string, string[]>
  criado?: { uniqueCode: string }
  atualizado?: { uniqueCode: string }
}

export type EstadoNominata = {
  erro?: string
  detalhes?: Record<string, string[]>
  relatorio?: RelatorioNominata
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor : ''
}

function tratar(erro: unknown, contexto: string): { erro: string; detalhes?: Record<string, string[]> } {
  if (erro instanceof AppError) {
    return {
      erro: erro.message,
      ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
    }
  }
  // A mensagem crua de uma falha inesperada pode carregar dado da consulta; o usuário recebe
  // um texto neutro e o diagnóstico fica no log, sem PII.
  logger.error(`falha em ${contexto}`, {
    tipo: erro instanceof Error ? erro.name : typeof erro,
  })
  return { erro: 'Não foi possível concluir a operação. Tente novamente.' }
}

export async function criarEstudanteAction(
  _anterior: EstadoEstudante,
  formData: FormData,
): Promise<EstadoEstudante> {
  try {
    const ctx = requireUser(await getAuthContext())

    const estudante = await criarEstudante(ctx, {
      schoolId: texto(formData, 'schoolId'),
      classId: texto(formData, 'classId'),
      nomeOriginal: texto(formData, 'nomeOriginal'),
      codigoExterno: texto(formData, 'codigoExterno'),
    })

    revalidatePath('/estudantes')
    return { criado: { uniqueCode: estudante.uniqueCode } }
  } catch (erro) {
    return tratar(erro, 'criarEstudanteAction')
  }
}

export async function atualizarEstudanteAction(
  _anterior: EstadoEstudante,
  formData: FormData,
): Promise<EstadoEstudante> {
  try {
    const ctx = requireUser(await getAuthContext())

    const estudante = await atualizarEstudante(ctx, {
      id: texto(formData, 'id'),
      schoolId: texto(formData, 'schoolId'),
      classId: texto(formData, 'classId'),
      nomeOriginal: texto(formData, 'nomeOriginal'),
      codigoExterno: texto(formData, 'codigoExterno'),
    })

    revalidatePath('/estudantes')
    return { atualizado: { uniqueCode: estudante.uniqueCode } }
  } catch (erro) {
    return tratar(erro, 'atualizarEstudanteAction')
  }
}

export async function importarNominataAction(
  _anterior: EstadoNominata,
  formData: FormData,
): Promise<EstadoNominata> {
  try {
    const ctx = requireUser(await getAuthContext())

    const arquivo = formData.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return { erro: 'Selecione o arquivo da nominata.' }
    }

    const limiteBytes = env.IMPORT_MAX_FILE_SIZE_MB * 1024 * 1024
    if (arquivo.size > limiteBytes) {
      return { erro: `O arquivo excede o limite de ${env.IMPORT_MAX_FILE_SIZE_MB} MB.` }
    }

    const schoolId = texto(formData, 'schoolId')

    const relatorio = await importarNominata(ctx, {
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
      nomeArquivo: arquivo.name,
      schoolId: schoolId === '' ? null : schoolId,
    })

    if (relatorio.aplicado) revalidatePath('/estudantes')
    return { relatorio }
  } catch (erro) {
    return tratar(erro, 'importarNominataAction')
  }
}
