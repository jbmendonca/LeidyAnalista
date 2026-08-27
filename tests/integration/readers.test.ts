import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { detectarCodificacao, removerBom } from '@/modules/imports/infra/encoding'
import { detectarSeparador } from '@/modules/imports/infra/delimiter'
import { detectarFormato } from '@/modules/imports/infra/format-detector'
import { proporMapeamento } from '@/modules/imports/infra/header-mapping'
import { lerArquivo, lerCsv, lerPlanilha } from '@/modules/imports/infra/table-reader'

/**
 * Leitura do arquivo de referência anonimizado — UTF-8 com BOM, separador `;`, 111 crianças em
 * 22 colunas. É o mesmo arquivo que a rede envia, com os números preservados e os nomes trocados.
 */

const CAMINHO = fileURLToPath(
  new URL('../fixtures/resultados-referencia.csv', import.meta.url),
)
const NOME_ARQUIVO = 'resultados-referencia.csv'
const BUFFER = readFileSync(CAMINHO)

describe('arquivo de referência — detecção', () => {
  it('está gravado em UTF-8 com BOM', () => {
    expect(removerBom(BUFFER).tinhaBom).toBe(true)
    expect(detectarCodificacao(BUFFER)).toBe('utf-8')
  })

  it('usa ponto e vírgula como separador', () => {
    const primeiraLinha = removerBom(BUFFER)
      .buffer.toString('utf-8')
      .split('\n')[0] as string

    expect(detectarSeparador(primeiraLinha)).toBe(';')
  })

  it('é identificado como csv', () => {
    expect(detectarFormato(NOME_ARQUIVO, BUFFER, 'text/csv')).toBe('csv')
  })
})

describe('lerCsv sobre o arquivo de referência', () => {
  const tabela = lerCsv(BUFFER)

  it('detecta separador e codificação sozinho', () => {
    expect(tabela.separadorDetectado).toBe(';')
    expect(tabela.codificacaoDetectada).toBe('utf-8')
  })

  it('lê 22 cabeçalhos, e o primeiro é exatamente "Rede" — sem BOM grudado', () => {
    expect(tabela.cabecalhos).toHaveLength(22)
    expect(tabela.cabecalhos[0]).toBe('Rede')
    expect(tabela.cabecalhos[0]?.charCodeAt(0)).toBe('R'.charCodeAt(0))
  })

  it('lê 111 linhas de dados', () => {
    expect(tabela.linhas).toHaveLength(111)
  })

  it('preserva os espaços das extremidades do "Código da Turma"', () => {
    const indice = tabela.cabecalhos.indexOf('Código da Turma')
    expect(indice).toBeGreaterThanOrEqual(0)

    const valor = tabela.linhas[0]?.[indice]

    expect(valor).toBe(' 8npu2dd9128c ')
    expect(valor).not.toBe(valor?.trim())
  })

  it('preserva os espaços das extremidades das células de habilidade', () => {
    const indice = tabela.cabecalhos.indexOf('H 01')
    const valor = tabela.linhas[0]?.[indice]

    expect(valor).toBe(' 1 / 1')
  })

  it('preserva acentos em cabeçalhos e em valores', () => {
    expect(tabela.cabecalhos).toContain('Município')
    expect(tabela.cabecalhos).toContain('Nível de aprendizagem')

    const iMunicipio = tabela.cabecalhos.indexOf('Município')
    const iNivel = tabela.cabecalhos.indexOf('Nível de aprendizagem')
    const iAno = tabela.cabecalhos.indexOf('Ano Escolar')

    expect(tabela.linhas[0]?.[iMunicipio]).toBe('BOA VISTA')
    expect(tabela.linhas[0]?.[iNivel]).toBe('Adequado')
    expect(tabela.linhas[0]?.[iAno]).toContain('4º ANO')
  })

  it('mantém 22 colunas em todas as linhas de dados', () => {
    for (const linha of tabela.linhas) {
      expect(linha).toHaveLength(22)
    }
  })
})

