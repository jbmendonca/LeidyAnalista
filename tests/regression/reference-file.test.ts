import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'

import { lerArquivo } from '@/modules/imports/infra/table-reader'
import { proporMapeamento } from '@/modules/imports/infra/header-mapping'
import {
  detectarColisoesNoArquivo,
  validarLinha,
  type LinhaBruta,
  type LinhaInterpretada,
} from '@/modules/imports/domain/row-validation'
import { validateSkillDenominators } from '@/modules/imports/domain/validate-denominators'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import { normalizeClassCode } from '@/modules/classes/domain/normalize-class-code'
import { calculateStudentPerformance } from '@/modules/analytics/domain/student-performance'
import { calculateSkillPerformance } from '@/modules/analytics/domain/skill-performance'
import { calculateParticipationRate } from '@/modules/analytics/domain/participation'
import { rankSkillsByFragility } from '@/modules/analytics/domain/rank-skills'
import { toPercent } from '@/lib/decimal'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  TESTE DE REGRESSÃO — Princípio X da constituição
 * ===========================================================================
 *
 * Exercita a cadeia inteira sobre o arquivo de referência: leitura, remoção de
 * BOM, mapeamento de cabeçalhos, parsing de `acertos / itens`, normalização,
 * validação e cálculo.
 *
 * É o único ponto de verificação com resposta conhecida de ponta a ponta.
 * Nenhuma alteração em regra de domínio pode ser integrada com ele falhando.
 *
 * A fixture é a versão ANONIMIZADA do arquivo real: nomes substituídos, todos
 * os valores numéricos preservados. O arquivo real contém nome completo de 111
 * crianças e não é versionado (research.md R-012).
 */

const FIXTURE = resolve(__dirname, '../fixtures/resultados-referencia.csv')

function carregarLinhas(): LinhaInterpretada[] {
  const buffer = readFileSync(FIXTURE)
  const tabela = lerArquivo(buffer, 'resultados-referencia.csv')
  const mapa = proporMapeamento(tabela.cabecalhos)

  const campo = (linha: readonly string[], nome: string): string => {
    const indice = mapa.campos[nome]
    return indice === undefined ? '' : (linha[indice] ?? '')
  }

  return tabela.linhas.map((linha, i) => {
    const habilidades: Record<string, string> = {}
    for (const [shortCode, indice] of Object.entries(mapa.habilidades)) {
      habilidades[shortCode] = linha[indice] ?? ''
    }

    const bruta: LinhaBruta = {
      rowNumber: i + 2, // +1 pelo cabeçalho, +1 porque a contagem é base 1
      rede: campo(linha, 'rede'),
      anoEscolar: campo(linha, 'anoEscolar'),
      componenteCurricular: campo(linha, 'componenteCurricular'),
      estado: campo(linha, 'estado'),
      municipio: campo(linha, 'municipio'),
      codigoTurma: campo(linha, 'codigoTurma'),
      turma: campo(linha, 'turma'),
      estudante: campo(linha, 'estudante'),
      avaliado: campo(linha, 'avaliado'),
      nivelAprendizagem: campo(linha, 'nivelAprendizagem'),
      habilidades,
    }

    return validarLinha(bruta, normalizeStudentName, normalizeClassCode).linha
  })
}

const linhas = carregarLinhas()

