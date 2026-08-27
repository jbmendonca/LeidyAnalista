import type { AuthContext } from '@/server/authorization'

/**
 * Supressão de dados nominais — FR-007, FR-007a.
 *
 * A permissão é ortogonal ao perfil e ao escopo de escola: o vínculo diz
 * *quais escolas*, esta permissão diz *se os nomes aparecem*.
 *
 * Quem não a possui recebe a versão agregada, nunca uma negação: bloquear o
 * relatório impediria trabalho legítimo de análise sem nenhum ganho de
 * proteção, já que o agregado atende ao mesmo propósito.
 *
 * A supressão acontece AQUI, na fronteira de saída da consulta, e não na
 * renderização. Um componente que apenas esconde a coluna deixaria o nome
 * trafegar até o navegador — seria exatamente a permissão implementada só na
 * interface que o Princípio IV proíbe.
 */

export const NOME_SUPRIMIDO = 'Estudante (nome não autorizado)'

export function podeVerNomes(ctx: AuthContext): boolean {
  return ctx.canAccessNominalData
}

/**
 * Substitui o nome do estudante quando o requisitante não tem a permissão.
 * O `uniqueCode` permanece: ele identifica sem revelar, por não ser derivado
 * de dado pessoal (FR-131).
 */
export function aplicarSupressaoNominal<T extends { nomeOriginal: string }>(
  ctx: AuthContext,
  registros: readonly T[],
): T[] {
  if (podeVerNomes(ctx)) return [...registros]
  return registros.map((r) => ({ ...r, nomeOriginal: NOME_SUPRIMIDO }))
}

export function aplicarSupressaoNominalEm<T extends { nomeOriginal: string }>(
  ctx: AuthContext,
  registro: T,
): T {
  if (podeVerNomes(ctx)) return registro
  return { ...registro, nomeOriginal: NOME_SUPRIMIDO }
}

/**
 * Rótulo do relatório, para que fique explícito ao leitor que aquela versão é
 * agregada por falta de permissão — e não porque os dados não existem.
 */
export function rotuloVersaoRelatorio(ctx: AuthContext): string {
  return podeVerNomes(ctx)
    ? 'Versão nominal'
    : 'Versão agregada — sem identificação de estudantes'
}
