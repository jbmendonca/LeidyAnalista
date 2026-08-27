import { prisma } from '@/server/prisma'
import { naoEncontrado } from '@/server/http-errors'
import { requireRole, type AuthContext } from '@/server/authorization'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { recalcularDenominadoresDeReferencia } from '@/modules/skills/application/resolve-reference-items'
import { expurgarArquivo } from '@/modules/imports/infra/file-storage'
import { logger } from '@/server/logger'

/**
 * Exclusão de importação — FR-118, FR-153.
 *
 * Privativa do Administrador. Remove os resultados e recalcula os
 * denominadores de referência afetados, mas **preserva `Import`,
 * `ImportIssue` e `AuditLog`**: o registro do que aconteceu não desaparece
 * junto com o dado.
 *
 * É por aqui que se substitui uma carga: a reimportação do mesmo par
 * avaliação + escola é bloqueada pela colisão de chave, e a via de correção é
 * excluir e reenviar o arquivo corrigido.
 */
export async function deleteImport(
  ctx: AuthContext,
  importId: string,
): Promise<{ resultadosRemovidos: number }> {
  requireRole(ctx, 'ADMIN')

  const registro = await prisma.import.findUnique({
    where: { id: importId },
    select: {
      id: true,
      assessmentId: true,
      schoolId: true,
      storagePath: true,
      fileHash: true,
      filePurgedAt: true,
    },
  })
  if (!registro) throw naoEncontrado('Importação')

  const resultado = await prisma.$transaction(async (tx) => {
    // Os resultados por habilidade caem por cascata (onDelete: Cascade).
    const removidos = await tx.assessmentStudentResult.deleteMany({
      where: { importId },
    })

    await tx.importRow.deleteMany({ where: { importId } })

    await recalcularDenominadoresDeReferencia(tx, registro.assessmentId)

    await tx.import.update({
      where: { id: importId },
      data: { status: 'FAILED', failureReason: 'Importação excluída pelo administrador.' },
    })

    await registrarAuditoria(tx, {
      action: 'IMPORT_DELETE',
      userId: ctx.userId,
      entityType: 'Import',
      entityId: importId,
      schoolId: registro.schoolId,
      assessmentId: registro.assessmentId,
      metadata: {
        fileHash: registro.fileHash,
        resultadosRemovidos: removidos.count,
      },
    })

    return { resultadosRemovidos: removidos.count }
  })

  logger.info('importação excluída', {
    importId,
    resultadosRemovidos: resultado.resultadosRemovidos,
  })

  return resultado
}

/**
 * Expurgo do arquivo original — FR-038a a FR-038c.
 *
 * O conteúdo com nomes de crianças some; o hash, as contagens e a auditoria
 * permanecem. Depois disso o sistema continua provando **qual** conteúdo foi
 * importado, sem guardar nome algum.
 */
export async function expurgarArquivosVencidos(
  agora = new Date(),
): Promise<{ expurgados: number }> {
  const vencidos = await prisma.import.findMany({
    where: {
      filePurgedAt: null,
      storagePath: { not: null },
      fileRetainedUntil: { lte: agora },
    },
    select: { id: true, storagePath: true, schoolId: true, assessmentId: true },
  })

  for (const v of vencidos) {
    if (v.storagePath) await expurgarArquivo(v.storagePath)
    await prisma.import.update({
      where: { id: v.id },
      data: { storagePath: null, filePurgedAt: agora },
    })
  }

  if (vencidos.length > 0) {
    logger.info('arquivos de importação expurgados por prazo de retenção', {
      quantidade: vencidos.length,
    })
  }

  return { expurgados: vencidos.length }
}

/** Expurgo antecipado, por decisão do Administrador (FR-038c). */
export async function expurgarArquivoDeImportacao(
  ctx: AuthContext,
  importId: string,
): Promise<void> {
  requireRole(ctx, 'ADMIN')

  const registro = await prisma.import.findUnique({
    where: { id: importId },
    select: { id: true, storagePath: true, schoolId: true, assessmentId: true, fileHash: true },
  })
  if (!registro) throw naoEncontrado('Importação')
  if (!registro.storagePath) return

  await expurgarArquivo(registro.storagePath)

  await prisma.$transaction(async (tx) => {
    await tx.import.update({
      where: { id: importId },
      data: { storagePath: null, filePurgedAt: new Date() },
    })
    await registrarAuditoria(tx, {
      action: 'IMPORT_FILE_PURGE',
      userId: ctx.userId,
      entityType: 'Import',
      entityId: importId,
      schoolId: registro.schoolId,
      assessmentId: registro.assessmentId,
      metadata: { fileHash: registro.fileHash, antecipado: true },
    })
  })
}
