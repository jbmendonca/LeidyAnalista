import { prisma } from '@/server/prisma'
import { conflito, naoEncontrado } from '@/server/http-errors'
import { assertSchoolInScope, requireRole, type AuthContext } from '@/server/authorization'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { logger } from '@/server/logger'

/**
 * Proteção contra exclusão de entidade com resultados vinculados — FR-018.
 *
 * O risco que isto evita é concreto: apagar uma escola ou uma avaliação em
 * cascata destruiria resultados de avaliação já importados, em silêncio. Seria
 * a violação mais direta possível do Princípio I — o dado importado é
 * evidência, e evidência não some por efeito colateral de outra operação.
 *
 * A exclusão continua possível, mas exige que o Administrador declare que
 * conhece o efeito, e o ato fica registrado em auditoria.
 */

export type Dependencias = Readonly<{
  resultados: number
  estudantes: number
  turmas: number
  importacoes: number
}>

export async function contarDependenciasDaEscola(
  ctx: AuthContext,
  schoolId: string,
): Promise<Dependencias> {
  assertSchoolInScope(ctx, schoolId)

  const [resultados, estudantes, turmas, importacoes] = await Promise.all([
    prisma.assessmentStudentResult.count({ where: { schoolId } }),
    prisma.student.count({ where: { schoolId } }),
    prisma.class.count({ where: { schoolId } }),
    prisma.import.count({ where: { schoolId } }),
  ])

  return { resultados, estudantes, turmas, importacoes }
}

export async function contarDependenciasDaAvaliacao(
  assessmentId: string,
): Promise<Dependencias> {
  const [resultados, importacoes] = await Promise.all([
    prisma.assessmentStudentResult.count({ where: { assessmentId } }),
    prisma.import.count({ where: { assessmentId } }),
  ])

  return { resultados, estudantes: 0, turmas: 0, importacoes }
}

export async function contarDependenciasDaHabilidade(skillId: string): Promise<Dependencias> {
  const resultados = await prisma.studentSkillResult.count({ where: { skillId } })
  return { resultados, estudantes: 0, turmas: 0, importacoes: 0 }
}

export function possuiDependencias(d: Dependencias): boolean {
  return d.resultados > 0 || d.estudantes > 0 || d.turmas > 0 || d.importacoes > 0
}

function descrever(d: Dependencias): string {
  const partes: string[] = []
  if (d.resultados > 0) partes.push(`${d.resultados} resultado(s) de avaliação`)
  if (d.estudantes > 0) partes.push(`${d.estudantes} estudante(s)`)
  if (d.turmas > 0) partes.push(`${d.turmas} turma(s)`)
  if (d.importacoes > 0) partes.push(`${d.importacoes} importação(ões)`)
  return partes.join(', ')
}

export type OpcoesExclusao = Readonly<{
  /**
   * Declaração explícita do Administrador de que conhece o efeito. Sem ela a
   * exclusão é recusada — apagar resultado de avaliação por efeito colateral
   * não pode ser algo que acontece por descuido.
   */
  forcar?: boolean
}>

async function excluirComGuarda(
  ctx: AuthContext,
  alvo: { tipo: 'School' | 'Assessment' | 'Skill'; id: string; rotulo: string },
  dependencias: Dependencias,
  remover: () => Promise<void>,
  opcoes: OpcoesExclusao,
): Promise<void> {
  requireRole(ctx, 'ADMIN')

  if (possuiDependencias(dependencias) && !opcoes.forcar) {
    throw conflito(
      `${alvo.rotulo} possui ${descrever(dependencias)} vinculado(s) e não pode ser excluído. ` +
        'Exclua primeiro as importações correspondentes, ou confirme a exclusão forçada.',
    )
  }

  await remover()

  await registrarAuditoria(prisma, {
    action: 'ENTITY_FORCE_DELETE',
    userId: ctx.userId,
    entityType: alvo.tipo,
    entityId: alvo.id,
    metadata: {
      forcada: opcoes.forcar === true,
      dependencias: { ...dependencias },
    },
  })

  logger.warn('entidade excluída', {
    entityType: alvo.tipo,
    entityId: alvo.id,
    forcada: opcoes.forcar === true,
  })
}

export async function excluirEscola(
  ctx: AuthContext,
  schoolId: string,
  opcoes: OpcoesExclusao = {},
): Promise<void> {
  const escola = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true },
  })
  if (!escola) throw naoEncontrado('Escola')
  assertSchoolInScope(ctx, schoolId)

  const dependencias = await contarDependenciasDaEscola(ctx, schoolId)

  await excluirComGuarda(
    ctx,
    { tipo: 'School', id: schoolId, rotulo: `A escola "${escola.name}"` },
    dependencias,
    async () => {
      await prisma.school.delete({ where: { id: schoolId } })
    },
    opcoes,
  )
}

export async function excluirAvaliacao(
  ctx: AuthContext,
  assessmentId: string,
  opcoes: OpcoesExclusao = {},
): Promise<void> {
  const avaliacao = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, nome: true },
  })
  if (!avaliacao) throw naoEncontrado('Avaliação')

  const dependencias = await contarDependenciasDaAvaliacao(assessmentId)

  await excluirComGuarda(
    ctx,
    { tipo: 'Assessment', id: assessmentId, rotulo: `A avaliação "${avaliacao.nome}"` },
    dependencias,
    async () => {
      await prisma.assessment.delete({ where: { id: assessmentId } })
    },
    opcoes,
  )
}

export async function excluirHabilidade(
  ctx: AuthContext,
  skillId: string,
  opcoes: OpcoesExclusao = {},
): Promise<void> {
  const habilidade = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { id: true, shortCode: true },
  })
  if (!habilidade) throw naoEncontrado('Habilidade')

  const dependencias = await contarDependenciasDaHabilidade(skillId)

  await excluirComGuarda(
    ctx,
    { tipo: 'Skill', id: skillId, rotulo: `A habilidade "${habilidade.shortCode}"` },
    dependencias,
    async () => {
      await prisma.skill.delete({ where: { id: skillId } })
    },
    opcoes,
  )
}
