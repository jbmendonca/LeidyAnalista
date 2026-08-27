import { Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import {
  assertSchoolInScope,
  requireRole,
  type AuthContext,
} from '@/server/authorization'
import { conflito, naoEncontrado } from '@/server/http-errors'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import type { EntradaEscola } from '@/modules/schools/schemas'

/**
 * Núcleo transacional do cadastro de escolas.
 *
 * Vive fora do arquivo `'use server'` de propósito. Em um módulo de server actions **todo**
 * export vira um endpoint alcançável pelo navegador; expor aqui uma função que recebe
 * `AuthContext` por parâmetro permitiria ao cliente declarar o próprio escopo. Estas funções
 * recebem `ctx` porque quem as chama já o resolveu no servidor — e por isso não podem morar
 * do outro lado daquela fronteira.
 *
 * Auditoria e escrita compartilham a mesma `$transaction` (Const. IV): auditoria gravada fora
 * dela sobreviveria a um rollback e descreveria um fato que não aconteceu.
 *
 * Sobre `AuditAction`: o enum do schema não tem verbo próprio para cadastro de referência e
 * `prisma/` está fora do alcance desta fase. `SETTINGS_CHANGE` é o registro usado, com
 * `entityType` e `metadata.operacao` distinguindo o que houve. Trocar por um verbo dedicado é
 * uma migração de uma linha quando o schema for reaberto.
 */

const ENTIDADE = 'School'

function violacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}

export async function criarEscola(
  ctx: AuthContext,
  entrada: EntradaEscola,
): Promise<{ id: string }> {
  const autor = requireRole(ctx, 'ADMIN')

  try {
    return await prisma.$transaction(async (tx) => {
      const escola = await tx.school.create({
        data: {
          code: entrada.code,
          name: entrada.name,
          rede: entrada.rede,
          municipio: entrada.municipio,
          estado: entrada.estado,
        },
        select: { id: true },
      })

      await registrarAuditoria(tx, {
        action: 'SETTINGS_CHANGE',
        userId: autor.userId,
        entityType: ENTIDADE,
        entityId: escola.id,
        schoolId: escola.id,
        afterValue: { ...entrada },
        metadata: { operacao: 'CRIAR', entidade: ENTIDADE },
      })

      return { id: escola.id }
    })
  } catch (erro) {
    if (violacaoDeUnicidade(erro)) {
      throw conflito('Já existe escola cadastrada com este código.')
    }
    throw erro
  }
}

export async function atualizarEscola(
  ctx: AuthContext,
  schoolId: string,
  entrada: EntradaEscola,
): Promise<{ id: string }> {
  const autor = requireRole(ctx, 'ADMIN')
  const idNoEscopo = assertSchoolInScope(autor, schoolId)

  try {
    return await prisma.$transaction(async (tx) => {
      const anterior = await tx.school.findUnique({
        where: { id: idNoEscopo },
        select: {
          code: true,
          name: true,
          rede: true,
          municipio: true,
          estado: true,
        },
      })
      if (!anterior) throw naoEncontrado('Escola')

      const escola = await tx.school.update({
        where: { id: idNoEscopo },
        data: {
          code: entrada.code,
          name: entrada.name,
          rede: entrada.rede,
          municipio: entrada.municipio,
          estado: entrada.estado,
        },
        select: { id: true },
      })

      await registrarAuditoria(tx, {
        action: 'SETTINGS_CHANGE',
        userId: autor.userId,
        entityType: ENTIDADE,
        entityId: escola.id,
        schoolId: escola.id,
        beforeValue: { ...anterior },
        afterValue: { ...entrada },
        metadata: { operacao: 'ATUALIZAR', entidade: ENTIDADE },
      })

      return { id: escola.id }
    })
  } catch (erro) {
    if (violacaoDeUnicidade(erro)) {
      throw conflito('Já existe escola cadastrada com este código.')
    }
    throw erro
  }
}
