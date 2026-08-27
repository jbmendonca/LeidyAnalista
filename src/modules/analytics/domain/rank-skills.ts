import Decimal from 'decimal.js'

import type { Fraction, MaybeFraction } from '@/modules/imports/domain/types'

export type SkillAggregate = Readonly<{
  skillId: string
  shortCode: string
  result: MaybeFraction
  studentsInFragility: number
  studentsWithResult: number
}>

export type RankCriterion =
  /** padrão (FR-072): menor percentual de acerto primeiro */
  | 'LOWEST_PERCENT'
  /** maior proporção de estudantes em fragilidade primeiro */
  | 'FRAGILITY_RATE'
  /** maior quantidade absoluta de estudantes em fragilidade primeiro */
  | 'FRAGILITY_COUNT'
  /** maior perda de pontos possíveis primeiro: `Σ itens − Σ acertos` */
  | 'POINTS_LOST'

/**
 * Chave primária: o critério escolhido, sempre da maior fragilidade para a menor.
 *
 * As duas comparações fracionárias usam multiplicação cruzada com `Decimal` em vez de
 * divisão: a desigualdade `a₁/b₁ < a₂/b₂` equivale a `a₁·b₂ < a₂·b₁` para denominadores
 * não negativos, com aritmética exata e sem arredondamento intermediário. A forma cruzada
 * também dispensa tratamento especial de denominador zero em `FRAGILITY_RATE`: os dois
 * produtos zeram e a decisão desce para as chaves de desempate.
 */
function compareByCriterion(
  a: SkillAggregate,
  aResult: Fraction,
  b: SkillAggregate,
  bResult: Fraction,
  criterion: RankCriterion,
): number {
  switch (criterion) {
    case 'LOWEST_PERCENT': {
      const esquerda = new Decimal(aResult.acertos).times(bResult.itens)
      const direita = new Decimal(bResult.acertos).times(aResult.itens)
      return esquerda.comparedTo(direita)
    }
    case 'FRAGILITY_RATE': {
      const esquerda = new Decimal(a.studentsInFragility).times(b.studentsWithResult)
      const direita = new Decimal(b.studentsInFragility).times(a.studentsWithResult)
      return direita.comparedTo(esquerda)
    }
    case 'FRAGILITY_COUNT':
      return b.studentsInFragility - a.studentsInFragility
    case 'POINTS_LOST':
      return bResult.itens - bResult.acertos - (aResult.itens - aResult.acertos)
  }
}

/** Chave secundária: mais itens é mais evidência, e tem precedência (R-011). */
function itensDe(result: MaybeFraction): number {
  return result === null ? 0 : result.itens
}

/** Chave final: ordem de unidades de código, estável e independente de locale (R-011). */
function compareShortCode(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Ordena habilidades da maior fragilidade para a menor (FR-072, PRD §9.1).
 *
 * **Desempate determinístico em três chaves** (R-011, lacuna CHK061):
 *
 * 1. o critério escolhido;
 * 2. maior quantidade de itens — mais evidência tem precedência;
 * 3. `shortCode` em ordem alfabética, critério final e sempre estável.
 *
 * Sem a terceira chave a ordem passaria a depender do retorno do banco e mudaria entre
 * execuções sem que nenhum dado tivesse mudado.
 *
 * Habilidades com `result === null` vão para o fim, agrupadas, e entre si obedecem apenas
 * ao `shortCode` — o critério de fragilidade não se aplica a quem não tem resultado, e
 * ausência jamais é tratada como desempenho zero (Const. I).
 *
 * A função é pura: ordena uma cópia e nunca muta o array recebido.
 */
export function rankSkillsByFragility(
  skills: readonly SkillAggregate[],
  criterion: RankCriterion,
): readonly SkillAggregate[] {
  return [...skills].sort((a, b) => {
    const aResult = a.result
    const bResult = b.result

    if (aResult === null || bResult === null) {
      if (aResult !== bResult) return aResult === null ? 1 : -1
    } else {
      const porCriterio = compareByCriterion(a, aResult, b, bResult, criterion)
      if (porCriterio !== 0) return porCriterio
    }

    const porItens = itensDe(bResult) - itensDe(aResult)
    if (porItens !== 0) return porItens

    return compareShortCode(a.shortCode, b.shortCode)
  })
}
