import { describe, expect, it } from 'vitest'
import {
  validateSkillDenominators,
  type DenominatorRow,
} from '@/modules/imports/domain/validate-denominators'

const row = (rowNumber: number, skillId: string, itens: number): DenominatorRow => ({
  rowNumber,
  skillId,
  itens,
})

describe('validateSkillDenominators', () => {
  it('devolve relatório vazio para conjunto vazio', () => {
    expect(validateSkillDenominators([]).bySkill.size).toBe(0)
  })

  describe('conjunto uniforme', () => {
    it('adota o único denominador e não aponta divergência', () => {
      const report = validateSkillDenominators([
        row(2, 'H01', 3),
        row(3, 'H01', 3),
        row(4, 'H01', 3),
      ])

      expect(report.bySkill.get('H01')).toEqual({
        referenceItems: 3,
        tiebreak: false,
        divergentRows: [],
      })
    })

    it('mantém habilidades independentes entre si', () => {
      const report = validateSkillDenominators([
        row(2, 'H01', 3),
        row(2, 'H02', 5),
        row(3, 'H01', 3),
        row(3, 'H02', 5),
      ])

      expect(report.bySkill.size).toBe(2)
      expect(report.bySkill.get('H01')?.referenceItems).toBe(3)
      expect(report.bySkill.get('H02')?.referenceItems).toBe(5)
    })
  })

  describe('conjunto divergente', () => {
    it('adota o denominador mais frequente e lista as linhas fora do padrão', () => {
      const report = validateSkillDenominators([
        row(2, 'H01', 3),
        row(3, 'H01', 3),
        row(4, 'H01', 2),
        row(5, 'H01', 3),
      ])

      expect(report.bySkill.get('H01')).toEqual({
        referenceItems: 3,
        tiebreak: false,
        divergentRows: [{ rowNumber: 4, found: 2 }],
      })
    })

    it('lista várias divergências na ordem das linhas recebidas', () => {
      const report = validateSkillDenominators([
        row(9, 'H01', 4),
        row(2, 'H01', 3),
        row(3, 'H01', 3),
        row(7, 'H01', 5),
        row(4, 'H01', 3),
      ])

      expect(report.bySkill.get('H01')).toEqual({
        referenceItems: 3,
        tiebreak: false,
        divergentRows: [
          { rowNumber: 9, found: 4 },
          { rowNumber: 7, found: 5 },
        ],
      })
    })

    it('não corrige nem altera as linhas recebidas', () => {
      const rows: DenominatorRow[] = [row(2, 'H01', 3), row(3, 'H01', 2)]
      const snapshot = structuredClone(rows)

      validateSkillDenominators(rows)

      expect(rows).toEqual(snapshot)
    })
  })

  describe('empate de frequência (FR-160)', () => {
    it('adota o maior denominador quando o maior aparece depois', () => {
      const report = validateSkillDenominators([row(2, 'H01', 2), row(3, 'H01', 3)])

      expect(report.bySkill.get('H01')).toEqual({
        referenceItems: 3,
        tiebreak: true,
        divergentRows: [{ rowNumber: 2, found: 2 }],
      })
    })

    it('adota o maior denominador quando o maior aparece antes', () => {
      const report = validateSkillDenominators([row(2, 'H01', 3), row(3, 'H01', 2)])

      expect(report.bySkill.get('H01')).toEqual({
        referenceItems: 3,
        tiebreak: true,
        divergentRows: [{ rowNumber: 3, found: 2 }],
      })
    })

    it('marca empate mesmo havendo um terceiro denominador menos frequente', () => {
      const report = validateSkillDenominators([
        row(2, 'H01', 2),
        row(3, 'H01', 2),
        row(4, 'H01', 3),
        row(5, 'H01', 3),
        row(6, 'H01', 5),
      ])

      expect(report.bySkill.get('H01')).toEqual({
        referenceItems: 3,
        tiebreak: true,
        divergentRows: [
          { rowNumber: 2, found: 2 },
          { rowNumber: 3, found: 2 },
          { rowNumber: 6, found: 5 },
        ],
      })
    })

    it('desfaz o empate quando surge uma frequência estritamente maior', () => {
      const report = validateSkillDenominators([
        row(2, 'H01', 2),
        row(3, 'H01', 3),
        row(4, 'H01', 4),
        row(5, 'H01', 4),
      ])

      expect(report.bySkill.get('H01')).toEqual({
        referenceItems: 4,
        tiebreak: false,
        divergentRows: [
          { rowNumber: 2, found: 2 },
          { rowNumber: 3, found: 3 },
        ],
      })
    })
  })

  it('é determinística: mesma entrada, mesmo relatório', () => {
    const rows = [row(2, 'H01', 3), row(3, 'H01', 2), row(4, 'H02', 4)]

    const first = validateSkillDenominators(rows)
    const second = validateSkillDenominators(rows)

    expect([...first.bySkill]).toEqual([...second.bySkill])
  })
})
