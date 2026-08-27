import { prisma } from '@/server/prisma'
import { requireRole, type AuthContext } from '@/server/authorization'
import type { NivelAprendizagem } from '@/modules/settings/schemas'

/**
 * Leitura da configuração analítica vigente — FR-163, FR-165.
 *
 * **Vigente é a versão de maior `effectiveFrom` que não esteja no futuro.** Não é a de maior
 * `version`, e a diferença importa: uma versão pode ser registrada com início de vigência
 * adiante, e até essa data quem manda é a anterior. Ordenar por `version` faria a futura
 * valer imediatamente — o oposto do que "início de vigência" significa.
 *
 * Nenhum valor padrão em código (FR-111). Sem versão cadastrada a função devolve `null` e a
 * tela diz o que fazer; inventar 60/80 aqui transformaria um limite configurável em
 * constante escondida.
 */

export type ConfiguracaoAnalitica = Readonly<{
  id: string
  version: number
  /** Literal decimal com duas casas, ex. `"60.00"`. Limite superior EXCLUSIVO. */
  fragilidadeMax: string
  /** Literal decimal com duas casas, ex. `"80.00"`. Limite superior EXCLUSIVO. */
  atencaoMax: string
  /** Níveis da fonte que compõem a visão de baixo rendimento (FR-110). */
  baixoRendimento: readonly NivelAprendizagem[]
  abaixoDoAdequadoHabilitado: boolean
  effectiveFrom: Date
  /** Autor da versão. Identificado por id; o nome é exibição, não chave. */
  autor: Readonly<{ id: string; name: string }>
}>

const SELECAO = {
  id: true,
  version: true,
  fragilidadeMax: true,
  atencaoMax: true,
  baixoRendimento: true,
  abaixoDoAdequadoHabilitado: true,
  effectiveFrom: true,
  createdByUserId: true,
  createdBy: { select: { id: true, name: true } },
} as const

type RegistroBruto = {
  id: string
  version: number
  fragilidadeMax: { toFixed(casas: number): string }
  atencaoMax: { toFixed(casas: number): string }
  baixoRendimento: NivelAprendizagem[]
  abaixoDoAdequadoHabilitado: boolean
  effectiveFrom: Date
  createdBy: { id: string; name: string }
}

/** Converte o registro do Prisma em objeto serializável. Nenhum `Decimal` atravessa daqui. */
export function paraConfiguracao(registro: RegistroBruto): ConfiguracaoAnalitica {
  return {
    id: registro.id,
    version: registro.version,
    fragilidadeMax: registro.fragilidadeMax.toFixed(2),
    atencaoMax: registro.atencaoMax.toFixed(2),
    baixoRendimento: registro.baixoRendimento,
    abaixoDoAdequadoHabilitado: registro.abaixoDoAdequadoHabilitado,
    effectiveFrom: registro.effectiveFrom,
    autor: registro.createdBy,
  }
}

/**
 * Configuração em vigor em `momento` (padrão: agora), sem checagem de perfil.
 *
 * Uso interno da camada de aplicação — quem chama já resolveu a autorização. A versão
 * pública é `obterConfiguracaoVigente`.
 */
export async function lerConfiguracaoVigente(
  momento: Date = new Date(),
): Promise<ConfiguracaoAnalitica | null> {
  const registro = await prisma.analyticalSettings.findFirst({
    where: { effectiveFrom: { lte: momento } },
    // Desempate por `version` para o caso de duas versões com o mesmo instante.
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    select: SELECAO,
  })

  return registro === null ? null : paraConfiguracao(registro)
}

/**
 * Configuração vigente para a tela de configurações — restrita ao Administrador (FR-109).
 *
 * As faixas usadas em cálculo continuam sendo lidas por `carregarFaixasAnaliticas`, em
 * analytics, que não passa por aqui: aquele caminho serve a todo perfil e não pode depender
 * de permissão administrativa.
 */
export async function obterConfiguracaoVigente(
  ctx: AuthContext,
): Promise<ConfiguracaoAnalitica | null> {
  requireRole(ctx, 'ADMIN')
  return lerConfiguracaoVigente()
}