describe('Teste de referência — Princípio X', () => {
  describe('estrutura do arquivo', () => {
    it('reconhece 111 registros', () => {
      expect(linhas).toHaveLength(111)
    })

    it('reconhece 4 turmas distintas', () => {
      const turmas = new Set(linhas.map((l) => l.codigoTurmaNormalizado))
      expect(turmas.size).toBe(4)
    })

    it('reconhece 12 habilidades', () => {
      const primeira = linhas[0]
      expect(primeira).toBeDefined()
      expect(Object.keys(primeira!.habilidades).sort()).toEqual([
        'H01', 'H02', 'H03', 'H04', 'H05', 'H06',
        'H07', 'H08', 'H09', 'H10', 'H11', 'H12',
      ])
    })

    it('remove o BOM: o primeiro cabeçalho é exatamente "Rede"', () => {
      const tabela = lerArquivo(readFileSync(FIXTURE), 'resultados-referencia.csv')
      expect(tabela.cabecalhos[0]).toBe('Rede')
    })

    it('preserva a acentuação', () => {
      expect(linhas.every((l) => l.municipio === 'BOA VISTA')).toBe(true)
      const niveis = new Set(linhas.map((l) => l.nivelOriginal))
      expect(niveis.has('Intermediário')).toBe(true)
    })

    it('normaliza o Código da Turma removendo os espaços das extremidades', () => {
      expect(
        linhas.every((l) => l.codigoTurmaNormalizado === l.codigoTurmaNormalizado.trim()),
      ).toBe(true)
      expect(linhas.every((l) => l.codigoTurmaNormalizado.length === 12)).toBe(true)
    })
  })

  describe('participação', () => {
    it('apura 106 avaliados e 5 não avaliados', () => {
      const p = calculateParticipationRate(linhas)
      expect(p.total).toBe(111)
      expect(p.avaliados).toBe(106)
      expect(p.naoAvaliados).toBe(5)
    })

    it('taxa de participação de 95,50%', () => {
      const p = calculateParticipationRate(linhas)
      const taxa = new Decimal(p.avaliados).div(p.total).mul(100)
      expect(taxa.toFixed(2)).toBe('95.50')
    })
  })

  describe('não avaliados — Const. I e FR-059', () => {
    it('não avaliado não tem nenhum resultado de habilidade', () => {
      const naoAvaliados = linhas.filter((l) => !l.avaliado)
      expect(naoAvaliados).toHaveLength(5)
      for (const l of naoAvaliados) {
        for (const r of Object.values(l.habilidades)) {
          expect(r.acertos).toBeNull()
          expect(r.itensPossiveis).toBeNull()
        }
      }
    })

    it('ausência NUNCA vira zero', () => {
      const zeros = linhas
        .filter((l) => !l.avaliado)
        .flatMap((l) => Object.values(l.habilidades))
        .filter((r) => r.acertos === 0)
      expect(zeros).toHaveLength(0)
    })

    it('não avaliado fica fora do denominador de desempenho', () => {
      // Σ itens de cada habilidade é múltiplo exato de 106 — se algum não
      // avaliado tivesse entrado, deixaria de ser.
      const porHabilidade = agruparPorHabilidade()
      for (const [, f] of porHabilidade) {
        expect(f).not.toBeNull()
        expect(f!.itens % 106).toBe(0)
      }
    })
  })

  describe('nível de aprendizagem — Const. III', () => {
    it('distribui 96 Adequado, 7 Intermediário e 3 Defasagem entre os 106 avaliados', () => {
      const avaliados = linhas.filter((l) => l.avaliado)
      const contar = (n: string) =>
        avaliados.filter((l) => l.nivelNormalizado === n).length

      expect(contar('ADEQUADO')).toBe(96)
      expect(contar('INTERMEDIARIO')).toBe(7)
      expect(contar('DEFASAGEM')).toBe(3)
      expect(96 + 7 + 3).toBe(avaliados.length)
    })

    it('preserva o valor original da fonte sem substituição', () => {
      const originais = new Set(linhas.map((l) => l.nivelOriginal))
      expect(originais.has('Adequado')).toBe(true)
      expect(originais.has('Intermediário')).toBe(true)
      expect(originais.has('Defasagem')).toBe(true)
    })

    it('não avaliado não é contado como Defasagem', () => {
      const naoAvaliadosComNivel = linhas.filter(
        (l) => !l.avaliado && l.nivelNormalizado !== null,
      )
      expect(naoAvaliadosComNivel).toHaveLength(0)
    })
  })

  describe('denominadores — FR-015, FR-016', () => {
    it('deriva os denominadores dos dados, sem constante no código', () => {
      const entradas = linhas.flatMap((l) =>
        Object.entries(l.habilidades)
          .filter(([, r]) => r.itensPossiveis !== null)
          .map(([skillId, r]) => ({
            rowNumber: l.rowNumber,
            skillId,
            itens: r.itensPossiveis!,
          })),
      )

      const relatorio = validateSkillDenominators(entradas)
      const esperado: Record<string, number> = {
        H01: 1, H02: 1, H03: 3, H04: 1, H05: 2, H06: 2,
        H07: 2, H08: 2, H09: 2, H10: 1, H11: 2, H12: 3,
      }

      for (const [shortCode, itens] of Object.entries(esperado)) {
        const apurado = relatorio.bySkill.get(shortCode)
        expect(apurado, shortCode).toBeDefined()
        expect(apurado!.referenceItems, shortCode).toBe(itens)
        expect(apurado!.divergentRows, shortCode).toHaveLength(0)
      }
    })

    it('soma 22 itens por estudante avaliado — apurado, não fixado', () => {
      const avaliado = linhas.find((l) => l.avaliado)
      expect(avaliado).toBeDefined()
      const total = Object.values(avaliado!.habilidades).reduce(
        (s, r) => s + (r.itensPossiveis ?? 0),
        0,
      )
      expect(total).toBe(22)
    })
  })

  describe('ranking de fragilidade — PRD §38.1', () => {
    const ESPERADO = [
      ['H07', '70.75'], ['H05', '75.94'], ['H06', '79.25'], ['H10', '83.96'],
      ['H12', '84.59'], ['H11', '84.91'], ['H09', '86.32'], ['H03', '87.42'],
      ['H04', '88.68'], ['H01', '89.62'], ['H02', '90.57'], ['H08', '91.98'],
    ] as const

    it('reproduz a ordem e os percentuais com tolerância de 0,01 p.p.', () => {
      const porHabilidade = agruparPorHabilidade()

      const agregados = [...porHabilidade.entries()].map(([shortCode, result]) => ({
        skillId: shortCode,
        shortCode,
        result,
        studentsInFragility: 0,
        studentsWithResult: 106,
      }))

      const ranking = rankSkillsByFragility(agregados, 'LOWEST_PERCENT')

      expect(ranking.map((r) => r.shortCode)).toEqual(ESPERADO.map(([c]) => c))

      ranking.forEach((r, i) => {
        const [codigo, percentual] = ESPERADO[i]!
        const apurado = toPercent(r.result)
        expect(apurado, codigo).not.toBeNull()
        expect(
          apurado!.minus(percentual).abs().lessThanOrEqualTo('0.01'),
          `${codigo}: esperado ≈${percentual}%, apurado ${apurado!.toFixed(4)}%`,
        ).toBe(true)
      })
    })

    it('H07 é a mais frágil e H08 a de melhor desempenho', () => {
      const ranking = rankSkillsByFragility(
        [...agruparPorHabilidade().entries()].map(([c, result]) => ({
          skillId: c,
          shortCode: c,
          result,
          studentsInFragility: 0,
          studentsWithResult: 106,
        })),
        'LOWEST_PERCENT',
      )
      expect(ranking[0]?.shortCode).toBe('H07')
      expect(ranking[ranking.length - 1]?.shortCode).toBe('H08')
    })
  })

  describe('desempenho do estudante — FR-056', () => {
    it('soma acertos e itens, sem média de percentuais', () => {
      const avaliados = linhas.filter((l) => l.avaliado)
      for (const l of avaliados) {
        const frs: MaybeFraction[] = Object.values(l.habilidades).map((r) =>
          r.acertos === null || r.itensPossiveis === null
            ? null
            : { acertos: r.acertos, itens: r.itensPossiveis },
        )
        const desempenho = calculateStudentPerformance(frs)
        expect(desempenho).not.toBeNull()
        expect(desempenho!.itens).toBe(22)
        expect(desempenho!.acertos).toBeLessThanOrEqual(22)
      }
    })

    it('estudante não avaliado devolve null, nunca zero', () => {
      const naoAvaliado = linhas.find((l) => !l.avaliado)
      expect(naoAvaliado).toBeDefined()
      const frs: MaybeFraction[] = Object.values(naoAvaliado!.habilidades).map(() => null)
      expect(calculateStudentPerformance(frs)).toBeNull()
    })
  })

  describe('duplicidade — FR-045, FR-147, FR-151', () => {
    it('não há colisão de chave bloqueante no arquivo de referência', () => {
      const inconsistencias = detectarColisoesNoArquivo(linhas)
      const erros = inconsistencias.filter((i) => i.severity === 'ERROR')
      expect(erros).toHaveLength(0)
    })

    it('sinaliza como alerta o único nome que aparece em duas turmas', () => {
      const inconsistencias = detectarColisoesNoArquivo(linhas)
      const alertas = inconsistencias.filter((i) => i.code === 'SAME_NAME_OTHER_CLASS')
      expect(alertas).toHaveLength(2)
      expect(alertas.every((a) => a.severity === 'WARNING')).toBe(true)
    })
  })
})

/** Σ acertos ÷ Σ itens de cada habilidade, apenas entre os avaliados. */
function agruparPorHabilidade(): Map<string, MaybeFraction> {
  const shortCodes = Object.keys(linhas[0]?.habilidades ?? {})
  const mapa = new Map<string, MaybeFraction>()

  for (const shortCode of shortCodes) {
    const entradas = linhas.map((l) => {
      const r = l.habilidades[shortCode]
      return {
        avaliado: l.avaliado,
        result:
          r && r.acertos !== null && r.itensPossiveis !== null
            ? { acertos: r.acertos, itens: r.itensPossiveis }
            : null,
      }
    })
    mapa.set(shortCode, calculateSkillPerformance(entradas))
  }

  return mapa
}
