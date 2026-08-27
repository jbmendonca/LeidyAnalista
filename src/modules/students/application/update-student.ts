import { prisma } from '@/server/prisma'
import { entradaInvalida, naoEncontrado } from '@/server/http-errors'
import type { AuthContext } from '@/server/authorization'
import { logger } from '@/server/logger'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import { editarEstudanteSchema } from '@/modules/students/schemas'
import {
  SELECAO_ESTUDANTE,
  filtroDeEscola,
  mapearEstudante,
  resolverTurmaNoEscopo,
  type EstudanteListado,
} from '@/modules/students/infra/student-repository'

/**
 * Correção de dados cadastrais — FR-177, FR-178.
 *
 * A regra que governa esta função: **nenhum resultado de avaliação é tocado**. Corrigir o
 * nome de uma criança, mudá-la de turma ou de escola são fatos do cadastro; o que foi
 * importado e confirmado é fato da avaliação, e cada linha de `AssessmentStudentResult`
 * guarda a turma e a escola de quando foi importada. Propagar a mudança para lá reescreveria
 * o passado — o desempenho de uma turma mudaria retroativamente porque uma criança foi
 * transferida depois da prova. Por isso o `update` abaixo alcança exclusivamente a tabela
 * `student`, e o `uniqueCode` não aparece entre os campos graváveis (FR-129).
 */
export async function atualizarEstudante(
  ctx: AuthContext,
  entrada: unknown,
): Promise<EstudanteListado> {
  const analise = editarEstudanteSchema.safeParse(entrada)
  if (!analise.success) {
    throw entradaInvalida(analise.error.flatten().fieldErrors as Record<string, string[]>)
  }

  const dados = analise.data

  // O estudante precisa estar hoje dentro do escopo de quem edita; do contrário, 404.
  const atual = await prisma.student.findFirst({
    where: { id: dados.id, schoolId: filtroDeEscola(ctx) },
    select: SELECAO_ESTUDANTE,
  })
  if (!atual) throw naoEncontrado('Estudante')

  // E a turma de destino precisa existir na escola de destino, também no escopo.
  await resolverTurmaNoEscopo(ctx, dados.schoolId, dados.classId)

  const nomeNormalizado = normalizeStudentName(dados.nomeOriginal)

  const atualizado = await prisma.$transaction(async (tx) => {
    const registro = await tx.student.update({
      where: { id: atual.id },
      data: {
        nomeOriginal: dados.nomeOriginal,
        nomeNormalizado,
        schoolId: dados.schoolId,
        classId: dados.classId,
        codigoExterno: dados.codigoExterno,
      },
      select: SELECAO_ESTUDANTE,
    })

    await registrarAuditoria(tx, {
      action: 'STUDENT_UPDATE',
      userId: ctx.userId,
      entityType: 'Student',
      entityId: registro.id,
      schoolId: registro.schoolId,
      // Auditoria referencia por identificador (Const. IV): o registro diz que o nome mudou,
      // não qual era o nome.
      beforeValue: {
        uniqueCode: atual.uniqueCode,
        schoolId: atual.schoolId,
        classId: atual.classId,
        codigoExterno: atual.codigoExterno,
      },
      afterValue: {
        uniqueCode: registro.uniqueCode,
        schoolId: registro.schoolId,
        classId: registro.classId,
        codigoExterno: registro.codigoExterno,
      },
      metadata: {
        nomeAlterado: atual.nomeOriginal !== registro.nomeOriginal,
        turmaAlterada: atual.classId !== registro.classId,
        escolaAlterada: atual.schoolId !== registro.schoolId,
      },
    })

    return registro
  })

  logger.info('cadastro de estudante atualizado', {
    uniqueCode: atualizado.uniqueCode,
    schoolId: atualizado.schoolId,
  })

  return mapearEstudante(atualizado)
}
