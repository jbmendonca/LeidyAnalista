import type { AuditAction, Prisma } from '@prisma/client'
import type { Tx } from '@/server/prisma'
import { prisma } from '@/server/prisma'

/**
 * Trilha de auditoria — FR-117, FR-120, Const. IV.
 *
 * Duas regras estruturais:
 *
 *  1. Referencia SEMPRE por identificador. Não existe campo de nome aqui, e o
 *     tipo de `metadata` é fechado o suficiente para que colocar um nome exija
 *     uma decisão consciente e visível em revisão.
 *  2. Só existe escrita. Não há função de alteração nem de remoção — o registro
 *     de auditoria que pode ser editado não é auditoria.
 */

export type EntradaAuditoria = Readonly<{
  action: AuditAction
  userId: string
  entityType: string
  entityId: string
  schoolId?: string | null
  assessmentId?: string | null
  beforeValue?: Prisma.InputJsonValue | undefined
  afterValue?: Prisma.InputJsonValue | undefined
  metadata?: Prisma.InputJsonValue | undefined
}>

/**
 * Registra na transação recebida. Passar a transação é o padrão: auditoria
 * gravada fora da transação da escrita pode sobreviver a um rollback e
 * descrever um fato que não aconteceu.
 */
export async function registrarAuditoria(
  tx: Tx,
  entrada: EntradaAuditoria,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: entrada.action,
      userId: entrada.userId,
      entityType: entrada.entityType,
      entityId: entrada.entityId,
      schoolId: entrada.schoolId ?? null,
      assessmentId: entrada.assessmentId ?? null,
      ...(entrada.beforeValue !== undefined ? { beforeValue: entrada.beforeValue } : {}),
      ...(entrada.afterValue !== undefined ? { afterValue: entrada.afterValue } : {}),
      ...(entrada.metadata !== undefined ? { metadata: entrada.metadata } : {}),
    },
  })
}

/** Atalho para quando não há transação em curso. */
export async function registrarAuditoriaAvulsa(
  entrada: EntradaAuditoria,
): Promise<void> {
  await registrarAuditoria(prisma, entrada)
}
