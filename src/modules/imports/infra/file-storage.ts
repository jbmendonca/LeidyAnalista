import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { env } from '@/lib/env'

/**
 * Armazenamento do arquivo original — FR-038, R-006.
 *
 * ATENÇÃO: este diretório contém dados nominais de crianças. Deve ter as
 * mesmas restrições de acesso do banco de dados (FR-038a), e é ignorado pelo
 * git (ver .gitignore).
 *
 * O arquivo é nomeado pelo próprio SHA-256. Isso dá um nome estável, evita
 * colisão e permite detectar reimportação do mesmo conteúdo. O hash é gravado
 * em `Import` e sobrevive ao expurgo do arquivo: depois que o conteúdo já não
 * existe, ele continua provando **qual** conteúdo foi importado (FR-038b).
 */

export function calcularSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function caminhoDe(hash: string, extensao: string): string {
  // Dois níveis de subdiretório pelo prefixo do hash: evita milhares de
  // arquivos num único diretório.
  const a = hash.slice(0, 2)
  const b = hash.slice(2, 4)
  return join(resolve(env.IMPORT_STORAGE_DIR), a, b, `${hash}${extensao}`)
}

export async function guardarArquivo(
  buffer: Buffer,
  nomeOriginal: string,
): Promise<{ hash: string; caminho: string }> {
  const hash = calcularSha256(buffer)
  const ponto = nomeOriginal.lastIndexOf('.')
  const extensao = ponto >= 0 ? nomeOriginal.slice(ponto).toLowerCase() : ''
  const caminho = caminhoDe(hash, extensao)

  await mkdir(dirname(caminho), { recursive: true })
  await writeFile(caminho, buffer)

  return { hash, caminho }
}

export async function lerArquivoGuardado(caminho: string): Promise<Buffer> {
  return readFile(caminho)
}

/**
 * Expurga o arquivo. Idempotente: arquivo já ausente não é erro — o que
 * importa é o efeito, e o efeito é o conteúdo não existir mais.
 */
export async function expurgarArquivo(caminho: string): Promise<void> {
  await unlink(caminho).catch(() => undefined)
}

/** Prazo de retenção a partir de agora — FR-038a. */
export function calcularPrazoRetencao(agora = new Date()): Date {
  const prazo = new Date(agora)
  prazo.setDate(prazo.getDate() + env.IMPORT_FILE_RETENTION_DAYS)
  return prazo
}

export function limiteTamanhoBytes(): number {
  return env.IMPORT_MAX_FILE_SIZE_MB * 1024 * 1024
}
