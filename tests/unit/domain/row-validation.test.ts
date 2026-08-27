import { describe, expect, it } from 'vitest'

import {
  detectarColisoesNoArquivo,
  interpretarAvaliado,
  normalizarNivel,
  validarLinha,
  type LinhaBruta,
  type LinhaInterpretada,
} from '@/modules/imports/domain/row-validation'
import {
  contarPorSeveridade,
  criarInconsistencia,
  SEVERIDADE,
  temErro,
} from '@/modules/imports/domain/severity'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import { normalizeClassCode } from '@/modules/classes/domain/normalize-class-code'

const HABILIDADES_VAZIAS = { H01: '', H02: '', H03: '' }

function linha(parcial: Partial<LinhaBruta> = {}): LinhaBruta {
  return {
    rowNumber: 2,
    rede: 'MUNICIPAL',
    anoEscolar: '4º ANO',
    componenteCurricular: 'LÍNGUA PORTUGUESA',
    estado: 'RORAIMA',
    municipio: 'BOA VISTA',
    codigoTurma: ' abc123 ',
    turma: '4º ANO A',
    estudante: 'MARIA DA SILVA',
    avaliado: 'Sim',
    nivelAprendizagem: 'Adequado',
    habilidades: { H01: ' 1 / 1', H02: ' 0 / 1', H03: ' 2 / 3' },
    ...parcial,
  }
}

function validar(parcial: Partial<LinhaBruta> = {}) {
  return validarLinha(linha(parcial), normalizeStudentName, normalizeClassCode)
}

describe('interpretarAvaliado', () => {
  it('reconhece as formas afirmativas, com e sem acento', () => {
    for (const v of ['Sim', 'SIM', ' sim ', 'S', 'true', '1']) {
      expect(interpretarAvaliado(v), v).toBe(true)
    }
  })

  it('trata tudo o mais como não avaliado', () => {
    for (const v of ['Não', 'NAO', 'não', 'N', '', '0', 'talvez']) {
      expect(interpretarAvaliado(v), v).toBe(false)
    }
  })
})

describe('normalizarNivel', () => {
  it('reconhece os três níveis oficiais, tolerando acento e caixa', () => {
    expect(normalizarNivel('Adequado')).toBe('ADEQUADO')
    expect(normalizarNivel(' intermediário ')).toBe('INTERMEDIARIO')
    expect(normalizarNivel('DEFASAGEM')).toBe('DEFASAGEM')
  })

  it('devolve null para valor fora do conjunto — sem descartar nem substituir', () => {
    expect(normalizarNivel('-')).toBeNull()
    expect(normalizarNivel('')).toBeNull()
    expect(normalizarNivel('Excelente')).toBeNull()
  })
})

