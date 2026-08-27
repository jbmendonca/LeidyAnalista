import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'

import { formatPercent, toPercent } from '@/lib/decimal'
import { classifyAnalyticalSkillResult } from '@/modules/analytics/domain/classify'
import type { AnalyticalBands } from '@/modules/analytics/domain/classify'
import { calculateParticipationRate } from '@/modules/analytics/domain/participation'
import { rankSkillsByFragility } from '@/modules/analytics/domain/rank-skills'
import type {
  RankCriterion,
  SkillAggregate,
} from '@/modules/analytics/domain/rank-skills'
import { calculateSkillPerformance } from '@/modules/analytics/domain/skill-performance'
import type { SkillPerformanceEntry } from '@/modules/analytics/domain/skill-performance'
import { calculateStudentPerformance } from '@/modules/analytics/domain/student-performance'
import { sortStudentsByPriority } from '@/modules/analytics/domain/student-priority'
import type { PrioritizableStudent } from '@/modules/analytics/domain/student-priority'
import type { Fraction, MaybeFraction } from '@/modules/imports/domain/types'

function fraction(acertos: number, itens: number): Fraction {
  return { acertos, itens }
}

function skill(
  shortCode: string,
  result: MaybeFraction,
  studentsInFragility = 0,
  studentsWithResult = 0,
): SkillAggregate {
  return {
    skillId: `id-${shortCode}`,
    shortCode,
    result,
    studentsInFragility,
    studentsWithResult,
  }
}

function codes(skills: readonly SkillAggregate[]): readonly string[] {
  return skills.map((s) => s.shortCode)
}

function student(
  avaliado: boolean,
  nivelNormalizado: PrioritizableStudent['nivelNormalizado'],
  performance: MaybeFraction,
  nome: string,
): PrioritizableStudent & { nome: string } {
  return { avaliado, nivelNormalizado, performance, nome }
}

function names(students: readonly { nome: string }[]): readonly string[] {
  return students.map((s) => s.nome)
}

// ---------------------------------------------------------------------------
// calculateStudentPerformance
// ---------------------------------------------------------------------------

describe('calculateStudentPerformance', () => {
  it('soma acertos e itens — exemplo do PRD §8: 15 acertos em 22 itens', () => {
    const results: MaybeFraction[] = [fraction(5, 8), fraction(4, 6), fraction(6, 8)]

    const performance = calculateStudentPerformance(results)

    expect(performance).toEqual({ acertos: 15, itens: 22 })
    // O 68,18% aparece só na tela; o domínio devolve a fração.
    expect(formatPercent(toPercent(performance))).toBe('68,18%')
  })

  it('ignora resultados nulos em vez de contá-los como zero', () => {
    const comAusencia = calculateStudentPerformance([
      fraction(3, 4),
      null,
      fraction(2, 3),
    ])
    const semAusencia = calculateStudentPerformance([fraction(3, 4), fraction(2, 3)])

    expect(comAusencia).toEqual({ acertos: 5, itens: 7 })
    expect(comAusencia).toEqual(semAusencia)
  })

  it('não infla o denominador com a habilidade ausente', () => {
    // Se `null` virasse zero, o resultado seria 3/8 (37,5%) em vez de 3/4 (75%).
    const performance = calculateStudentPerformance([fraction(3, 4), null])

    expect(formatPercent(toPercent(performance))).toBe('75,00%')
  })

  it('retorna null quando nenhuma habilidade tem resultado', () => {
    expect(calculateStudentPerformance([null, null, null])).toBeNull()
  })

  it('retorna null para conjunto vazio, nunca { acertos: 0, itens: 0 }', () => {
    const performance = calculateStudentPerformance([])

    expect(performance).toBeNull()
    expect(performance).not.toEqual({ acertos: 0, itens: 0 })
  })

  it('preserva zero acertos como resultado real, distinto de ausência', () => {
    expect(calculateStudentPerformance([fraction(0, 3)])).toEqual({
      acertos: 0,
      itens: 3,
    })
  })
})

// ---------------------------------------------------------------------------
// calculateSkillPerformance
// ---------------------------------------------------------------------------

