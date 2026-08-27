import { describe, expect, it } from 'vitest'

import {
  decodificar,
  detectarCodificacao,
  removerBom,
} from '@/modules/imports/infra/encoding'

const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf])
const BOM_UTF16LE = Buffer.from([0xff, 0xfe])
const BOM_UTF16BE = Buffer.from([0xfe, 0xff])

describe('removerBom', () => {
  it('remove o BOM UTF-8', () => {
    const entrada = Buffer.concat([BOM_UTF8, Buffer.from('Rede;Turma', 'utf-8')])
    const { buffer, tinhaBom } = removerBom(entrada)

    expect(tinhaBom).toBe(true)
    expect(buffer.toString('utf-8')).toBe('Rede;Turma')
  })

  it('remove o BOM UTF-16LE', () => {
    const { buffer, tinhaBom } = removerBom(
      Buffer.concat([BOM_UTF16LE, Buffer.from('Rede', 'utf16le')]),
    )

    expect(tinhaBom).toBe(true)
    expect(buffer.toString('utf16le')).toBe('Rede')
  })

  it('remove o BOM UTF-16BE', () => {
    const { buffer, tinhaBom } = removerBom(
      Buffer.concat([BOM_UTF16BE, Buffer.from([0x00, 0x52])]),
    )

    expect(tinhaBom).toBe(true)
    expect(buffer.length).toBe(2)
  })

  it('não altera buffer sem BOM', () => {
    const entrada = Buffer.from('Rede;Turma', 'utf-8')
    const { buffer, tinhaBom } = removerBom(entrada)

    expect(tinhaBom).toBe(false)
    expect(buffer.toString('utf-8')).toBe('Rede;Turma')
  })

  it('não confunde buffer curto com BOM', () => {
    expect(removerBom(Buffer.from([0xef])).tinhaBom).toBe(false)
    expect(removerBom(Buffer.alloc(0)).tinhaBom).toBe(false)
  })
})

describe('detectarCodificacao', () => {
  it('reconhece UTF-8 pelo BOM', () => {
    expect(detectarCodificacao(Buffer.concat([BOM_UTF8, Buffer.from('a')]))).toBe('utf-8')
  })

  it('reconhece UTF-16LE e UTF-16BE pelo BOM', () => {
    expect(detectarCodificacao(Buffer.concat([BOM_UTF16LE, Buffer.from('a')]))).toBe(
      'utf-16le',
    )
    expect(detectarCodificacao(Buffer.concat([BOM_UTF16BE, Buffer.from('a')]))).toBe(
      'utf-16be',
    )
  })

  it('reconhece UTF-8 sem BOM por decodificação estrita', () => {
    expect(detectarCodificacao(Buffer.from('Município;Nível', 'utf-8'))).toBe('utf-8')
  })

  it('cai para latin1 quando a decodificação UTF-8 estrita falha', () => {
    // "Município" em ISO-8859-1: 0xFA isolado não é sequência UTF-8 válida.
    const latin1 = Buffer.from('Município', 'latin1')

    expect(detectarCodificacao(latin1)).toBe('latin1')
  })
})

describe('decodificar', () => {
  it('remove o BOM antes de decodificar — o primeiro cabeçalho não vem grudado', () => {
    const entrada = Buffer.concat([BOM_UTF8, Buffer.from('Rede;Ano Escolar', 'utf-8')])
    const texto = decodificar(entrada)

    expect(texto.startsWith('Rede')).toBe(true)
    expect(texto.includes('﻿')).toBe(false)
    expect(texto.split(';')[0]).toBe('Rede')
  })

  it('preserva acentos em UTF-8', () => {
    const entrada = Buffer.concat([
      BOM_UTF8,
      Buffer.from('Município;Nível de aprendizagem;4º ANO', 'utf-8'),
    ])

    expect(decodificar(entrada)).toBe('Município;Nível de aprendizagem;4º ANO')
  })

  it('preserva acentos em latin1', () => {
    const entrada = Buffer.from('Município;Nível de aprendizagem', 'latin1')

    expect(decodificar(entrada)).toBe('Município;Nível de aprendizagem')
  })

  it('aceita codificação informada, sobrepondo a detecção', () => {
    const entrada = Buffer.from('Município', 'latin1')

    expect(decodificar(entrada, 'latin1')).toBe('Município')
  })

  it('decodifica UTF-16LE com BOM', () => {
    const entrada = Buffer.concat([
      BOM_UTF16LE,
      Buffer.from('Município;Nível', 'utf16le'),
    ])

    expect(decodificar(entrada)).toBe('Município;Nível')
  })
})
