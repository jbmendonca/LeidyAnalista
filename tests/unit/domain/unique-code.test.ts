import { describe, expect, it } from 'vitest'

import {
  ehCodigoUnicoValido,
  gerarCodigoUnico,
  normalizarCodigoUnico,
} from '@/modules/students/domain/unique-code'

/** Gerador determinístico, para exercitar o mapeamento byte → símbolo. */
function bytesFixos(valores: readonly number[]): (n: number) => Uint8Array {
  return (n: number) => {
    const saida = new Uint8Array(n)
    for (let i = 0; i < n; i++) saida[i] = valores[i % valores.length] ?? 0
    return saida
  }
}

describe('geração do código único', () => {
  it('produz o formato canônico: 5 símbolos, hífen, 5 símbolos', () => {
    const codigo = gerarCodigoUnico()
    expect(codigo).toHaveLength(11)
    expect(codigo[5]).toBe('-')
    expect(ehCodigoUnicoValido(codigo)).toBe(true)
  })

  it('usa apenas símbolos sem ambiguidade visual', () => {
    // O código será transcrito à mão da exportação para a planilha da avaliação
    // seguinte. 0/O, 1/I/L, 2/Z, 5/S e 8/B são os pares que trocam nessa hora.
    const proibidos = ['0', 'O', '1', 'I', 'L', '2', 'Z', '5', 'S', '8', 'B']
    for (let i = 0; i < 200; i++) {
      const codigo = gerarCodigoUnico().replace('-', '')
      for (const s of proibidos) {
        expect(codigo, `"${codigo}" contém símbolo ambíguo "${s}"`).not.toContain(s)
      }
    }
  })

  it('não é derivado de dado pessoal — a mesma chamada muda a cada vez', () => {
    const amostra = new Set(Array.from({ length: 500 }, () => gerarCodigoUnico()))
    // 500 gerações num espaço de 25^10 não podem colidir na prática. Uma
    // colisão aqui indicaria fonte de aleatoriedade degenerada.
    expect(amostra.size).toBe(500)
  })

  it('mapeia bytes para símbolos de forma determinística', () => {
    const a = gerarCodigoUnico(bytesFixos([0]))
    const b = gerarCodigoUnico(bytesFixos([0]))
    expect(a).toBe(b)
    expect(ehCodigoUnicoValido(a)).toBe(true)
  })

  it('o byte 255 continua produzindo símbolo válido', () => {
    const codigo = gerarCodigoUnico(bytesFixos([255]))
    expect(ehCodigoUnicoValido(codigo)).toBe(true)
  })
})

describe('validação do código', () => {
  it('aceita o formato canônico', () => {
    expect(ehCodigoUnicoValido('A7K3M-QX9DF')).toBe(true)
  })

  it('rejeita sem hífen, com tamanho errado ou com símbolo fora do alfabeto', () => {
    expect(ehCodigoUnicoValido('A7K3MQX9DF')).toBe(false)
    expect(ehCodigoUnicoValido('A7K3M-QX9D')).toBe(false)
    expect(ehCodigoUnicoValido('a7k3m-qx9df')).toBe(false)
    expect(ehCodigoUnicoValido('A0K3M-QX9DF')).toBe(false)
    expect(ehCodigoUnicoValido('')).toBe(false)
  })
})

describe('normalização de código digitado', () => {
  it('remove espaços, aplica maiúsculas e recoloca o hífen', () => {
    expect(normalizarCodigoUnico('  a7k3mqx9df  ')).toBe('A7K3M-QX9DF')
    expect(normalizarCodigoUnico('A7K3M-QX9DF')).toBe('A7K3M-QX9DF')
    expect(normalizarCodigoUnico('a7k3m qx9df')).toBe('A7K3M-QX9DF')
  })

  it('NÃO corrige símbolo ambíguo', () => {
    // Trocar "0" por "O" em silêncio poderia apontar para outro estudante —
    // é exatamente a correção silenciosa que o Princípio VII proíbe.
    expect(normalizarCodigoUnico('A0K3MQX9DF')).toBe('A0K3M-QX9DF')
  })

  it('devolve a entrada limpa quando o tamanho não bate, sem inventar hífen', () => {
    expect(normalizarCodigoUnico('abc')).toBe('ABC')
  })
})
