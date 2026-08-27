import { describe, expect, it } from 'vitest'
import { parseSkillResult } from '@/modules/imports/domain/parse-skill-result'

/**
 * Tabela do contrato, caso a caso.
 * specs/001-painel-analise-leitura/contracts/domain-functions.md#parseskillresult
 */
describe('parseSkillResult', () => {
  describe('valores aceitos', () => {
    it.each<[string, number, number]>([
      ['1 / 1', 1, 1],
      ['1/1', 1, 1],
      [' 1 / 2 ', 1, 2],
      ['2 / 3', 2, 3],
      ['1 /2', 1, 2],
      ['0 / 4', 0, 4],
      ['3/3', 3, 3],
    ])('interpreta %j como %i de %i', (raw, acertos, itensPossiveis) => {
      expect(parseSkillResult(raw)).toEqual({
        ok: true,
        value: { valorOriginal: raw, acertos, itensPossiveis },
      })
    })

    it('preserva a string como recebida, não a normalizada (FR-030)', () => {
      const outcome = parseSkillResult('1 /2')
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) throw new Error('esperava sucesso')
      expect(outcome.value.valorOriginal).toBe('1 /2')
      expect(outcome.value.valorOriginal).not.toBe('1/2')
    })

    it('preserva também os espaços das extremidades', () => {
      const outcome = parseSkillResult(' 1 / 2 ')
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) throw new Error('esperava sucesso')
      expect(outcome.value.valorOriginal).toBe(' 1 / 2 ')
    })

    it('respeita a invariante de aceitação em todo valor aceito (FR-032)', () => {
      const outcome = parseSkillResult('2 / 3')
      if (!outcome.ok) throw new Error('esperava sucesso')
      const { acertos, itensPossiveis } = outcome.value
      expect(acertos).not.toBeNull()
      expect(itensPossiveis).not.toBeNull()
      if (acertos === null || itensPossiveis === null) {
        throw new Error('esperava inteiros')
      }
      expect(acertos).toBeGreaterThanOrEqual(0)
      expect(itensPossiveis).toBeGreaterThan(0)
      expect(acertos).toBeLessThanOrEqual(itensPossiveis)
    })
  })

  describe('ausência — jamais zero (Const. I, FR-031)', () => {
    it.each<[string, string | null | undefined]>([
      ['string vazia', ''],
      ['somente espaços', '   '],
      ['null', null],
      ['undefined', undefined],
    ])('trata %s como ausência', (_caso, raw) => {
      expect(parseSkillResult(raw)).toEqual({
        ok: true,
        value: { valorOriginal: null, acertos: null, itensPossiveis: null },
      })
    })

    it('não converte ausência em zero', () => {
      const outcome = parseSkillResult(null)
      if (!outcome.ok) throw new Error('esperava sucesso')
      expect(outcome.value.acertos).toBeNull()
      expect(outcome.value.acertos).not.toBe(0)
      expect(outcome.value.itensPossiveis).toBeNull()
      expect(outcome.value.itensPossiveis).not.toBe(0)
    })
  })

  describe('acertos acima do máximo', () => {
    it('rejeita "2 / 1" com SKILL_VALUE_OVER_MAX', () => {
      expect(parseSkillResult('2 / 1')).toEqual({
        ok: false,
        code: 'SKILL_VALUE_OVER_MAX',
        originalValue: '2 / 1',
      })
    })

    it('preserva o valor original do erro exatamente como recebido', () => {
      expect(parseSkillResult('  5 / 4 ')).toEqual({
        ok: false,
        code: 'SKILL_VALUE_OVER_MAX',
        originalValue: '  5 / 4 ',
      })
    })
  })

  describe('valores inválidos', () => {
    it.each<[string]>([
      ['1 / 0'],
      ['0 / 0'],
      ['-1 / 2'],
      ['1 / -2'],
      ['texto'],
      ['120%'],
      ['1'],
      ['1 / 2 / 3'],
      ['/'],
      ['1 / '],
      [' / 2'],
      ['1,5 / 2'],
      ['1.5 / 2'],
      ['1 / a'],
      ['1e2 / 3'],
    ])('rejeita %j com SKILL_VALUE_INVALID', (raw) => {
      expect(parseSkillResult(raw)).toEqual({
        ok: false,
        code: 'SKILL_VALUE_INVALID',
        originalValue: raw,
      })
    })

    it('rejeita numerador fora do alcance exato de inteiro (Const. II)', () => {
      const raw = '99999999999999999999 / 2'
      expect(parseSkillResult(raw)).toEqual({
        ok: false,
        code: 'SKILL_VALUE_INVALID',
        originalValue: raw,
      })
    })

    it('rejeita denominador fora do alcance exato de inteiro (Const. II)', () => {
      const raw = '1 / 99999999999999999999'
      expect(parseSkillResult(raw)).toEqual({
        ok: false,
        code: 'SKILL_VALUE_INVALID',
        originalValue: raw,
      })
    })
  })

  it('distingue ausência de inválido — nunca se confundem', () => {
    const ausente = parseSkillResult('   ')
    const invalido = parseSkillResult('texto')
    expect(ausente.ok).toBe(true)
    expect(invalido.ok).toBe(false)
  })

  it('é determinística: mesma entrada, mesma saída', () => {
    expect(parseSkillResult('2 / 3')).toEqual(parseSkillResult('2 / 3'))
    expect(parseSkillResult('2 / 1')).toEqual(parseSkillResult('2 / 1'))
  })
})