describe('validarLinha', () => {
  it('interpreta a linha completa sem inconsistência', () => {
    const { linha: l, inconsistencias } = validar()
    expect(inconsistencias).toHaveLength(0)
    expect(l.avaliado).toBe(true)
    expect(l.codigoTurmaNormalizado).toBe('abc123')
    expect(l.nomeNormalizado).toBe('MARIA DA SILVA')
    expect(l.nivelNormalizado).toBe('ADEQUADO')
  })

  it('preserva o valor original de cada habilidade, com os espaços', () => {
    const { linha: l } = validar()
    expect(l.habilidades['H01']?.valorOriginal).toBe(' 1 / 1')
    expect(l.habilidades['H01']?.acertos).toBe(1)
    expect(l.habilidades['H01']?.itensPossiveis).toBe(1)
  })

  it('preserva o Nível de aprendizagem da fonte sem alteração', () => {
    const { linha: l } = validar({ nivelAprendizagem: 'Intermediário' })
    expect(l.nivelOriginal).toBe('Intermediário')
    expect(l.nivelNormalizado).toBe('INTERMEDIARIO')
  })

  it('acusa estudante sem nome como ERROR', () => {
    const { inconsistencias } = validar({ estudante: '   ' })
    const i = inconsistencias.find((x) => x.code === 'STUDENT_NAME_MISSING')
    expect(i?.severity).toBe('ERROR')
  })

  it('acusa código da turma ausente como ERROR', () => {
    const { inconsistencias } = validar({ codigoTurma: '  ' })
    const i = inconsistencias.find((x) => x.code === 'CLASS_CODE_MISSING')
    expect(i?.severity).toBe('ERROR')
  })

  it('acusa valor de habilidade inválido como ERROR, preservando o valor encontrado', () => {
    const { inconsistencias, linha: l } = validar({
      habilidades: { H01: 'texto', H02: ' 1 / 1', H03: ' 1 / 3' },
    })
    const i = inconsistencias.find((x) => x.code === 'SKILL_VALUE_INVALID')
    expect(i?.severity).toBe('ERROR')
    expect(i?.originalValue).toBe('texto')
    // O valor original permanece, mas sem interpretação numérica.
    expect(l.habilidades['H01']?.valorOriginal).toBe('texto')
    expect(l.habilidades['H01']?.acertos).toBeNull()
  })

  it('acusa acertos maiores que itens como ERROR', () => {
    const { inconsistencias } = validar({
      habilidades: { H01: '2 / 1', H02: '1 / 1', H03: '1 / 3' },
    })
    expect(inconsistencias.find((x) => x.code === 'SKILL_VALUE_OVER_MAX')?.severity).toBe(
      'ERROR',
    )
  })

  it('avaliado sem nenhum resultado é WARNING — contradição, não corrupção', () => {
    const { inconsistencias } = validar({ habilidades: HABILIDADES_VAZIAS })
    const i = inconsistencias.find((x) => x.code === 'EVALUATED_WITHOUT_RESULTS')
    expect(i?.severity).toBe('WARNING')
  })

  it('não avaliado com resultados preenchidos é WARNING e informa quantos', () => {
    const { inconsistencias } = validar({ avaliado: 'Não', nivelAprendizagem: '-' })
    const i = inconsistencias.find((x) => x.code === 'NOT_EVALUATED_WITH_RESULTS')
    expect(i?.severity).toBe('WARNING')
    expect(i?.message).toMatch(/3 habilidade/)
  })

  it('nível vazio em avaliado é WARNING', () => {
    const { inconsistencias } = validar({ nivelAprendizagem: '' })
    expect(
      inconsistencias.find((x) => x.code === 'LEVEL_MISSING_FOR_EVALUATED')?.severity,
    ).toBe('WARNING')
  })

  it('não avaliado não recebe nível normalizado, mesmo com valor na fonte', () => {
    const { linha: l } = validar({
      avaliado: 'Não',
      nivelAprendizagem: 'Adequado',
      habilidades: HABILIDADES_VAZIAS,
    })
    expect(l.avaliado).toBe(false)
    expect(l.nivelNormalizado).toBeNull()
    // O valor da fonte continua preservado — não é apagado, só não é usado.
    expect(l.nivelOriginal).toBe('Adequado')
  })

  it('célula vazia vira ausência, jamais zero', () => {
    const { linha: l } = validar({ habilidades: HABILIDADES_VAZIAS, avaliado: 'Não' })
    for (const r of Object.values(l.habilidades)) {
      expect(r.acertos).toBeNull()
      expect(r.itensPossiveis).toBeNull()
      expect(r.acertos).not.toBe(0)
    }
  })

  it('reconhece o código único quando presente e o ignora quando vazio', () => {
    expect(validar({ codigoUnico: ' a7k3mqx9df ' }).linha.codigoUnico).toBe('A7K3M-QX9DF')
    expect(validar({ codigoUnico: '   ' }).linha.codigoUnico).toBeNull()
    expect(validar().linha.codigoUnico).toBeNull()
  })
})

