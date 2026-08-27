/**
 * Erros de aplicação e seus códigos HTTP.
 *
 * A regra mais importante deste arquivo: recurso fora do escopo do usuário
 * responde **404, nunca 403**. Um 403 confirmaria a existência daquela escola
 * a quem não pode vê-la, o que é vazamento de informação (FR-006).
 */

export type CodigoErro =
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'ENTRADA_INVALIDA'
  | 'CONFLITO'
  | 'ARQUIVO_GRANDE_DEMAIS'

const STATUS: Record<CodigoErro, number> = {
  NAO_AUTENTICADO: 401,
  SEM_PERMISSAO: 403,
  NAO_ENCONTRADO: 404,
  ENTRADA_INVALIDA: 422,
  CONFLITO: 409,
  ARQUIVO_GRANDE_DEMAIS: 413,
}

export class AppError extends Error {
  readonly codigo: CodigoErro
  readonly status: number
  readonly detalhes: Record<string, string[]> | undefined

  constructor(
    codigo: CodigoErro,
    mensagem: string,
    detalhes?: Record<string, string[]>,
  ) {
    super(mensagem)
    this.name = 'AppError'
    this.codigo = codigo
    this.status = STATUS[codigo]
    this.detalhes = detalhes
  }
}

export const naoAutenticado = () =>
  new AppError('NAO_AUTENTICADO', 'É necessário entrar no sistema.')

export const semPermissao = () =>
  new AppError('SEM_PERMISSAO', 'Seu perfil não permite esta ação.')

/**
 * Use SEMPRE esta função para recurso fora do escopo de escola — nunca
 * `semPermissao`. A diferença entre 403 e 404 revela a existência do recurso.
 */
export const naoEncontrado = (o = 'Recurso') =>
  new AppError('NAO_ENCONTRADO', `${o} não encontrado.`)

export const entradaInvalida = (detalhes: Record<string, string[]>) =>
  new AppError('ENTRADA_INVALIDA', 'Dados inválidos.', detalhes)

export const conflito = (mensagem: string) => new AppError('CONFLITO', mensagem)

export const arquivoGrandeDemais = (limiteMb: number) =>
  new AppError(
    'ARQUIVO_GRANDE_DEMAIS',
    `O arquivo excede o limite de ${limiteMb} MB.`,
  )

export function respostaDeErro(erro: unknown): Response {
  if (erro instanceof AppError) {
    return Response.json(
      {
        erro: erro.codigo,
        mensagem: erro.message,
        ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
      },
      { status: erro.status },
    )
  }
  return Response.json(
    { erro: 'ERRO_INTERNO', mensagem: 'Erro inesperado.' },
    { status: 500 },
  )
}
