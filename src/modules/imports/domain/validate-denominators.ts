/**
 * Apura o denominador de referência de cada habilidade e detecta divergências (FR-046, FR-155).
 *
 * Contrato:
 * specs/001-painel-analise-leitura/contracts/domain-functions.md#validateskilldenominators
 *
 * A função **não corrige** nada e **não altera** nenhum cálculo: `calculateSkillPerformance`
 * continua somando todos os denominadores (FR-157). O relatório serve à apresentação e ao alerta.
 *
 * Função pura: sem I/O, sem estado, sem relógio.
 */

export type DenominatorRow = Readonly<{
  rowNumber: number
  skillId: string
  itens: number
}>

export type DivergentRow = Readonly<{
  rowNumber: number
  found: number
}>

export type SkillDenominator = Readonly<{
  /** Denominador mais frequente da habilidade no conjunto. */
  referenceItems: number
  /** `true` quando houve empate de frequência e o maior denominador foi adotado (FR-160). */
  tiebreak: boolean
  /** Linhas fora do padrão, na ordem em que aparecem no conjunto (FR-149). */
  divergentRows: readonly DivergentRow[]
}>

export type DenominatorReport = Readonly<{
  bySkill: ReadonlyMap<string, SkillDenominator>
}>

type SkillGroup = {
  /** itens → frequência, na ordem de primeira aparição. */
  counts: Map<number, number>
  rows: DenominatorRow[]
}

/**
 * `referenceItems` é o denominador mais frequente. Havendo empate de frequência, adota o maior e
 * marca `tiebreak = true` — a escolha nunca é arbitrária nem silenciosa (FR-160).
 *
 * A ordem de iteração acompanha a ordem das linhas recebidas, o que torna o relatório
 * determinístico para uma mesma entrada.
 */
export function validateSkillDenominators(
  rows: readonly DenominatorRow[],
): DenominatorReport {
  const groups = new Map<string, SkillGroup>()

  for (const row of rows) {
    let group = groups.get(row.skillId)
    if (group === undefined) {
      group = { counts: new Map<number, number>(), rows: [] }
      groups.set(row.skillId, group)
    }
    group.counts.set(row.itens, (group.counts.get(row.itens) ?? 0) + 1)
    group.rows.push(row)
  }

  const bySkill = new Map<string, SkillDenominator>()

  for (const [skillId, group] of groups) {
    let referenceItems = 0
    let bestCount = 0
    let tiebreak = false

    for (const [itens, count] of group.counts) {
      if (count > bestCount) {
        referenceItems = itens
        bestCount = count
        tiebreak = false
      } else if (count === bestCount) {
        // Empate de frequência: o maior denominador prevalece, e o empate fica registrado.
        tiebreak = true
        if (itens > referenceItems) referenceItems = itens
      }
    }

    const divergentRows: DivergentRow[] = []
    for (const row of group.rows) {
      if (row.itens !== referenceItems) {
        divergentRows.push({ rowNumber: row.rowNumber, found: row.itens })
      }
    }

    bySkill.set(skillId, { referenceItems, tiebreak, divergentRows })
  }

  return { bySkill }
}
