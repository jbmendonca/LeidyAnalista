import { describe, expect, it } from 'vitest'

import { detectarFormato, validarExtensao } from '@/modules/imports/infra/format-detector'

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])
const CSV = Buffer.from('Rede;Turma\nMUNICIPAL;4º ANO A\n', 'utf-8')

describe('validarExtensao', () => {
  it('aceita .csv, .xlsx e .xls, com ou sem maiúsculas', () => {
    expect(validarExtensao('resultados.csv')).toBe(true)
    expect(validarExtensao('resultados.xlsx')).toBe(true)
    expect(validarExtensao('resultados.xls')).toBe(true)
    expect(validarExtensao('RESULTADOS.CSV')).toBe(true)
  })

  it('recusa extensão inválida ou ausente', () => {
    expect(validarExtensao('resultados.pdf')).toBe(false)
    expect(validarExtensao('resultados.ods')).toBe(false)
    expect(validarExtensao('resultados.xlsm')).toBe(false)
    expect(validarExtensao('resultados')).toBe(false)
  })
})

describe('detectarFormato', () => {
  it('reconhece xlsx pela assinatura PK', () => {
    expect(detectarFormato('planilha.xlsx', ZIP)).toBe('xlsx')
  })

  it('reconhece xls pela assinatura OLE2 (D0 CF 11 E0)', () => {
    expect(detectarFormato('planilha.xls', OLE2)).toBe('xls')
  })

  it('reconhece csv pela extensão', () => {
    expect(detectarFormato('resultados.csv', CSV)).toBe('csv')
  })

  it('a assinatura tem precedência sobre a extensão', () => {
    // Planilha renomeada para .csv continua sendo planilha.
    expect(detectarFormato('resultados.csv', ZIP)).toBe('xlsx')
    expect(detectarFormato('resultados.csv', OLE2)).toBe('xls')
  })

  it('usa o MIME quando extensão e assinatura não decidem', () => {
    expect(detectarFormato('resultados', CSV, 'text/csv')).toBe('csv')
    expect(
      detectarFormato(
        'resultados',
        CSV,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('xlsx')
    expect(detectarFormato('resultados', CSV, 'text/csv; charset=utf-8')).toBe('csv')
  })

  it('devolve null quando nenhum sinal reconhece o arquivo', () => {
    expect(detectarFormato('resultados.pdf', CSV)).toBe(null)
    expect(detectarFormato('resultados.pdf', CSV, 'application/pdf')).toBe(null)
    expect(detectarFormato('resultados', CSV)).toBe(null)
  })
})
