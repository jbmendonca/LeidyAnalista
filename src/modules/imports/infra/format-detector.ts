/**
 * Identificação do formato do arquivo (passo 3 do pipeline de importação).
 *
 * Três sinais, nesta ordem de confiança: assinatura de conteúdo, extensão, MIME. A assinatura
 * vence porque é a única que o usuário não consegue errar — renomear `planilha.xlsx` para
 * `planilha.csv` é comum, e o navegador manda MIME genérico com frequência.
 */

export type FormatoArquivo = 'csv' | 'xlsx' | 'xls'

/** OOXML (xlsx) é um ZIP: `PK\x03\x04`. */
const ASSINATURA_ZIP = [0x50, 0x4b, 0x03, 0x04] as const

/** BIFF/OLE2 (xls legado): D0 CF 11 E0 A1 B1 1A E1. */
const ASSINATURA_OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const

const EXTENSOES: Readonly<Record<string, FormatoArquivo>> = {
  '.csv': 'csv',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
}

const MIMES: Readonly<Record<string, FormatoArquivo>> = {
  'text/csv': 'csv',
  'application/csv': 'csv',
  'text/plain': 'csv',
  'text/comma-separated-values': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/msexcel': 'xls',
}

function comecaCom(buffer: Buffer, assinatura: readonly number[]): boolean {
  if (buffer.length < assinatura.length) return false
  return assinatura.every((byte, i) => buffer[i] === byte)
}

function extensaoDe(nomeArquivo: string): string {
  const ponto = nomeArquivo.lastIndexOf('.')
  if (ponto < 0) return ''
  return nomeArquivo.slice(ponto).toLowerCase()
}

/** Aceita apenas `.csv`, `.xlsx` e `.xls` (FR de upload). Insensível a maiúsculas. */
export function validarExtensao(nomeArquivo: string): boolean {
  return extensaoDe(nomeArquivo) in EXTENSOES
}

/**
 * Devolve o formato, ou `null` quando nenhum dos três sinais reconhece o arquivo.
 *
 * A assinatura de conteúdo tem precedência sobre a extensão; a extensão, sobre o MIME.
 */
export function detectarFormato(
  nomeArquivo: string,
  buffer: Buffer,
  mimeType?: string,
): FormatoArquivo | null {
  if (comecaCom(buffer, ASSINATURA_ZIP)) return 'xlsx'
  if (comecaCom(buffer, ASSINATURA_OLE2)) return 'xls'

  const porExtensao = EXTENSOES[extensaoDe(nomeArquivo)]
  if (porExtensao !== undefined) return porExtensao

  if (mimeType !== undefined) {
    const porMime = MIMES[mimeType.split(';')[0]?.trim().toLowerCase() ?? '']
    if (porMime !== undefined) return porMime
  }

  return null
}
