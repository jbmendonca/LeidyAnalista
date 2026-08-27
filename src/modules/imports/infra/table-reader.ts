import { parse } from 'csv-parse/sync'
import * as XLSX from 'xlsx'

import { AppError } from '@/server/http-errors'

import { decodificar, detectarCodificacao } from './encoding'
import { detectarSeparador } from './delimiter'
import { detectarFormato } from './format-detector'

/**
 * Leitura tabular — a fronteira que apaga o formato de origem.
 *
 * A partir daqui o pipeline lida com uma matriz de strings e não sabe (nem deve saber) se veio de
 * CSV, XLSX ou XLS. Regra que vale para os três leitores: **os valores saem exatamente como
 * estão**, espaços das extremidades inclusive. O `Código da Turma` real do arquivo de referência é
 * `" 8npu2dd9128c "`, com espaço dos dois lados; quem decide o que fazer com isso é o parsing de
 * domínio, que precisa poder ver o valor bruto. Um `trim` aqui destruiria evidência.
 */

export type TabelaLida = Readonly<{
  cabecalhos: readonly string[]
  linhas: readonly (readonly string[])[]
  separadorDetectado?: string
  codificacaoDetectada?: string
  abaUsada?: string
  abasDisponiveis?: readonly string[]
}>

export type OpcoesCsv = Readonly<{ separador?: string; codificacao?: string }>
export type OpcoesPlanilha = Readonly<{ aba?: string }>
export type OpcoesLeitura = OpcoesCsv & OpcoesPlanilha & Readonly<{ mimeType?: string }>

/** Primeira linha não vazia do texto — a amostra para detectar o separador. */
function primeiraLinhaNaoVazia(texto: string): string {
  return texto.split(/\r\n|\n|\r/).find((l) => l.trim().length > 0) ?? ''
}

export function lerCsv(buffer: Buffer, opcoes?: OpcoesCsv): TabelaLida {
  const codificacao = opcoes?.codificacao ?? detectarCodificacao(buffer)
  const texto = decodificar(buffer, codificacao)
  const separador = opcoes?.separador ?? detectarSeparador(primeiraLinhaNaoVazia(texto))

  const registros: string[][] = parse(texto, {
    delimiter: separador,
    // Linha com número de colunas diferente do cabeçalho não interrompe a leitura: vira
    // inconsistência na validação, onde o usuário consegue ver de que linha se trata.
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    // O BOM já saiu em `decodificar`; deixar `csv-parse` procurá-lo de novo é ruído.
    bom: false,
    // Sem `trim`, `ltrim` ou `rtrim`: ver a nota do topo do arquivo.
    trim: false,
    columns: false,
  })

  const [cabecalhos = [], ...linhas] = registros

  return {
    cabecalhos,
    linhas,
    separadorDetectado: separador,
    codificacaoDetectada: codificacao,
  }
}

/** Célula de planilha pode vir `undefined` em linha curta; ausência vira string vazia, não zero. */
function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return typeof valor === 'string' ? valor : String(valor)
}

export function lerPlanilha(buffer: Buffer, opcoes?: OpcoesPlanilha): TabelaLida {
  const pasta = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false })
  const abasDisponiveis = pasta.SheetNames

  const abaUsada = opcoes?.aba ?? abasDisponiveis[0]
  if (abaUsada === undefined) {
    throw new AppError('ENTRADA_INVALIDA', 'A planilha não contém nenhuma aba.')
  }

  const planilha = pasta.Sheets[abaUsada]
  if (planilha === undefined) {
    throw new AppError(
      'ENTRADA_INVALIDA',
      `A aba "${abaUsada}" não existe na planilha.`,
      {
        aba: [`Abas disponíveis: ${abasDisponiveis.join(', ')}`],
      },
    )
  }

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(planilha, {
    header: 1,
    defval: '',
    // `raw: false` entrega o texto formatado da célula — o que o usuário vê no Excel é o que o
    // pipeline lê, sem reinterpretação de número ou data.
    raw: false,
    blankrows: false,
  })

  const [cabecalhosBrutos = [], ...linhasBrutas] = matriz

  return {
    cabecalhos: cabecalhosBrutos.map(celulaParaTexto),
    linhas: linhasBrutas.map((linha) => linha.map(celulaParaTexto)),
    abaUsada,
    abasDisponiveis,
  }
}

/**
 * Despacha pelo formato detectado. Formato irreconhecível é entrada inválida, não erro interno —
 * a causa quase sempre é o usuário ter enviado um `.pdf` ou um `.ods`.
 */
export function lerArquivo(
  buffer: Buffer,
  nomeArquivo: string,
  opcoes?: OpcoesLeitura,
): TabelaLida {
  const formato = detectarFormato(nomeArquivo, buffer, opcoes?.mimeType)

  if (formato === null) {
    throw new AppError(
      'ENTRADA_INVALIDA',
      'Formato de arquivo não reconhecido. Envie um arquivo .csv, .xlsx ou .xls.',
      { arquivo: [`Não foi possível identificar o formato de "${nomeArquivo}".`] },
    )
  }

  if (formato === 'csv') {
    const opcoesCsv: OpcoesCsv = {
      ...(opcoes?.separador !== undefined ? { separador: opcoes.separador } : {}),
      ...(opcoes?.codificacao !== undefined ? { codificacao: opcoes.codificacao } : {}),
    }
    return lerCsv(buffer, opcoesCsv)
  }

  const opcoesPlanilha: OpcoesPlanilha =
    opcoes?.aba !== undefined ? { aba: opcoes.aba } : {}
  return lerPlanilha(buffer, opcoesPlanilha)
}