describe('calculateSkillPerformance', () => {
  /** 20 avaliados, 3 itens cada, 37 acertos ao todo — exemplo do PRD §9. */
  function turmaDoPrd(): SkillPerformanceEntry[] {
    const entries: SkillPerformanceEntry[] = []
    for (let i = 0; i < 17; i += 1) {
      entries.push({ avaliado: true, result: fraction(2, 3) }) // 34 acertos
    }
    entries.push({ avaliado: true, result: fraction(3, 3) }) // 37 acertos
    entries.push({ avaliado: true, result: fraction(0, 3) })
    entries.push({ avaliado: true, result: fraction(0, 3) })
    return entries
  }

  it('exemplo do PRD §9: 37 acertos em 60 itens possíveis = 61,67%', () => {
    const performance = calculateSkillPerformance(turmaDoPrd())

    expect(performance).toEqual({ acertos: 37, itens: 60 })
    expect(toPercent(performance)?.toFixed(4)).toBe('61.6667')
    expect(formatPercent(toPercent(performance))).toBe('61,67%')
  })

  it('não avaliados presentes no conjunto não alteram o resultado', () => {
    const base = turmaDoPrd()
    const comNaoAvaliados: SkillPerformanceEntry[] = [
      ...base,
      { avaliado: false, result: null },
      { avaliado: false, result: null },
      // Mesmo trazendo resultado, o não avaliado fica fora dos dois lados da fração.
      { avaliado: false, result: fraction(3, 3) },
      { avaliado: false, result: fraction(0, 3) },
    ]

    expect(calculateSkillPerformance(comNaoAvaliados)).toEqual(
      calculateSkillPerformance(base),
    )
    expect(calculateSkillPerformance(comNaoAvaliados)).toEqual({
      acertos: 37,
      itens: 60,
    })
  })

  it('ignora resultado nulo dentro dos avaliados', () => {
    const performance = calculateSkillPerformance([
      { avaliado: true, result: fraction(2, 3) },
      { avaliado: true, result: null },
    ])

    expect(performance).toEqual({ acertos: 2, itens: 3 })
  })

  it('soma normalmente denominadores divergentes entre estudantes', () => {
    const performance = calculateSkillPerformance([
      { avaliado: true, result: fraction(1, 1) },
      { avaliado: true, result: fraction(2, 3) },
      { avaliado: true, result: fraction(1, 2) },
    ])

    expect(performance).toEqual({ acertos: 4, itens: 6 })
  })

  it('retorna null quando não há nenhum item possível no recorte', () => {
    expect(calculateSkillPerformance([])).toBeNull()
    expect(
      calculateSkillPerformance([
        { avaliado: false, result: fraction(3, 3) },
        { avaliado: false, result: null },
      ]),
    ).toBeNull()
    expect(calculateSkillPerformance([{ avaliado: true, result: null }])).toBeNull()
  })

  it('nunca devolve zero no lugar de ausência', () => {
    expect(calculateSkillPerformance([{ avaliado: true, result: null }])).not.toEqual({
      acertos: 0,
      itens: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// calculateParticipationRate
// ---------------------------------------------------------------------------

describe('calculateParticipationRate', () => {
  it('conta os 111 registros do arquivo de referência: 106 avaliados, 5 não', () => {
    const entries = [
      ...Array.from({ length: 106 }, () => ({ avaliado: true })),
      ...Array.from({ length: 5 }, () => ({ avaliado: false })),
    ]

    expect(calculateParticipationRate(entries)).toEqual({
      total: 111,
      avaliados: 106,
      naoAvaliados: 5,
    })
  })

  it('mantém os não avaliados no denominador — única métrica em que entram', () => {
    const { total } = calculateParticipationRate([
      { avaliado: true },
      { avaliado: false },
      { avaliado: false },
    ])

    expect(total).toBe(3)
  })

  it('conta conjunto vazio e conjuntos homogêneos', () => {
    expect(calculateParticipationRate([])).toEqual({
      total: 0,
      avaliados: 0,
      naoAvaliados: 0,
    })
    expect(calculateParticipationRate([{ avaliado: true }, { avaliado: true }])).toEqual({
      total: 2,
      avaliados: 2,
      naoAvaliados: 0,
    })
    expect(calculateParticipationRate([{ avaliado: false }])).toEqual({
      total: 1,
      avaliados: 0,
      naoAvaliados: 1,
    })
  })

  it('devolve contagens, não taxa', () => {
    const counts = calculateParticipationRate([{ avaliado: true }, { avaliado: false }])

    expect(Object.keys(counts).sort()).toEqual(['avaliados', 'naoAvaliados', 'total'])
  })
})

// ---------------------------------------------------------------------------
// classifyAnalyticalSkillResult
// ---------------------------------------------------------------------------

describe('classifyAnalyticalSkillResult', () => {
  const bands: AnalyticalBands = {
    fragilidadeMax: new Decimal(60),
    atencaoMax: new Decimal(80),
  }

  it('retorna null para ausência de resultado', () => {
    expect(classifyAnalyticalSkillResult(null, bands)).toBeNull()
  })

  it('fronteira exata em 60: 59,99% é FRAGILIDADE e 60% é ATENCAO', () => {
    expect(classifyAnalyticalSkillResult(fraction(5999, 10000), bands)).toBe(
      'FRAGILIDADE',
    )
    expect(classifyAnalyticalSkillResult(fraction(6000, 10000), bands)).toBe('ATENCAO')
    // 3/5 é 60% exato: a fronteira não depende de como o número seria exibido.
    expect(classifyAnalyticalSkillResult(fraction(3, 5), bands)).toBe('ATENCAO')
  })

  it('fronteira exata em 80: 79,99% é ATENCAO e 80% é SATISFATORIO', () => {
    expect(classifyAnalyticalSkillResult(fraction(7999, 10000), bands)).toBe('ATENCAO')
    expect(classifyAnalyticalSkillResult(fraction(8000, 10000), bands)).toBe(
      'SATISFATORIO',
    )
    expect(classifyAnalyticalSkillResult(fraction(4, 5), bands)).toBe('SATISFATORIO')
  })

  it('classifica os extremos', () => {
    expect(classifyAnalyticalSkillResult(fraction(0, 3), bands)).toBe('FRAGILIDADE')
    expect(classifyAnalyticalSkillResult(fraction(3, 3), bands)).toBe('SATISFATORIO')
  })

  it('não arredonda antes de comparar: 2/3 (66,66…%) é ATENCAO', () => {
    expect(classifyAnalyticalSkillResult(fraction(2, 3), bands)).toBe('ATENCAO')
  })

  it('usa as faixas recebidas, nunca constantes do código', () => {
    const outrasFaixas: AnalyticalBands = {
      fragilidadeMax: new Decimal(70),
      atencaoMax: new Decimal(90),
    }

    // O mesmo 60% muda de faixa apenas porque a configuração mudou.
    expect(classifyAnalyticalSkillResult(fraction(3, 5), outrasFaixas)).toBe(
      'FRAGILIDADE',
    )
    expect(classifyAnalyticalSkillResult(fraction(4, 5), outrasFaixas)).toBe('ATENCAO')
    expect(classifyAnalyticalSkillResult(fraction(19, 20), outrasFaixas)).toBe(
      'SATISFATORIO',
    )
  })

  it('aceita limites fracionários sem perder exatidão na fronteira', () => {
    const faixasFracionarias: AnalyticalBands = {
      fragilidadeMax: new Decimal('66.67'),
      atencaoMax: new Decimal(80),
    }

    // 2/3 = 66,66…% é estritamente menor que 66,67%, por pouco que seja.
    expect(classifyAnalyticalSkillResult(fraction(2, 3), faixasFracionarias)).toBe(
      'FRAGILIDADE',
    )
    // E 66,67% cravado cai na faixa de cima.
    expect(classifyAnalyticalSkillResult(fraction(6667, 10000), faixasFracionarias)).toBe(
      'ATENCAO',
    )
  })

  it('não produz nem infere nenhum valor de LearningLevel', () => {
    const niveisOficiais = ['ADEQUADO', 'INTERMEDIARIO', 'DEFASAGEM']
    const amostras = [
      fraction(0, 3),
      fraction(3, 5),
      fraction(2, 3),
      fraction(4, 5),
      fraction(3, 3),
    ]

    for (const amostra of amostras) {
      const band = classifyAnalyticalSkillResult(amostra, bands)
      expect(niveisOficiais).not.toContain(band)
      expect(['FRAGILIDADE', 'ATENCAO', 'SATISFATORIO']).toContain(band)
    }
  })
})

// ---------------------------------------------------------------------------
// rankSkillsByFragility
// ---------------------------------------------------------------------------

describe('rankSkillsByFragility', () => {
  it('LOWEST_PERCENT ordena do menor percentual para o maior', () => {
    const skills = [
      skill('H03', fraction(9, 10)),
      skill('H01', fraction(1, 10)),
      skill('H02', fraction(5, 10)),
    ]

    expect(codes(rankSkillsByFragility(skills, 'LOWEST_PERCENT'))).toEqual([
      'H01',
      'H02',
      'H03',
    ])
  })

  it('LOWEST_PERCENT compara frações exatas, não percentuais arredondados', () => {
    // 1/3 = 33,333…% e 333/1000 = 33,3%: iguais depois de arredondar, distintos aqui.
    const skills = [skill('HB', fraction(1, 3)), skill('HA', fraction(333, 1000))]

    expect(codes(rankSkillsByFragility(skills, 'LOWEST_PERCENT'))).toEqual(['HA', 'HB'])
  })

  it('FRAGILITY_RATE ordena pela maior proporção, com denominadores distintos', () => {
    const skills = [
      skill('H01', fraction(5, 10), 5, 10), // 50%
      skill('H02', fraction(5, 10), 3, 5), // 60%
      skill('H03', fraction(5, 10), 1, 10), // 10%
    ]

    expect(codes(rankSkillsByFragility(skills, 'FRAGILITY_RATE'))).toEqual([
      'H02',
      'H01',
      'H03',
    ])
  })

  it('FRAGILITY_RATE não quebra com denominador zero', () => {
    const skills = [
      skill('H02', fraction(5, 10), 0, 0),
      skill('H01', fraction(5, 10), 0, 0),
    ]

    // Empate total no critério: decide o desempate final, sem NaN nem exceção.
    expect(codes(rankSkillsByFragility(skills, 'FRAGILITY_RATE'))).toEqual(['H01', 'H02'])
  })

  it('FRAGILITY_COUNT ordena pela maior quantidade absoluta', () => {
    const skills = [
      skill('H01', fraction(5, 10), 2, 4),
      skill('H02', fraction(5, 10), 9, 40),
      skill('H03', fraction(5, 10), 5, 10),
    ]

    expect(codes(rankSkillsByFragility(skills, 'FRAGILITY_COUNT'))).toEqual([
      'H02',
      'H03',
      'H01',
    ])
  })

  it('POINTS_LOST ordena pela maior perda: Σ itens − Σ acertos', () => {
    const skills = [
      skill('H01', fraction(8, 10)), // perde 2
      skill('H02', fraction(10, 30)), // perde 20
      skill('H03', fraction(5, 10)), // perde 5
    ]

    expect(codes(rankSkillsByFragility(skills, 'POINTS_LOST'))).toEqual([
      'H02',
      'H03',
      'H01',
    ])
  })

  it('empata pelo critério e decide pela maior quantidade de itens', () => {
    const skills = [
      skill('H09', fraction(3, 6)), // 50%, 6 itens
      skill('H04', fraction(30, 60)), // 50%, 60 itens
      skill('H07', fraction(10, 20)), // 50%, 20 itens
    ]

    expect(codes(rankSkillsByFragility(skills, 'LOWEST_PERCENT'))).toEqual([
      'H04',
      'H07',
      'H09',
    ])
  })

  it('empata em critério e itens e decide pelo shortCode alfabético', () => {
    const skills = [
      skill('H12', fraction(5, 10)),
      skill('H02', fraction(5, 10)),
      skill('H07', fraction(5, 10)),
    ]

    expect(codes(rankSkillsByFragility(skills, 'LOWEST_PERCENT'))).toEqual([
      'H02',
      'H07',
      'H12',
    ])
  })

  it('tolera shortCode repetido sem perder determinismo', () => {
    const skills: SkillAggregate[] = [
      { ...skill('H05', fraction(5, 10)), skillId: 'id-a' },
      { ...skill('H05', fraction(5, 10)), skillId: 'id-b' },
    ]

    const ranked = rankSkillsByFragility(skills, 'LOWEST_PERCENT')

    expect(ranked.map((s) => s.skillId)).toEqual(['id-a', 'id-b'])
  })

  it('manda habilidades sem resultado para o fim, agrupadas e por shortCode', () => {
    const skills = [
      skill('H08', null, 4, 4),
      skill('H03', fraction(9, 10)),
      skill('H01', null),
      skill('H02', fraction(1, 10)),
    ]

    expect(codes(rankSkillsByFragility(skills, 'LOWEST_PERCENT'))).toEqual([
      'H02',
      'H03',
      'H01',
      'H08',
    ])
  })

  it('mantém os sem resultado no fim qualquer que seja a posição de entrada', () => {
    const semResultadoPrimeiro = [skill('H01', null), skill('H02', fraction(9, 10))]
    const semResultadoDepois = [skill('H02', fraction(9, 10)), skill('H01', null)]

    expect(codes(rankSkillsByFragility(semResultadoPrimeiro, 'LOWEST_PERCENT'))).toEqual([
      'H02',
      'H01',
    ])
    expect(codes(rankSkillsByFragility(semResultadoDepois, 'LOWEST_PERCENT'))).toEqual([
      'H02',
      'H01',
    ])
  })

  it('nunca trata resultado ausente como desempenho zero', () => {
    const skills = [skill('H01', null), skill('H02', fraction(0, 10))]

    // Se `null` valesse 0%, H01 empataria com H02 e poderia vir primeiro.
    expect(codes(rankSkillsByFragility(skills, 'LOWEST_PERCENT'))).toEqual(['H02', 'H01'])
  })

  it('produz ordem estável em execuções repetidas e sob entrada embaralhada', () => {
    const skills = [
      skill('H05', fraction(5, 10), 3, 6),
      skill('H01', fraction(5, 10), 3, 6),
      skill('H09', fraction(5, 10), 3, 6),
      skill('H03', null, 0, 0),
      skill('H07', null, 0, 0),
    ]
    const criterios: RankCriterion[] = [
      'LOWEST_PERCENT',
      'FRAGILITY_RATE',
      'FRAGILITY_COUNT',
      'POINTS_LOST',
    ]

    for (const criterio of criterios) {
      const esperado = ['H01', 'H05', 'H09', 'H03', 'H07']

      for (let execucao = 0; execucao < 5; execucao += 1) {
        expect(codes(rankSkillsByFragility(skills, criterio))).toEqual(esperado)
      }

      // A ordem de entrada não pode influenciar a saída.
      expect(codes(rankSkillsByFragility([...skills].reverse(), criterio))).toEqual(
        esperado,
      )
    }
  })

  it('é pura: não muta o array recebido', () => {
    const skills = [
      skill('H03', fraction(9, 10)),
      skill('H01', fraction(1, 10)),
      skill('H02', null),
    ]
    const ordemOriginal = codes(skills)

    const ranked = rankSkillsByFragility(skills, 'LOWEST_PERCENT')

    expect(codes(skills)).toEqual(ordemOriginal)
    expect(ranked).not.toBe(skills)
  })

  it('aceita conjunto vazio e conjunto unitário', () => {
    expect(rankSkillsByFragility([], 'LOWEST_PERCENT')).toEqual([])
    expect(codes(rankSkillsByFragility([skill('H01', null)], 'POINTS_LOST'))).toEqual([
      'H01',
    ])
  })
})

// ---------------------------------------------------------------------------
// sortStudentsByPriority
// ---------------------------------------------------------------------------

describe('sortStudentsByPriority', () => {
  it('ordena os grupos: Defasagem, Intermediário, Adequado e não avaliados', () => {
    const students = [
      student(true, 'ADEQUADO', fraction(9, 10), 'ana'),
      student(false, null, null, 'bruno'),
      student(true, 'DEFASAGEM', fraction(2, 10), 'carla'),
      student(true, 'INTERMEDIARIO', fraction(6, 10), 'diego'),
    ]

    expect(names(sortStudentsByPriority(students))).toEqual([
      'carla',
      'diego',
      'ana',
      'bruno',
    ])
  })

  it('coloca os não avaliados por último mesmo com nível informado', () => {
    const students = [
      student(false, 'DEFASAGEM', null, 'nao-avaliado'),
      student(true, 'ADEQUADO', fraction(10, 10), 'adequado'),
    ]

    expect(names(sortStudentsByPriority(students))).toEqual(['adequado', 'nao-avaliado'])
  })

  it('ordena por menor percentual dentro de cada grupo', () => {
    const students = [
      student(true, 'DEFASAGEM', fraction(4, 10), 'defasagem-40'),
      student(true, 'DEFASAGEM', fraction(1, 10), 'defasagem-10'),
      student(true, 'DEFASAGEM', fraction(3, 10), 'defasagem-30'),
      student(true, 'ADEQUADO', fraction(10, 10), 'adequado-100'),
      student(true, 'ADEQUADO', fraction(9, 10), 'adequado-90'),
    ]

    expect(names(sortStudentsByPriority(students))).toEqual([
      'defasagem-10',
      'defasagem-30',
      'defasagem-40',
      'adequado-90',
      'adequado-100',
    ])
  })

  it('compara percentuais com denominadores distintos sem arredondar', () => {
    const students = [
      student(true, 'DEFASAGEM', fraction(1, 3), 'um-terco'),
      student(true, 'DEFASAGEM', fraction(333, 1000), 'trinta-e-tres-virgula-tres'),
    ]

    expect(names(sortStudentsByPriority(students))).toEqual([
      'trinta-e-tres-virgula-tres',
      'um-terco',
    ])
  })

  it('põe quem não tem desempenho apurado no fim do próprio grupo', () => {
    const semDesempenhoPrimeiro = [
      student(true, 'DEFASAGEM', null, 'sem-desempenho'),
      student(true, 'DEFASAGEM', fraction(2, 10), 'com-desempenho'),
    ]
    const semDesempenhoDepois = [
      student(true, 'DEFASAGEM', fraction(2, 10), 'com-desempenho'),
      student(true, 'DEFASAGEM', null, 'sem-desempenho'),
    ]

    expect(names(sortStudentsByPriority(semDesempenhoPrimeiro))).toEqual([
      'com-desempenho',
      'sem-desempenho',
    ])
    expect(names(sortStudentsByPriority(semDesempenhoDepois))).toEqual([
      'com-desempenho',
      'sem-desempenho',
    ])
  })

  it('preserva a ordem de entrada quando ambos não têm desempenho', () => {
    const students = [
      student(true, 'DEFASAGEM', null, 'primeiro'),
      student(true, 'DEFASAGEM', null, 'segundo'),
    ]

    expect(names(sortStudentsByPriority(students))).toEqual(['primeiro', 'segundo'])
  })

  it('põe o avaliado sem nível depois do Adequado e antes dos não avaliados', () => {
    const students = [
      student(false, null, null, 'nao-avaliado'),
      student(true, null, fraction(5, 10), 'sem-nivel'),
      student(true, 'ADEQUADO', fraction(9, 10), 'adequado'),
    ]

    expect(names(sortStudentsByPriority(students))).toEqual([
      'adequado',
      'sem-nivel',
      'nao-avaliado',
    ])
  })

  it('ordena os não avaliados entre si sem inventar desempenho', () => {
    const students = [
      student(false, null, null, 'nao-avaliado-a'),
      student(false, null, null, 'nao-avaliado-b'),
    ]

    expect(names(sortStudentsByPriority(students))).toEqual([
      'nao-avaliado-a',
      'nao-avaliado-b',
    ])
  })

  it('é pura: não muta o array recebido', () => {
    const students = [
      student(true, 'ADEQUADO', fraction(9, 10), 'ana'),
      student(true, 'DEFASAGEM', fraction(2, 10), 'carla'),
    ]
    const ordemOriginal = names(students)

    const sorted = sortStudentsByPriority(students)

    expect(names(students)).toEqual(ordemOriginal)
    expect(sorted).not.toBe(students)
  })

  it('aceita conjunto vazio', () => {
    expect(sortStudentsByPriority([])).toEqual([])
  })

  it('preserva o tipo do chamador, com campos extras intactos', () => {
    const students = [
      { ...student(true, 'DEFASAGEM', fraction(2, 10), 'carla'), turmaId: 't1' },
      { ...student(true, 'ADEQUADO', fraction(9, 10), 'ana'), turmaId: 't2' },
    ]

    const [primeiro] = sortStudentsByPriority(students)

    expect(primeiro?.turmaId).toBe('t1')
  })
})
