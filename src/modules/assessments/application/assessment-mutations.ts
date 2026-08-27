import type { Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { requireRole, type AuthContext } from '@/server/authorization'
import { conflito, naoEncontrado } from '@/server/http-errors'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import type { EntradaAvaliacao } from '@/modules/assessments/schemas'

/**
 * Núcleo transacional do cadastro de avaliações.
 *
 * Fora do arquivo `'use server'` pelo mesmo motivo do módulo de escolas: função que recebe
 * `AuthContext` por parâmetro não pode ser exportada de um módulo de server actions, onde
 * todo export vira endpoint público.
 *
 * `AuditAction` reaproveita `SETTINGS_CHANGE` — o enum do schema não tem verbo para cadastro
 * de referência e `prisma/` está fora do alcance desta fase. `entityType` e
 * `metadata.operacao` mantêm o registro legível.
 */

const ENTIDADE = 'Assessment'

/** `Date` não é JSON: a auditoria guarda ISO-8601, e ausência continua sendo `null`. */
function paraAuditoria(entrada: EntradaAvaliacao): Prisma.InputJsonValue {
  return {
    nome: entrada.nome,
    ano: entrada.ano,
    ciclo: entrada.ciclo,
    componenteCurricular: entrada.componenteCurricular,
    dataAplicacao: entrada.dataAplicacao ? entrada.dataAplicacao.toISOString() : null,
  }
}

export async function criarAvaliacao(
  ctx: AuthContext,
  entrada: EntradaAvaliacao,
): Promise<{ id: string }> {
  const autor = requireRole(ctx, 'ADMIN')

  return prisma.$transaction(async (tx) => {
    // Não há índice único para este conjunto no schema; a guarda é da aplicação. Ela existe
    // porque duas avaliações homônimas no mesmo ano tornam ambíguo todo painel derivado.
    const jaExiste = await tx.assessment.findFirst({
      where: {
        nome: entrada.nome,
        ano: entrada.ano,
        ciclo: entrada.ciclo,
        componenteCurricular: entrada.componenteCurricular,
      },
      select: { id: true },
    })
    if (jaExiste) {
      throw conflito('Já existe avaliação com este nome, ano, ciclo e componente.')
    }

    const avaliacao = await tx.assessment.create({
      data: {
        nome: entrada.nome,
        ano: entrada.ano,
        ciclo: entrada.ciclo,
        componenteCurricular: entrada.componenteCurricular,
        dataAplicacao: entrada.dataAplicacao,
      },
      select: { id: true },
    })

    await registrarAuditoria(tx, {
      action: 'SETTINGS_CHANGE',
      userId: autor.userId,
      entityType: ENTIDADE,
      entityId: avaliacao.id,
      assessmentId: avaliacao.id,
      afterValue: paraAuditoria(entrada),
      metadata: { operacao: 'CRIAR', entidade: ENTIDADE },
    })

    return { id: avaliacao.id }
  })
}

export async function atualizarAvaliacao(
  ctx: AuthContext,
  assessmentId: string,
  entrada: EntradaAvaliacao,
): Promise<{ id: string }> {
  const autor = requireRole(ctx, 'ADMIN')

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        nome: true,
        ano: true,
        ciclo: true,
        componenteCurricular: true,
        dataAplicacao: true,
      },
    })
    if (!anterior) throw naoEncontrado('Avaliação')

    const avaliacao = await tx.assessment.update({
      where: { id: assessmentId },
      data: {
        nome: entrada.nome,
        ano: entrada.ano,
        ciclo: entrada.ciclo,
        componenteCurricular: entrada.componenteCurricular,
        dataAplicacao: entrada.dataAplicacao,
      },
      select: { id: true },
    })

    await registrarAuditoria(tx, {
      action: 'SETTINGS_CHANGE',
      userId: autor.userId,
      entityType: ENTIDADE,
      entityId: avaliacao.id,
      assessmentId: avaliacao.id,
      beforeValue: {
        nome: anterior.nome,
        ano: anterior.ano,
        ciclo: anterior.ciclo,
        componenteCurricular: anterior.componenteCurricular,
        dataAplicacao: anterior.dataAplicacao
          ? anterior.dataAplicacao.toISOString()
          : null,
      },
      afterValue: paraAuditoria(entrada),
      metadata: { operacao: 'ATUALIZAR', entidade: ENTIDADE },
    })

    return { id: avaliacao.id }
  })
}
