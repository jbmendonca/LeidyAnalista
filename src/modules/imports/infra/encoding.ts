import iconv from 'iconv-lite'

/**
 * Codificação e BOM.
 *
 * O BOM é removido **antes** de qualquer decodificação. Se sobreviver, o primeiro nome de coluna
 * vira `"﻿Rede"` e o mapeamento de cabeçalhos falha de uma forma que só se descobre lendo
 * bytes (R-004). O arquivo de referência real é UTF-8 com BOM, então este não é um caso teórico.
 */

export type Codificacao = 'utf-8' | 'utf-16le' | 'utf-16be' | 'latin1'

const BOM_UTF8 = [0xef, 0xbb, 0xbf] as const
const BOM_UTF16LE = [0xff, 0xfe] as const
const BOM_UTF16BE = [0xfe, 0xff] as const

function comecaCom(buffer: Buffer, assinatura: readonly number[]): boolean {
  if (buffer.length < assinatura.length) return false
  return assinatura.every((byte, i) => buffer[i] === byte)
}

/**
 * Detecta e remove o BOM de UTF-8, UTF-16LE e UTF-16BE.
 *
 * `tinhaBom` informa o que aconteceu; o buffer devolvido nunca contém a marca. Devolve uma fatia
 * do buffer original (sem cópia) quando há BOM, e o próprio buffer quando não há.
 */
export function removerBom(buffer: Buffer): { buffer: Buffer; tinhaBom: boolean } {
  if (comecaCom(buffer, BOM_UTF8)) {
    return { buffer: buffer.subarray(BOM_UTF8.length), tinhaBom: true }
  }
  // UTF-16LE (FF FE) antes de UTF-16BE (FE FF): são o inverso um do outro.
  if (comecaCom(buffer, BOM_UTF16LE)) {
    return { buffer: buffer.subarray(BOM_UTF16LE.length), tinhaBom: true }
  }
  if (comecaCom(buffer, BOM_UTF16BE)) {
    return { buffer: buffer.subarray(BOM_UTF16BE.length), tinhaBom: true }
  }
  return { buffer, tinhaBom: false }
}

/** UTF-8 estrito: qualquer sequência malformada lança, e é isso que queremos saber. */
function ehUtf8Valido(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

/**
 * Heurística de codificação: BOM primeiro; na ausência dele, UTF-8 estrito; se a decodificação
 * estrita falhar, `latin1` — que nunca falha e é o resto do mundo dos arquivos de secretaria.
 */
export function detectarCodificacao(buffer: Buffer): Codificacao {
  if (comecaCom(buffer, BOM_UTF8)) return 'utf-8'
  if (comecaCom(buffer, BOM_UTF16LE)) return 'utf-16le'
  if (comecaCom(buffer, BOM_UTF16BE)) return 'utf-16be'
  return ehUtf8Valido(buffer) ? 'utf-8' : 'latin1'
}

/**
 * Decodifica para string. O BOM sai **antes** da decodificação, sempre.
 *
 * `encoding` sobrepõe a detecção — é o caminho de escape para o usuário que sabe o que o arquivo é.
 */
export function decodificar(buffer: Buffer, encoding?: string): string {
  const { buffer: semBom } = removerBom(buffer)
  const codificacao = encoding ?? detectarCodificacao(buffer)
  const texto = iconv.decode(semBom, codificacao)
  // Cinto e suspensórios: se algum codec reintroduzir a marca, ela não passa daqui.
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
}
