import type { AuditAction, Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { requireRole, type AuthContext } from '@/server/authorization'

/**
 * ===========================================================================
 *  CONSULTA DA TRILHA DE AUDITORIA — FR-117, FR-120, Const. IV
 * ===========================================================================
 *
 * Este módulo é **somente leitura**, e a ausência é a parte importante: não existe aqui —
 * nem pode passar a existir — função de alteração ou de remoção de `AuditLog` (FR-120). Um
 * registro de auditoria que a aplicação consegue editar não é auditoria.
 *
 * **Nada de nome de estudante.** A consulta não seleciona `beforeValue`, `afterValue` nem
 * `metadata`, e não faz junção com `Student`. A auditoria referencia por identificador
 * (Const. IV, FR-009): a listagem devolve tipo e id da entidade, e quem precisa do nome vai
 * buscá-lo na tela do estudante, onde a permissão de dados nominais (FR-007) é aplicada.
 * Trazer os JSON de valor para cá reintroduziria pela porta dos fundos exatamente o dado que
 * a trilha evita guardar.
 */

/** Rótulo em pt-BR de cada ação. O `satisfies` obriga a lista a acompanhar o enum. */
export const ROTULO_ACAO = {
  SCHOOL_CREATE: 'Escola cadastrada',
  SCHOOL_UPDATE: 'Escola alterada',
  ASSESSMENT_CREATE: 'Avaliação cadastrada',
  ASSESSMENT_UPDATE: 'Avaliação alterada',
  CLASS_CREATE: 'Turma cadastrada',
  CLASS_UPDATE: 'Turma alterada',
  IMPORT_CONFIRM: 'Importação confirmada',
  IMPORT_DELETE: 'Importação excluída',
  IMPORT_FILE_PURGE: 'Arquivo de importação expurgado',
  SETTINGS_CHANGE: 'Critérios analíticos alterados',
  REPROCESS: 'Indicadores reprocessados',
  STUDENT_CREATE: 'Estudante cadastrado',
  STUDENT_UPDATE: 'Estudante alterado',
  STUDENT_LINK: 'Estudante vinculado',
  STUDENT_UNLINK: 'Vínculo de estudante desfeito',
  USER_CREATE: 'Usuário criado',
  USER_UPDATE: 'Usuário alterado',
  USER_NOMINAL_PERMISSION_CHANGE: 'Permissão de dados nominais alterada',
  REPORT_EXPORT: 'Relatório exportado',
  ENTITY_FORCE_DELETE: 'Exclusão forçada de registro',
} as const satisfies Record<AuditAction, string>

/** Ações disponíveis no filtro, na ordem do enum. */
export const ACOES_AUDITORIA = Object.keys(ROTULO_ACAO) as AuditAction[]

export function ehAcaoConhecida(valor: string): valor is AuditAction {
  return Object.prototype.hasOwnProperty.call(ROTULO_ACAO, valor)
}

export type FiltrosAuditoria = Readonly<{
  action?: AuditAction | null
  userId?: string | null
  /** Início do período, inclusivo. */
  de?: Date | null
  /** Fim do período, inclusivo — o dia inteiro, não o instante zero dele. */
  ate?: Date | null
  pagina?: number
  porPagina?: number
}>

export type LinhaAuditoria = Readonly<{
  id: string
  action: AuditAction
  rotuloAcao: string
  occurredAt: Date
  entityType: string
  entityId: string
  /** Autor do fato. Identificado por id; o nome acompanha apenas como exibição. */
  autor: Readonly<{ id: string; name: string }>
}>

export type PaginaAuditoria = Readonly<{
  linhas: readonly LinhaAuditoria[]
  total: number
  pagina: number
  porPagina: number
  totalPaginas: number
}>

const POR_PAGINA_PADRAO = 50
const POR_PAGINA_MAXIMO = 200

/**
 * Fim de dia do parâmetro `ate`.
 *
 * Sem isso, filtrar "até 27/08" descartaria tudo o que aconteceu naquele dia depois da
 * meia-noite — praticamente o dia inteiro. O filtro de período de uma tela de consulta é
 * lido por quem preenche como intervalo de dias, e é assim que precisa se comportar.
 */
function fimDoDia(d: Date): Date {
  const copia = new Date(d)
  copia.setHours(23, 59, 59, 999)
  return copia
}

/** Converte `aaaa-mm-dd` de um `<input type="date">` em `Date`, ou `null`. */
export function lerDataDoFiltro(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const casado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim())
  if (!casado) return null

  const data = new Date(`${valor.trim()}T00:00:00`)
  return Number.isNaN(data.getTime()) ? null : data
}

export async function listarAuditoria(
  ctx: AuthContext,
  filtros: FiltrosAuditoria = {},
): Promise<PaginaAuditoria> {
  requireRole(ctx, 'ADMIN')

  const porPagina = Math.min(
    Math.max(filtros.porPagina ?? POR_PAGINA_PADRAO, 1),
    POR_PAGINA_MAXIMO,
  )
  const pagina = Math.max(filtros.pagina ?? 1, 1)

  const periodo: Prisma.DateTimeFilter = {}
  if (filtros.de) periodo.gte = filtros.de
  if (filtros.ate) periodo.lte = fimDoDia(filtros.ate)

  const where: Prisma.AuditLogWhereInput = {
    ...(filtros.action ? { action: filtros.action } : {}),
    ...(filtros.userId ? { userId: filtros.userId } : {}),
    ...(filtros.de || filtros.ate ? { occurredAt: periodo } : {}),
  }

  const [total, registros] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      // Seleção explícita e deliberadamente curta: `beforeValue`, `afterValue` e `metadata`
      // ficam de fora para que nenhum valor gravado por um módulo qualquer possa aparecer
      // nesta tela sem passar por revisão.
      select: {
        id: true,
        action: true,
        occurredAt: true,
        entityType: true,
        entityId: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ])

  return {
    linhas: registros.map((r) => ({
      id: r.id,
      action: r.action,
      rotuloAcao: ROTULO_ACAO[r.action],
      occurredAt: r.occurredAt,
      entityType: r.entityType,
      entityId: r.entityId,
      autor: r.user,
    })),
    total,
    pagina,
    porPagina,
    totalPaginas: Math.max(Math.ceil(total / porPagina), 1),
  }
}

/**
 * Autores presentes na trilha, para preencher o filtro por usuário.
 *
 * Lista usuários que têm ao menos um registro — um seletor com contas que nunca agiram só
 * produziria filtros que devolvem vazio.
 */
export async function listarAutoresDeAuditoria(
  ctx: AuthContext,
): Promise<{ id: string; name: string }[]> {
  requireRole(ctx, 'ADMIN')

  return prisma.user.findMany({
    where: { auditLogs: { some: {} } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}
