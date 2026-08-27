import { describe, expect, it } from 'vitest'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import { normalizeClassCode } from '@/modules/classes/domain/normalize-class-code'

describe('normalizeStudentName', () => {
  it('aplica trim, colapso, maiúsculas e diacríticos na ordem do contrato', () => {
    expect(normalizeStudentName('  José   da Silva  ')).toBe('JOSE DA SILVA')
  })

  it.each<[string, string]>([
    ['José', 'JOSE'],
    ['Conceição', 'CONCEICAO'],
    ['Ângela Nuñez', 'ANGELA NUNEZ'],
    ['Otávio Küçük', 'OTAVIO KUCUK'],
    ['maria', 'MARIA'],
    ['MARIA', 'MARIA'],
    ['mArIa DaS gRaÇaS', 'MARIA DAS GRACAS'],
    ['Ana  Paula', 'ANA PAULA'],
    ['Ana\tPaula', 'ANA PAULA'],
    ['Ana \n Paula', 'ANA PAULA'],
    ['   ', ''],
    ['', ''],
  ])('normaliza %j em %j', (input, expected) => {
    expect(normalizeStudentName(input)).toBe(expected)
  })

  it('trata acento, caixa e espaços múltiplos numa só passagem', () => {
    expect(normalizeStudentName('  ÂNGELA   maria   DA conceição ')).toBe(
      'ANGELA MARIA DA CONCEICAO',
    )
  })

  it('não altera o nome original — devolve uma string nova', () => {
    const original = '  José   da Silva  '
    normalizeStudentName(original)
    expect(original).toBe('  José   da Silva  ')
  })

  it('é idempotente', () => {
    const once = normalizeStudentName('  José   da Silva  ')
    expect(normalizeStudentName(once)).toBe(once)
  })

  it('faz nomes equivalentes colidirem, como exige a detecção de duplicidade', () => {
    expect(normalizeStudentName('José da Silva')).toBe(
      normalizeStudentName('JOSE DA SILVA'),
    )
  })
})

describe('normalizeClassCode', () => {
  it('remove os espaços das duas extremidades do código real do arquivo', () => {
    expect(normalizeClassCode(' 8npu2dd9128c ')).toBe('8npu2dd9128c')
  })

  it.each<[string, string]>([
    ['8npu2dd9128c', '8npu2dd9128c'],
    ['  8npu2dd9128c', '8npu2dd9128c'],
    ['8npu2dd9128c  ', '8npu2dd9128c'],
    ['\t8npu2dd9128c\n', '8npu2dd9128c'],
    ['', ''],
    ['   ', ''],
  ])('normaliza %j em %j', (input, expected) => {
    expect(normalizeClassCode(input)).toBe(expected)
  })

  it('preserva a caixa — o código é opaco', () => {
    expect(normalizeClassCode(' 8NPU2dd9128C ')).toBe('8NPU2dd9128C')
    expect(normalizeClassCode('AbC')).not.toBe('ABC')
  })

  it('preserva o conteúdo interno, inclusive espaços e hífens', () => {
    expect(normalizeClassCode('  turma 8 - A  ')).toBe('turma 8 - A')
  })

  it('não remove diacríticos', () => {
    expect(normalizeClassCode(' códigó ')).toBe('códigó')
  })

  it('é idempotente', () => {
    const once = normalizeClassCode(' 8npu2dd9128c ')
    expect(normalizeClassCode(once)).toBe(once)
  })
})
