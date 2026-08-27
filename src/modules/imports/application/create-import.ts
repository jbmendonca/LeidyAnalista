import { ImportStatus } from '@prisma/client'
import { prisma } from '@/server/prisma'
import {
  arquivoGrandeDemais,
  entradaInvalida,
  naoEncontrado,
} from '@/server/http-errors'
import { assertSchoolInScope, type AuthContext } from '@/server/authorization'
import {
  calcularPrazoRetencao,
  guardarArquivo,
  limiteTamanhoBytes,
} from '@/modules/imports/infra/file-storage'
import {
  detectarFormato,
  validarExtensao,
} from '@/modules/imports/infra/format-detector'
import { env } from '@/lib/env'
import { logger } from '@/server/logger'

/**
 * Passo 1 do pipeline: recebe o arquivo, valida a borda e cria o registro.
 *
 * A validação acontece ANTES de qualquer parsing: extensão, tipo MIME quando o
 * navegador o fornece, assinatura de conteúdo e tamanho. Um arquivo fora do
 * padrão é recusado sem que uma linha sequer seja interpretada.
 *
 * A escola é obrigatória (FR-028) e passa por `assertSchoolInScope`: um
 * `schoolId` fora do escopo do usuário responde 404, nunca 403.
 */

export type EntradaUpload = Readonly<{
  assessmentId: string
  schoolId: string
  nomeArquivo: string
  conteudo: Buffer
  mimeType?: string | undefined
}>

export async function createImport(
  ctx: AuthContext,
  entrada: EntradaUpload,
): Promise<{ importId: string; jaImportadoAntes: boolean }> {
  assertSchoolInScope(ctx, entrada.schoolId)

  const avaliacao = await prisma.assessment.findUnique({
    where: { id: entrada.assessmentId },
    select: { id: true },
  })
  if (!avaliacao) throw naoEncontrado('Avaliação')

  if (!validarExtensao(entrada.nomeArquivo)) {
    throw entradaInvalida({
      arquivo: ['Formato não suportado. Envie um arquivo .csv, .xlsx ou .xls.'],
    })
  }

  if (entrada.conteudo.byteLength === 0) {
    throw entradaInvalida({ arquivo: ['O arquivo está vazio.'] })
  }

  if (entrada.conteudo.byteLength > limiteTamanhoBytes()) {
    throw arquivoGrandeDemais(env.IMPORT_MAX_FILE_SIZE_MB)
  }

  const formato = detectarFormato(
    entrada.nomeArquivo,
    entrada.conteudo,
    entrada.mimeType,
  )
  if (!formato) {
    throw entradaInvalida({
      arquivo: [
        'Não foi possível reconhecer o formato do arquivo. Verifique se ele não está corrompido.',
      ],
    })
  }

  const { hash, caminho } = await guardarArquivo(entrada.conteudo, entrada.nomeArquivo)

  // Mesmo conteúdo já confirmado para esta avaliação e escola: alerta, não
  // bloqueio. A regra que impede a duplicação de fato é a colisão de chave, na
  // validação (FR-148).
  const jaImportadoAntes =
    (await prisma.import.count({
      where: {
        assessmentId: entrada.assessmentId,
        schoolId: entrada.schoolId,
        fileHash: hash,
        status: ImportStatus.COMPLETED,
      },
    })) > 0

  const registro = await prisma.import.create({
    data: {
      assessmentId: entrada.assessmentId,
      schoolId: entrada.schoolId,
      fileName: entrada.nomeArquivo,
      fileHash: hash,
      fileSize: entrada.conteudo.byteLength,
      storagePath: caminho,
      fileRetainedUntil: calcularPrazoRetencao(),
      status: ImportStatus.UPLOADED,
      userId: ctx.userId,
    },
    select: { id: true },
  })

  logger.info('arquivo recebido para importação', {
    importId: registro.id,
    fileHash: hash,
    bytes: entrada.conteudo.byteLength,
    formato,
  })

  return { importId: registro.id, jaImportadoAntes }
}
