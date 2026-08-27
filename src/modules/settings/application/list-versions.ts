import { prisma } from '@/server/prisma'
import { requireRole, type AuthContext } from '@/server/authorization'
import type { NivelAprendizagem } from '@/modules/settings/schemas'

/**
 * Histórico de versões dos critérios analíticos — FR-165.
 *
 * A tela precisa de três coisas que o registro sozinho não dá: quando cada versão deixou de
 * valer, qual está em vigor agora e qual ainda não começou. As três são derivadas aqui, da
 * sequência de `effectiveFrom`, e não guardadas em coluna — uma coluna `vigenteAte` teria de
 * ser atualizada a cada inserção, o que significaria UPDATE em `AnalyticalSettings`,
 * proibido em FR-163.
 */

export type SituacaoDeVigencia = 'VIGENTE' | 'ENCERRADA' | 'AGENDADA'

export type VersaoDeCriterios = Readonly<{
  id: string
  version: number
  fragilidadeMax: string
  atencaoMax: string
  baixoRendimento: readonly NivelAprendizagem[]
  abaixoDoAdequadoHabilitado: boolean
  effectiveFrom: Date
  /** Início da versão seguinte. `null` enquanto esta for a última da linha do tempo. */
  vigenteAte: Date | null
  situacao: SituacaoDeVigencia
  autor: Readonly<{ id: string; name: string }>
}>

export async function listarVersoesDeCriterios(
  ctx: AuthContext,
  momento: Date = new Date(),
): Promise<VersaoDeCriterios[]> {
  requireRole(ctx, 'ADMIN')

  const registros = await prisma.analyticalSettings.findMany({
    // Ordem cronológica crescente: é dela que sai o fim de vigência de cada versão.
    orderBy: [{ effectiveFrom: 'asc' }, { version: 'asc' }],
    select: {
      id: true,
      version: true,
      fragilidadeMax: true,
      atencaoMax: true,
      baixoRendimento: true,
      abaixoDoAdequadoHabilitado: true,
      effectiveFrom: true,
      createdBy: { select: { id: true, name: true } },
    },
  })

  // A vigente é a última cujo início já passou — a mesma regra de `lerConfiguracaoVigente`.
  let indiceVigente = -1
  for (let i = 0; i < registros.length; i += 1) {
    const registro = registros[i]
    if (registro && registro.effectiveFrom.getTime() <= momento.getTime()) {
      indiceVigente = i
    }
  }

  const linhas = registros.map((registro, indice): VersaoDeCriterios => {
    const proxima = registros[indice + 1]

    const situacao: SituacaoDeVigencia =
      indice === indiceVigente
        ? 'VIGENTE'
        : registro.effectiveFrom.getTime() > momento.getTime()
          ? 'AGENDADA'
          : 'ENCERRADA'

    return {
      id: registro.id,
      version: registro.version,
      fragilidadeMax: registro.fragilidadeMax.toFixed(2),
      atencaoMax: registro.atencaoMax.toFixed(2),
      baixoRendimento: registro.baixoRendimento,
      abaixoDoAdequadoHabilitado: registro.abaixoDoAdequadoHabilitado,
      effectiveFrom: registro.effectiveFrom,
      vigenteAte: proxima ? proxima.effectiveFrom : null,
      situacao,
      autor: registro.createdBy,
    }
  })

  // Exibição em ordem decrescente: a versão mais recente é a que se procura primeiro.
  return linhas.reverse()
}
