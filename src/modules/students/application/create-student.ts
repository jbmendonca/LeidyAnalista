import { prisma } from '@/server/prisma'
import { conflito, entradaInvalida } from '@/server/http-errors'
import type { AuthContext } from '@/server/authorization'
import { logger } from '@/server/logger'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { gerarCodigoUnico } from '@/modules/students/domain/unique-code'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import { criarEstudanteSchema } from '@/modules/students/schemas'
import {
  SELECAO_ESTUDANTE,
  ehColisaoDeCodigoUnico,
  mapearEstudante,
  resolverTurmaNoEscopo,
  type EstudanteListado,
} from '@/modules/students/infra/student-repository'

/**
 * Criação de estudante — FR-128, FR-136, FR-168, FR-169.
 *
 * Só existe estudante por ação explícita de quem opera o sistema: a importação de
 * resultados reconhece estudantes, não os cria (FR-143). Esta função é o único caminho de
 * criação individual, e a origem do cadastro fica registrada em auditoria para que a regra
 * seja verificável depois.
 *
 * O código único nasce aqui, na criação (FR-169), e nunca mais muda (FR-129).
 */

export type OrigemCadastro =
  'CADASTRO_INDIVIDUAL' | 'NOMINATA' | 'PRE_VISUALIZACAO_IMPORTACAO'

/** A unicidade é garantida pela restrição do banco; a aleatoriedade só a torna improvável. */
const TENTATIVAS = 5

export async function criarEstudante(
  ctx: AuthContext,
  entrada: unknown,
  opcoes?: Readonly<{ origem?: OrigemCadastro }>,
): Promise<EstudanteListado> {
  const analise = criarEstudanteSchema.safeParse(entrada)
  if (!analise.success) {
    throw entradaInvalida(analise.error.flatten().fieldErrors as Record<string, string[]>)
  }

  const dados = analise.data
  const origem = opcoes?.origem ?? 'CADASTRO_INDIVIDUAL'

  // Autorização antes de qualquer escrita: a turma precisa existir e pertencer a uma escola
  // do escopo do usuário. Fora dele, 404.
  await resolverTurmaNoEscopo(ctx, dados.schoolId, dados.classId)

  const nomeNormalizado = normalizeStudentName(dados.nomeOriginal)

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const uniqueCode = gerarCodigoUnico()

    try {
      const criado = await prisma.$transaction(async (tx) => {
        const estudante = await tx.student.create({
          data: {
            uniqueCode,
            schoolId: dados.schoolId,
            classId: dados.classId,
            nomeOriginal: dados.nomeOriginal,
            nomeNormalizado,
            codigoExterno: dados.codigoExterno,
          },
          select: SELECAO_ESTUDANTE,
        })

        // Mesma transação que a escrita: auditoria gravada fora dela sobreviveria a um
        // rollback e descreveria um cadastro que não existe (Const. IV).
        await registrarAuditoria(tx, {
          action: 'STUDENT_CREATE',
          userId: ctx.userId,
          entityType: 'Student',
          entityId: estudante.id,
          schoolId: estudante.schoolId,
          afterValue: {
            uniqueCode: estudante.uniqueCode,
            schoolId: estudante.schoolId,
            classId: estudante.classId,
            codigoExterno: estudante.codigoExterno,
          },
          metadata: { origem },
        })

        return estudante
      })

      // `uniqueCode` pode ir para log: não é derivado de dado pessoal (FR-131).
      logger.info('estudante cadastrado', {
        uniqueCode: criado.uniqueCode,
        schoolId: criado.schoolId,
        origem,
      })

      return mapearEstudante(criado)
    } catch (erro) {
      if (ehColisaoDeCodigoUnico(erro) && tentativa < TENTATIVAS) continue
      if (ehColisaoDeCodigoUnico(erro)) {
        throw conflito(
          'Não foi possível gerar um código único disponível. Tente novamente.',
        )
      }
      throw erro
    }
  }

  /* c8 ignore next */
  throw conflito('Não foi possível gerar um código único disponível. Tente novamente.')
}
