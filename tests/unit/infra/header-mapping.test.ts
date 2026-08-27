import { describe, expect, it } from 'vitest'

import {
  COLUNAS_CONHECIDAS,
  detectarColunaHabilidade,
  normalizarCabecalho,
  proporMapeamento,
} from '@/modules/imports/infra/header-mapping'

describe('normalizarCabecalho', () => {
  it('apara, colapsa espaços, sobe para maiúsculas e remove diacríticos', () => {
    expect(normalizarCabecalho('  Nível   de  aprendizagem ')).toBe(
      'NIVEL DE APRENDIZAGEM',
    )
    expect(normalizarCabecalho('Município')).toBe('MUNICIPIO')
    expect(normalizarCabecalho('Código da Turma')).toBe('CODIGO DA TURMA')
  })

  it('remove BOM residual grudado no primeiro cabeçalho', () => {
    expect(normalizarCabecalho('﻿Rede')).toBe('REDE')
  })
})

describe('detectarColunaHabilidade', () => {
  const variacoes = [
    'H 01',
    'H01',
    'H_01',
    'H-01',
    'H.01',
    'h 01',
    ' H 01 ',
    'H 01 (2EF08_P)',
    'H01(2EF08_P)',
    'H 1',
    'H1',
  ]

  it.each(variacoes)('reconhece "%s" como H01', (cabecalho) => {
    expect(detectarColunaHabilidade(cabecalho)).toBe('H01')
  })

  it('normaliza para dois dígitos e preserva números maiores', () => {
    expect(detectarColunaHabilidade('H 12')).toBe('H12')
    expect(detectarColunaHabilidade('H9')).toBe('H09')
    expect(detectarColunaHabilidade('H 99')).toBe('H99')
  })

  it('devolve null para o que não é coluna de habilidade', () => {
    expect(detectarColunaHabilidade('Rede')).toBe(null)
    expect(detectarColunaHabilidade('Habilidade')).toBe(null)
    expect(detectarColunaHabilidade('Nível de aprendizagem')).toBe(null)
    expect(detectarColunaHabilidade('H')).toBe(null)
    expect(detectarColunaHabilidade('H 00')).toBe(null)
    expect(detectarColunaHabilidade('H 100')).toBe(null)
    expect(detectarColunaHabilidade('')).toBe(null)
  })
})

describe('COLUNAS_CONHECIDAS', () => {
  it('guarda as variações já normalizadas', () => {
    for (const variacoes of Object.values(COLUNAS_CONHECIDAS)) {
      for (const variacao of variacoes) {
        expect(normalizarCabecalho(variacao)).toBe(variacao)
      }
    }
  })
})

describe('proporMapeamento', () => {
  const CABECALHOS_REAIS = [
    'Rede',
    'Ano Escolar',
    'Componente Curricular',
    'Estado',
    'Município',
    'Código da Turma',
    'Turma',
    'Estudante',
    'Avaliado',
    'Nível de aprendizagem',
  ]

  it('mapeia as dez colunas conhecidas com acento', () => {
    const { campos, naoMapeadas } = proporMapeamento(CABECALHOS_REAIS)

    expect(campos).toEqual({
      rede: 0,
      anoEscolar: 1,
      componenteCurricular: 2,
      estado: 3,
      municipio: 4,
      codigoTurma: 5,
      turma: 6,
      estudante: 7,
      avaliado: 8,
      nivelAprendizagem: 9,
    })
    expect(naoMapeadas).toEqual([])
  })

  it('mapeia as mesmas dez colunas sem acento e em maiúsculas', () => {
    const semAcento = [
      'REDE',
      'ANO ESCOLAR',
      'COMPONENTE CURRICULAR',
      'ESTADO',
      'MUNICIPIO',
      'CODIGO DA TURMA',
      'TURMA',
      'ESTUDANTE',
      'AVALIADO',
      'NIVEL DE APRENDIZAGEM',
    ]

    expect(proporMapeamento(semAcento).campos).toEqual(
      proporMapeamento(CABECALHOS_REAIS).campos,
    )
  })

  it('reconhece o código único do estudante em suas variações', () => {
    expect(proporMapeamento(['Código Único']).campos).toEqual({ codigoUnico: 0 })
    expect(proporMapeamento(['Código do Estudante']).campos).toEqual({ codigoUnico: 0 })
  })

  it('separa habilidades de campos e guarda o índice de cada uma', () => {
    const { campos, habilidades, naoMapeadas } = proporMapeamento([
      ...CABECALHOS_REAIS,
      'H 01',
      'H 02',
      'H 03',
    ])

    expect(Object.keys(campos)).toHaveLength(10)
    expect(habilidades).toEqual({ H01: 10, H02: 11, H03: 12 })
    expect(naoMapeadas).toEqual([])
  })

  it('lista os cabeçalhos irreconhecíveis exatamente como vieram', () => {
    const { naoMapeadas } = proporMapeamento(['Rede', 'Observações  do professor', ''])

    expect(naoMapeadas).toEqual(['Observações  do professor', ''])
  })

  it('na coluna repetida, a primeira ocorrência vence e a segunda é sinalizada', () => {
    const { campos, habilidades, naoMapeadas } = proporMapeamento([
      'Turma',
      'TURMA',
      'H 01',
      'H01',
    ])

    expect(campos).toEqual({ turma: 0 })
    expect(habilidades).toEqual({ H01: 2 })
    expect(naoMapeadas).toEqual(['TURMA', 'H01'])
  })
})
