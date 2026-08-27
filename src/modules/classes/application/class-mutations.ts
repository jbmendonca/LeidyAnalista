import { Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { assertSchoolInScope, requireRole, type AuthContext } from '@/server/authorization'
import { conflito, naoEncontrado } from '@/server/http-errors'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { normalizeClassCode } from '@/modules/classes/domain/normalize-class-code'
import type { EntradaTurma } from '@/modules/classes/schemas'

/**
 * Núcleo transacional do cadastro de turmas. ADMIN e ANALISTA escrevem; ESCOLA não.
 *
 * Duas decisões estruturais:
 *
 *  1. `normalizeClassCode` é reaplicado aqui, ainda que o schema Zod já normalize. Não é
 *     redundância inútil: esta é a última linha antes do banco, e o índice único
 *     `(schoolId, externalCode)` só cumpre seu papel se **todo** caminho de escrita gravar a
 *     forma normalizada. Um chamador futuro que pule o schema não pode corromper o índice.
 *  2. A unicidade é decidida pelo banco, não por um `findFirst` prévio. Entre a consulta e a
 *     escrita cabe outra transação: só a violação P2002 é prova de duplicidade.
 */

const ENTIDADE = 'Class'

const PERFIS_QUE_ESCREVEM = ['ADMIN', 'ANALISTA'] as const

function duplicidadeDeCodigo(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}

const MENSAGEM_DUPLICADA = 'Já existe turma com este código nesta escola.'

export async function criarTurma(
  ctx: AuthContext,
  entrada: EntradaTurma,
): Promise<{ id: string }> {
  const autor = requireRole(ctx, ...PERFIS_QUE_ESCREVEM)
  const schoolId = assertSchoolInScope(autor, entrada.schoolId)
  const externalCode = normalizeClassCode(entrada.externalCode)

  try {
    return await prisma.$transaction(async (tx) => {
      const turma = await tx.class.create({
        data: {
          schoolId,
          externalCode,
          name: entrada.name,
          anoEscolar: entrada.anoEscolar,
        },
        select: { id: true },
      })

      await registrarAuditoria(tx, {
        action: 'SETTINGS_CHANGE',
        userId: autor.userId,
        entityType: ENTIDADE,
        entityId: turma.id,
        schoolId,
        afterValue: {
          schoolId,
          externalCode,
          name: entrada.name,
          anoEscolar: entrada.anoEscolar,
        },
        metadata: { operacao: 'CRIAR', entidade: ENTIDADE },
      })

      return { id: turma.id }
    })
  } catch (erro) {
    if (duplicidadeDeCodigo(erro)) throw conflito(MENSAGEM_DUPLICADA)
    throw erro
  }
}

export async function atualizarTurma(
  ctx: AuthContext,
  classId: string,
  entrada: EntradaTurma,
): Promise<{ id: string }> {
  const autor = requireRole(ctx, ...PERFIS_QUE_ESCREVEM)
  // Escola de destino no escopo. A de origem é conferida pelo `where` da leitura abaixo, de
  // modo que mover uma turma exige permissão nas duas pontas.
  const schoolId = assertSchoolInScope(autor, entrada.schoolId)
  const externalCode = normalizeClassCode(entrada.externalCode)

  try {
    return await prisma.$transaction(async (tx) => {
      const anterior = await tx.class.findFirst({
        where: { id: classId, schoolId: { in: [...autor.allowedSchoolIds] } },
        select: { id: true, schoolId: true, externalCode: true, name: true, anoEscolar: true },
      })
      if (!anterior) throw naoEncontrado('Turma')

      const turma = await tx.class.update({
        where: { id: anterior.id },
        data: {
          schoolId,
          externalCode,
          name: entrada.name,
          anoEscolar: entrada.anoEscolar,
        },
        select: { id: true },
      })

      await registrarAuditoria(tx, {
        action: 'SETTINGS_CHANGE',
        userId: autor.userId,
        entityType: ENTIDADE,
        entityId: turma.id,
        schoolId,
        beforeValue: {
          schoolId: anterior.schoolId,
          externalCode: anterior.externalCode,
          name: anterior.name,
          anoEscolar: anterior.anoEscolar,
        },
        afterValue: {
          schoolId,
          externalCode,
          name: entrada.name,
          anoEscolar: entrada.anoEscolar,
        },
        metadata: { operacao: 'ATUALIZAR', entidade: ENTIDADE },
      })

      return { id: turma.id }
    })
  } catch (erro) {
    if (duplicidadeDeCodigo(erro)) throw conflito(MENSAGEM_DUPLICADA)
    throw erro
  }
}
