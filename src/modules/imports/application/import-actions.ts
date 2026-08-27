'use server'

import { revalidatePath } from 'next/cache'
import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { AppError } from '@/server/http-errors'
import { confirmImport } from './confirm-import'
import { deleteImport, expurgarArquivoDeImportacao } from './delete-import'
import { runValidation } from './run-validation'

/**
 * Server Actions da importação. Cada uma resolve o `AuthContext` no servidor —
 * nenhuma confia em identidade ou papel vindos do cliente.
 */

export type EstadoAcao = {
  erro?: string
  sucesso?: string
}

export async function revalidarImportacao(
  _anterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  try {
    requireRole(await getAuthContext(), 'ADMIN', 'ANALISTA')
    const importId = String(formData.get('importId'))
    const r = await runValidation(importId)
    revalidatePath(`/importacoes/${importId}`)
    return {
      sucesso: `Validação concluída: ${r.totalRows} registros, ${r.errorCount} erro(s) e ${r.warningCount} alerta(s).`,
    }
  } catch (erro) {
    return { erro: mensagemDe(erro) }
  }
}

export async function confirmarImportacao(
  _anterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN', 'ANALISTA')
    const importId = String(formData.get('importId'))

    // Cadastrar quem não está na base é ação EXPLÍCITA do usuário (FR-172).
    // Sem a marcação, a confirmação é recusada em vez de descartar linhas.
    const cadastrarNaoEncontrados = formData.get('cadastrarNaoEncontrados') === 'on'

    const r = await confirmImport(ctx, importId, { cadastrarNaoEncontrados })

    revalidatePath('/importacoes')
    revalidatePath(`/importacoes/${importId}`)
    revalidatePath('/avaliacoes')

    return {
      sucesso:
        `Importação confirmada: ${r.persistidos} registros persistidos` +
        (r.estudantesCriados > 0 ? `, ${r.estudantesCriados} estudante(s) cadastrado(s)` : '') +
        (r.turmasCriadas > 0 ? `, ${r.turmasCriadas} turma(s) criada(s)` : '') +
        '.',
    }
  } catch (erro) {
    return { erro: mensagemDe(erro) }
  }
}

export async function excluirImportacao(
  _anterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    const importId = String(formData.get('importId'))
    const r = await deleteImport(ctx, importId)

    revalidatePath('/importacoes')
    revalidatePath('/avaliacoes')

    return {
      sucesso: `Importação excluída. ${r.resultadosRemovidos} resultado(s) removido(s). O histórico e a auditoria foram preservados.`,
    }
  } catch (erro) {
    return { erro: mensagemDe(erro) }
  }
}

export async function expurgarArquivo(
  _anterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN')
    const importId = String(formData.get('importId'))
    await expurgarArquivoDeImportacao(ctx, importId)

    revalidatePath(`/importacoes/${importId}`)
    return {
      sucesso:
        'Arquivo original excluído. O hash, as contagens e a auditoria permanecem, e continuam provando o que foi importado.',
    }
  } catch (erro) {
    return { erro: mensagemDe(erro) }
  }
}

function mensagemDe(erro: unknown): string {
  if (erro instanceof AppError) return erro.message
  return 'Não foi possível concluir a operação.'
}