describe('colisões dentro do arquivo', () => {
  function interpretada(
    rowNumber: number,
    nome: string,
    turma: string,
    codigo: string | null = null,
  ): LinhaInterpretada {
    return {
      rowNumber,
      rede: '',
      anoEscolar: '',
      componenteCurricular: '',
      estado: '',
      municipio: '',
      codigoTurmaNormalizado: turma,
      turma: '',
      nomeOriginal: nome,
      nomeNormalizado: normalizeStudentName(nome),
      avaliado: true,
      nivelOriginal: 'Adequado',
      nivelNormalizado: 'ADEQUADO',
      codigoUnico: codigo,
      habilidades: {},
    }
  }

  it('mesma turma e mesmo nome é ERROR bloqueante, nas duas linhas', () => {
    const r = detectarColisoesNoArquivo([
      interpretada(2, 'ANA SOUZA', 'T1'),
      interpretada(3, 'ANA SOUZA', 'T1'),
    ])
    const colisoes = r.filter((i) => i.code === 'DUPLICATE_KEY_IN_FILE')
    expect(colisoes).toHaveLength(2)
    expect(colisoes.every((c) => c.severity === 'ERROR')).toBe(true)
    expect(colisoes[0]?.message).toMatch(/Linhas: 2, 3/)
  })

  it('mesmo nome em turmas diferentes é apenas WARNING — provável transferência', () => {
    const r = detectarColisoesNoArquivo([
      interpretada(2, 'ANA SOUZA', 'T1'),
      interpretada(3, 'ANA SOUZA', 'T2'),
    ])
    expect(r.filter((i) => i.code === 'DUPLICATE_KEY_IN_FILE')).toHaveLength(0)
    const alertas = r.filter((i) => i.code === 'SAME_NAME_OTHER_CLASS')
    expect(alertas).toHaveLength(2)
    expect(alertas.every((a) => a.severity === 'WARNING')).toBe(true)
  })

  it('mesmo código único em duas linhas é ERROR', () => {
    const r = detectarColisoesNoArquivo([
      interpretada(2, 'ANA SOUZA', 'T1', 'A7K3M-QX9DF'),
      interpretada(3, 'JOAO LIMA', 'T2', 'A7K3M-QX9DF'),
    ])
    const colisoes = r.filter((i) => i.code === 'DUPLICATE_UNIQUE_CODE_IN_FILE')
    expect(colisoes).toHaveLength(2)
    expect(colisoes.every((c) => c.severity === 'ERROR')).toBe(true)
  })

  it('ignora linhas sem nome ou sem turma — já acusadas como ERROR próprio', () => {
    const r = detectarColisoesNoArquivo([
      interpretada(2, '', 'T1'),
      interpretada(3, '', 'T1'),
    ])
    expect(r).toHaveLength(0)
  })

  it('conjunto sem colisão não produz inconsistência', () => {
    const r = detectarColisoesNoArquivo([
      interpretada(2, 'ANA SOUZA', 'T1'),
      interpretada(3, 'JOAO LIMA', 'T1'),
    ])
    expect(r).toHaveLength(0)
  })
})

describe('catálogo de severidades', () => {
  it('classifica como ERROR o que corromperia o cálculo', () => {
    for (const code of [
      'STUDENT_NAME_MISSING',
      'CLASS_CODE_MISSING',
      'SKILL_VALUE_INVALID',
      'SKILL_VALUE_OVER_MAX',
      'SKILL_COLUMN_MISSING',
      'DUPLICATE_KEY_IN_FILE',
      'DUPLICATE_KEY_IN_ASSESSMENT',
      'DUPLICATE_UNIQUE_CODE_IN_FILE',
      'UNKNOWN_UNIQUE_CODE',
    ] as const) {
      expect(SEVERIDADE[code], code).toBe('ERROR')
    }
  })

  it('classifica como WARNING o que é informativo', () => {
    for (const code of [
      'CODE_FROM_OTHER_SCHOOL',
      'STUDENT_NOT_REGISTERED',
      'REGISTERED_STUDENT_ABSENT',
      'SAME_NAME_OTHER_CLASS',
      'DENOMINATOR_DIVERGENT',
      'LEVEL_MISSING_FOR_EVALUATED',
      'EVALUATED_WITHOUT_RESULTS',
      'NOT_EVALUATED_WITH_RESULTS',
      'SKILL_NOT_IN_CATALOG',
      'FILE_ALREADY_IMPORTED',
    ] as const) {
      expect(SEVERIDADE[code], code).toBe('WARNING')
    }
  })

  it('temErro detecta a presença de bloqueio', () => {
    expect(temErro([criarInconsistencia('SAME_NAME_OTHER_CLASS')])).toBe(false)
    expect(temErro([criarInconsistencia('STUDENT_NAME_MISSING')])).toBe(true)
    expect(temErro([])).toBe(false)
  })

  it('contarPorSeveridade separa as duas contagens', () => {
    const r = contarPorSeveridade([
      criarInconsistencia('STUDENT_NAME_MISSING'),
      criarInconsistencia('SKILL_VALUE_INVALID'),
      criarInconsistencia('SAME_NAME_OTHER_CLASS'),
    ])
    expect(r).toEqual({ errors: 2, warnings: 1 })
  })

  it('o detalhe é acrescentado à mensagem base, sem substituí-la', () => {
    const i = criarInconsistencia('DENOMINATOR_DIVERGENT', {
      rowNumber: 7,
      column: 'H03',
      originalValue: '2',
      detalhe: 'Predominante nesta avaliação: 3 itens.',
    })
    expect(i.message).toMatch(/Quantidade de itens divergente/)
    expect(i.message).toMatch(/Predominante nesta avaliação: 3 itens\./)
    expect(i.rowNumber).toBe(7)
    expect(i.column).toBe('H03')
    expect(i.originalValue).toBe('2')
  })
})
