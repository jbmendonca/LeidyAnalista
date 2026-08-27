import { NextResponse } from 'next/server'
import { getAuthContext } from '@/server/auth-context'
import { requireRole } from '@/server/authorization'
import { respostaDeErro, entradaInvalida } from '@/server/http-errors'
import { createImport } from '@/modules/imports/application/create-import'
import { runValidation } from '@/modules/imports/application/run-validation'
import { limiteTamanhoBytes } from '@/modules/imports/infra/file-storage'
import { env } from '@/lib/env'

export const runtime = 'nodejs'

/**
 * Upload do arquivo de resultados — passo 1 do pipeline.
 *
 * A validação de borda acontece antes de qualquer parsing: papel do usuário,
 * escopo da escola, extensão, MIME, assinatura de conteúdo e tamanho.
 * A validação do conteúdo vem em seguida, no `runValidation`, e escreve
 * apenas no estágio — nenhum resultado é persistido aqui.
 */
export async function POST(request: Request) {
  try {
    const ctx = requireRole(await getAuthContext(), 'ADMIN', 'ANALISTA')

    const form = await request.formData()
    const arquivo = form.get('arquivo')
    const assessmentId = form.get('assessmentId')
    const schoolId = form.get('schoolId')

    if (!(arquivo instanceof File)) {
      throw entradaInvalida({ arquivo: ['Selecione um arquivo.'] })
    }
    if (typeof assessmentId !== 'string' || assessmentId === '') {
      throw entradaInvalida({ assessmentId: ['Selecione a avaliação.'] })
    }
    if (typeof schoolId !== 'string' || schoolId === '') {
      // FR-028: a escola é obrigatória quando não vem no arquivo, e a fonte
      // atual não a traz.
      throw entradaInvalida({ schoolId: ['Selecione a escola.'] })
    }

    if (arquivo.size > limiteTamanhoBytes()) {
      return NextResponse.json(
        {
          erro: 'ARQUIVO_GRANDE_DEMAIS',
          mensagem: `O arquivo excede o limite de ${env.IMPORT_MAX_FILE_SIZE_MB} MB.`,
        },
        { status: 413 },
      )
    }

    const conteudo = Buffer.from(await arquivo.arrayBuffer())

    const { importId, jaImportadoAntes } = await createImport(ctx, {
      assessmentId,
      schoolId,
      nomeArquivo: arquivo.name,
      conteudo,
      ...(arquivo.type ? { mimeType: arquivo.type } : {}),
    })

    const validacao = await runValidation(importId)

    return NextResponse.json({ importId, jaImportadoAntes, validacao }, { status: 201 })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
