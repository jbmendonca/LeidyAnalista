import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  ABSENCE_PLACEHOLDER,
  formatInteger,
  formatPercent,
  toPercent,
} from '@/lib/decimal'

describe('toPercent', () => {
  it('converte 2/3 sem arredondar em nenhum passo intermediário', () => {
    const percent = toPercent({ acertos: 2, itens: 3 })

    expect(percent).not.toBeNull()
    if (percent === null) throw new Error('esperava Decimal')
    expect(percent.toString()).toBe('66.666666666666666667')
    expect(percent.equals(new Decimal('66.67'))).toBe(false)
    expect(percent.greaterThan(new Decimal('66.6666666666'))).toBe(true)
  })

  it.each<[number, number, string]>([
    [1, 2, '50'],
    [1, 1, '100'],
    [0, 4, '0'],
    [15, 22, '68.181818181818181818'],
    [37, 60, '61.666666666666666667'],
  ])('converte %i/%i em %s', (acertos, itens, expected) => {
    expect(toPercent({ acertos, itens })?.toString()).toBe(expected)
  })

  it('devolve null para ausência — jamais zero (Const. I)', () => {
    expect(toPercent(null)).toBeNull()
  })

  it('devolve null para denominador não positivo', () => {
    expect(toPercent({ acertos: 0, itens: 0 })).toBeNull()
    expect(toPercent({ acertos: 1, itens: -2 })).toBeNull()
  })

  it('devolve Decimal, nunca number', () => {
    expect(toPercent({ acertos: 1, itens: 2 })).toBeInstanceOf(Decimal)
  })
})

describe('formatPercent', () => {
  it('formata 2/3 como "66,67%"', () => {
    expect(formatPercent(toPercent({ acertos: 2, itens: 3 }))).toBe('66,67%')
  })

  it('formata 1/2 como "50,00%" — casas fixas, sem encurtar', () => {
    expect(formatPercent(toPercent({ acertos: 1, itens: 2 }))).toBe('50,00%')
  })

  it.each<[number, number, string]>([
    [1, 1, '100,00%'],
    [0, 4, '0,00%'],
    [15, 22, '68,18%'],
    [37, 60, '61,67%'],
  ])('formata %i/%i como %s', (acertos, itens, expected) => {
    expect(formatPercent(toPercent({ acertos, itens }))).toBe(expected)
  })

  it('devolve travessão para null — ausência jamais vira 0% (FR-031, FR-093)', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(null)).toBe(ABSENCE_PLACEHOLDER)
    expect(formatPercent(null)).not.toBe('0,00%')
  })

  it('devolve travessão para undefined', () => {
    expect(formatPercent(undefined)).toBe('—')
  })

  it('respeita o número de casas pedido', () => {
    const percent = toPercent({ acertos: 2, itens: 3 })
    expect(formatPercent(percent, 0)).toBe('67%')
    expect(formatPercent(percent, 1)).toBe('66,7%')
    expect(formatPercent(percent, 4)).toBe('66,6667%')
  })

  it('arredonda meio para cima, e só na formatação', () => {
    expect(formatPercent(new Decimal('66.665'), 2)).toBe('66,67%')
    expect(formatPercent(new Decimal('0.005'), 2)).toBe('0,01%')
  })

  it('usa a vírgula decimal do pt-BR', () => {
    expect(formatPercent(new Decimal('12.5'))).toBe('12,50%')
  })
})

describe('formatInteger', () => {
  it.each<[number, string]>([
    [0, '0'],
    [5, '5'],
    [111, '111'],
    [106, '106'],
  ])('formata %i como %s', (value, expected) => {
    expect(formatInteger(value)).toBe(expected)
  })

  it('agrupa milhares no padrão pt-BR', () => {
    expect(formatInteger(1234)).toBe('1.234')
  })

  it('devolve travessão para null — nunca zero', () => {
    expect(formatInteger(null)).toBe('—')
    expect(formatInteger(null)).not.toBe('0')
  })
})
