import { describe, expect, it } from 'vitest'

import { ABSENCE_PLACEHOLDER } from '@/lib/decimal'
import {
  AUSENTE,
  formatarData,
  formatarDataHora,
  formatarFracao,
  formatarNumero,
  formatarPercentualDeNumero,
} from '@/lib/format'

/**
 * A camada de apresentação repete duas promessas da constituição e é aqui que elas ficam
 * travadas: tudo em pt-BR, e ausência jamais convertida em zero.
 */

describe('AUSENTE', () => {
  it('é o travessão', () => {
    expect(AUSENTE).toBe('—')
  })

  it('não pode divergir do travessão da camada de cálculo', () => {
    // Se alguém trocar o símbolo em um dos dois módulos, o painel passaria a exibir dois
    // sinais diferentes para a mesma ausência.
    expect(AUSENTE).toBe(ABSENCE_PLACEHOLDER)
  })
})

describe('formatarData', () => {
  it('formata em dd/MM/aaaa', () => {
    expect(formatarData(new Date('2026-03-09T12:00:00-03:00'))).toBe('09/03/2026')
  })

  it('preserva o dia no fuso de Brasília para instante noturno em UTC', () => {
    // 2026-03-09T23:30 em Brasília é 2026-03-10T02:30 em UTC. Sem fuso fixo, a data da
    // aplicação da avaliação escorregaria um dia.
    expect(formatarData(new Date('2026-03-10T02:30:00Z'))).toBe('09/03/2026')
  })

  it('preenche dia e mês com zero à esquerda', () => {
    expect(formatarData(new Date('2026-01-05T12:00:00-03:00'))).toBe('05/01/2026')
  })

  it('devolve travessão para null e para undefined', () => {
    expect(formatarData(null)).toBe('—')
    expect(formatarData(undefined)).toBe('—')
  })

  it('devolve travessão para data inválida', () => {
    expect(formatarData(new Date('não é data'))).toBe('—')
  })
})

describe('formatarDataHora', () => {
  it('formata em dd/MM/aaaa HH:mm com relógio de 24 horas', () => {
    expect(formatarDataHora(new Date('2026-03-09T14:07:00-03:00'))).toBe(
      '09/03/2026 14:07',
    )
  })

  it('usa 00 para a meia-noite, e não 24', () => {
    expect(formatarDataHora(new Date('2026-03-09T00:00:00-03:00'))).toBe(
      '09/03/2026 00:00',
    )
  })

  it('separa data e hora por espaço, sem vírgula', () => {
    expect(formatarDataHora(new Date('2026-03-09T14:07:00-03:00'))).not.toContain(',')
  })

  it('devolve travessão para null, undefined e data inválida', () => {
    expect(formatarDataHora(null)).toBe('—')
    expect(formatarDataHora(undefined)).toBe('—')
    expect(formatarDataHora(new Date(Number.NaN))).toBe('—')
  })
})

describe('formatarNumero', () => {
  it('usa ponto como separador de milhar', () => {
    expect(formatarNumero(1234)).toBe('1.234')
    expect(formatarNumero(1234567)).toBe('1.234.567')
  })

  it('usa vírgula como separador decimal', () => {
    expect(formatarNumero(1234.5)).toBe('1.234,5')
  })

  it('formata zero como zero — zero medido não é ausência', () => {
    // Const. I proíbe exibir ausência como zero; não proíbe exibir um zero verdadeiro.
    expect(formatarNumero(0)).toBe('0')
  })

  it('preserva o sinal negativo', () => {
    expect(formatarNumero(-42)).toBe('-42')
  })

  it('devolve travessão para null e undefined', () => {
    expect(formatarNumero(null)).toBe('—')
    expect(formatarNumero(undefined)).toBe('—')
  })

  it('devolve travessão para NaN e Infinity, nunca zero', () => {
    expect(formatarNumero(Number.NaN)).toBe('—')
    expect(formatarNumero(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatarFracao', () => {
  it('exibe os dois inteiros separados por barra', () => {
    expect(formatarFracao(2, 3)).toBe('2 / 3')
  })

  it('mantém o separador de milhar em cada lado', () => {
    expect(formatarFracao(1234, 5678)).toBe('1.234 / 5.678')
  })

  it('exibe numerador zero quando o denominador existe', () => {
    // Zero acerto em três itens é informação; não pode virar travessão.
    expect(formatarFracao(0, 3)).toBe('0 / 3')
  })

  it('devolve travessão quando falta o numerador', () => {
    expect(formatarFracao(null, 3)).toBe('—')
  })

  it('devolve travessão quando falta o denominador — nunca "2 / —"', () => {
    expect(formatarFracao(2, null)).toBe('—')
  })

  it('devolve travessão quando faltam os dois', () => {
    expect(formatarFracao(null, null)).toBe('—')
    expect(formatarFracao(undefined, undefined)).toBe('—')
  })
})

describe('formatarPercentualDeNumero', () => {
  it('arredonda para duas casas com vírgula decimal', () => {
    expect(formatarPercentualDeNumero(66.666666)).toBe('66,67%')
  })

  it('mantém as duas casas em valor inteiro', () => {
    expect(formatarPercentualDeNumero(100)).toBe('100,00%')
  })

  it('respeita o número de casas pedido', () => {
    expect(formatarPercentualDeNumero(66.666666, 0)).toBe('67%')
    expect(formatarPercentualDeNumero(89.6226, 1)).toBe('89,6%')
  })

  it('separa milhar com ponto', () => {
    expect(formatarPercentualDeNumero(1234.5)).toBe('1.234,50%')
  })

  it('devolve travessão para null, undefined e NaN — nunca 0%', () => {
    expect(formatarPercentualDeNumero(null)).toBe('—')
    expect(formatarPercentualDeNumero(undefined)).toBe('—')
    expect(formatarPercentualDeNumero(Number.NaN)).toBe('—')
  })

  it('formata zero medido como 0,00%', () => {
    expect(formatarPercentualDeNumero(0)).toBe('0,00%')
  })
})