describe('proporMapeamento sobre o arquivo de referência', () => {
  const { campos, habilidades, naoMapeadas } = proporMapeamento(lerCsv(BUFFER).cabecalhos)

  it('identifica as dez colunas conhecidas', () => {
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
  })

  it('identifica as doze habilidades H01..H12', () => {
    const esperadas = Array.from(
      { length: 12 },
      (_, i) => `H${String(i + 1).padStart(2, '0')}`,
    )

    expect(Object.keys(habilidades)).toEqual(esperadas)
    expect(habilidades['H01']).toBe(10)
    expect(habilidades['H12']).toBe(21)
  })

  it('não deixa nenhuma coluna sem reconhecimento', () => {
    expect(naoMapeadas).toEqual([])
  })
})

/**
 * A planilha equivalente é montada em memória a partir das mesmas linhas do CSV: o objetivo é
 * provar que o resto do pipeline não distingue a origem.
 */
function planilhaDeReferencia(abas: readonly string[]): Buffer {
  const { cabecalhos, linhas } = lerCsv(BUFFER)
  const pasta = XLSX.utils.book_new()

  abas.forEach((nome, i) => {
    const matriz: string[][] =
      i === 0 ? [[...cabecalhos], ...linhas.map((l) => [...l])] : [['Outra aba']]
    XLSX.utils.book_append_sheet(pasta, XLSX.utils.aoa_to_sheet(matriz), nome)
  })

  return XLSX.write(pasta, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('lerPlanilha', () => {
  const buffer = planilhaDeReferencia(['Resultados', 'Notas'])

  it('lê a primeira aba por padrão e lista as disponíveis', () => {
    const tabela = lerPlanilha(buffer)

    expect(tabela.abaUsada).toBe('Resultados')
    expect(tabela.abasDisponiveis).toEqual(['Resultados', 'Notas'])
    expect(tabela.cabecalhos).toHaveLength(22)
    expect(tabela.linhas).toHaveLength(111)
  })

  it('preserva espaços das extremidades e acentos vindos da planilha', () => {
    const tabela = lerPlanilha(buffer)
    const iTurma = tabela.cabecalhos.indexOf('Código da Turma')

    expect(tabela.cabecalhos[0]).toBe('Rede')
    expect(tabela.linhas[0]?.[iTurma]).toBe(' 8npu2dd9128c ')
    expect(tabela.cabecalhos).toContain('Nível de aprendizagem')
  })

  it('lê a aba pedida quando informada', () => {
    expect(lerPlanilha(buffer, { aba: 'Notas' }).cabecalhos).toEqual(['Outra aba'])
  })

  it('recusa aba inexistente com ENTRADA_INVALIDA', () => {
    try {
      lerPlanilha(buffer, { aba: 'Inexistente' })
      expect.unreachable('deveria ter lançado')
    } catch (erro) {
      expect((erro as { codigo?: string }).codigo).toBe('ENTRADA_INVALIDA')
    }
  })

  it('é reconhecida pela assinatura PK mesmo com nome enganoso', () => {
    expect(detectarFormato('planilha.csv', buffer)).toBe('xlsx')

    const tabela = lerArquivo(buffer, 'resultados.xlsx')
    expect(tabela.abaUsada).toBe('Resultados')
    expect(tabela.linhas).toHaveLength(111)
  })
})

describe('lerArquivo', () => {
  it('despacha csv pelo nome do arquivo e produz a mesma tabela', () => {
    const tabela = lerArquivo(BUFFER, NOME_ARQUIVO)

    expect(tabela.cabecalhos).toHaveLength(22)
    expect(tabela.linhas).toHaveLength(111)
  })

  it('respeita separador e codificação informados', () => {
    const tabela = lerArquivo(BUFFER, NOME_ARQUIVO, {
      separador: ';',
      codificacao: 'utf-8',
    })

    expect(tabela.cabecalhos[0]).toBe('Rede')
    expect(tabela.separadorDetectado).toBe(';')
  })

  it('recusa formato não reconhecido com ENTRADA_INVALIDA', () => {
    expect(() => lerArquivo(BUFFER, 'resultados.pdf')).toThrowError(
      /Formato de arquivo não reconhecido/,
    )

    try {
      lerArquivo(BUFFER, 'resultados.pdf')
      expect.unreachable('deveria ter lançado')
    } catch (erro) {
      expect((erro as { codigo?: string }).codigo).toBe('ENTRADA_INVALIDA')
      expect((erro as { status?: number }).status).toBe(422)
    }
  })
})
