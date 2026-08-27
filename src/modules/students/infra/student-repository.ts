import { Prisma } from '@prisma/client'

import { prisma, type Tx } from '@/server/prisma'
import { conflito, naoEncontrado } from '@/server/http-errors'
import { assertSchoolInScope, schoolScopeFilter, type AuthContext } from '@/server/authorization'
import { gerarCodigoUnico } from '@/modules/students/domain/unique-code'

/**
 * Acesso a dados do cadastro de estudantes.
 *
 * Este arquivo NÃO é um módulo de Server Actions de propósito. Toda função daqui recebe o
 * `AuthContext` já resolvido no servidor; num arquivo `'use server'` cada função exportada
 * vira um endpoint chamável pelo navegador, e um `AuthContext` que chegasse pela borda
 * seria o cliente declarando o próprio escopo — exatamente o que a regra 2 da autorização
 * proíbe. As ações de formulário ficam em `application/actions.ts`, onde o contexto é
 * sempre lido do cookie de sessão.
 */

export const SELECAO_ESTUDANTE = {
  id: true,
  uniqueCode: true,
  nomeOriginal: true,
  codigoExterno: true,
  active: true,
  schoolId: true,
  classId: true,
  createdAt: true,
  school: { select: { id: true, name: true, code: true } },
  class: { select: { id: true, name: true, externalCode: true, anoEscolar: true } },
} satisfies Prisma.StudentSelect

type LinhaEstudante = Prisma.StudentGetPayload<{ select: typeof SELECAO_ESTUDANTE }>

/**
 * Forma achatada entregue às telas e às exportações.
 *
 * `nomeNormalizado` NÃO está aqui: ele serve a busca, duplicidade e vinculação assistida, e
 * não é exibido em nenhuma tela (FR-034). Deixá-lo fora do DTO é o que impede que apareça
 * numa coluna por descuido.
 */
export type EstudanteListado = Readonly<{
  id: string
  uniqueCode: string
  nomeOriginal: string
  codigoExterno: string | null
  active: boolean
  schoolId: string
  escolaNome: string
  escolaCodigo: string
  classId: string
  turmaNome: string
  turmaCodigo: string
  anoEscolar: string
}>

export function mapearEstudante(linha: LinhaEstudante): EstudanteListado {
  return {
    id: linha.id,
    uniqueCode: linha.uniqueCode,
    nomeOriginal: linha.nomeOriginal,
    codigoExterno: linha.codigoExterno,
    active: linha.active,
    schoolId: linha.schoolId,
    escolaNome: linha.school.name,
    escolaCodigo: linha.school.code,
    classId: linha.classId,
    turmaNome: linha.class.name,
    turmaCodigo: linha.class.externalCode,
    anoEscolar: linha.class.anoEscolar,
  }
}

/**
 * Filtro de escola pronto para o Prisma.
 *
 * `schoolScopeFilter` devolve `readonly string[]`; a cópia existe só para satisfazer a
 * assinatura mutável do cliente gerado, sem afrouxar o tipo do lado da autorização.
 */
export function filtroDeEscola(
  ctx: AuthContext,
  schoolId?: string | null,
): { in: string[] } {
  return { in: [...schoolScopeFilter(ctx, schoolId).in] }
}

/**
 * Confirma que a turma existe **e pertence à escola informada**, já validada no escopo.
 *
 * Turma de outra escola responde 404 e não 403: a diferença revelaria a existência de uma
 * escola que o usuário não pode ver (FR-006).
 */
export async function resolverTurmaNoEscopo(
  ctx: AuthContext,
  schoolId: string,
  classId: string,
  cliente: Tx = prisma,
): Promise<{ id: string; schoolId: string }> {
  const escola = assertSchoolInScope(ctx, schoolId)

  const turma = await cliente.class.findFirst({
    where: { id: classId, schoolId: escola },
    select: { id: true, schoolId: true },
  })

  if (!turma) throw naoEncontrado('Turma')
  return turma
}

/** Erro de unicidade do Prisma sobre a coluna do código único. */
export function ehColisaoDeCodigoUnico(erro: unknown): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (erro.code !== 'P2002') return false

  const alvo = erro.meta?.['target']
  if (Array.isArray(alvo)) return alvo.some((c) => String(c).includes('uniqueCode'))
  return String(alvo ?? '').includes('uniqueCode')
}

const TENTATIVAS_DE_CODIGO = 5

/**
 * Reserva `quantidade` códigos distintos entre si e ainda não usados no banco.
 *
 * Existe para o cadastro em lote: dentro de uma transação, uma violação de unicidade aborta
 * a transação inteira no PostgreSQL, de modo que a estratégia de "tentar de novo depois do
 * erro" — correta no cadastro individual — não se aplica. Aqui a verificação vem antes.
 *
 * A garantia final de unicidade continua sendo a restrição do banco: se uma criação
 * concorrente tomar um código entre a verificação e a escrita, a transação inteira falha e
 * nada é gravado pela metade.
 */
export async function reservarCodigosUnicos(
  quantidade: number,
  cliente: Tx = prisma,
): Promise<string[]> {
  if (quantidade <= 0) return []

  const reservados = new Set<string>()

  for (let rodada = 0; rodada < TENTATIVAS_DE_CODIGO; rodada++) {
    while (reservados.size < quantidade) reservados.add(gerarCodigoUnico())

    const candidatos = [...reservados]
    const emUso = await cliente.student.findMany({
      where: { uniqueCode: { in: candidatos } },
      select: { uniqueCode: true },
    })

    if (emUso.length === 0) return candidatos
    for (const registro of emUso) reservados.delete(registro.uniqueCode)
  }

  throw conflito(
    'Não foi possível reservar códigos únicos disponíveis. Tente novamente em instantes.',
  )
}
