import { z } from 'zod'

/**
 * Entrada externa do cadastro de escolas.
 *
 * Const. IV / regra 4 do módulo: nada chega ao Prisma sem passar por aqui. O `trim` vem
 * antes das checagens de tamanho de propósito — um campo com só espaços precisa reprovar
 * como vazio, não passar como "tem 3 caracteres".
 */

const obrigatorio = (rotulo: string, max: number) =>
  z
    .string({ required_error: `Informe ${rotulo}.`, invalid_type_error: `Informe ${rotulo}.` })
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `${rotulo} deve ter no máximo ${max} caracteres.`)

export const escolaSchema = z.object({
  /** Código do INEP ou da rede. Opaco: preservado como veio, sem espaço nas extremidades. */
  code: obrigatorio('o código da escola', 40),
  name: obrigatorio('o nome da escola', 200),
  rede: obrigatorio('a rede de ensino', 120),
  municipio: obrigatorio('o município', 120),
  estado: z
    .string({ required_error: 'Informe a UF.', invalid_type_error: 'Informe a UF.' })
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'A UF deve ter duas letras, como "CE".')
    .transform((v) => v.toUpperCase()),
})

export type EntradaEscola = z.infer<typeof escolaSchema>

/** Identificador vindo do cliente. É filtro; a autorização é de `assertSchoolInScope`. */
export const schoolIdSchema = z
  .string({ required_error: 'Escola não informada.' })
  .trim()
  .min(1, 'Escola não informada.')

/** Lê os campos do formulário sem confiar no que o navegador enviou. */
export function lerEscolaDoFormulario(formData: FormData): unknown {
  return {
    code: formData.get('code'),
    name: formData.get('name'),
    rede: formData.get('rede'),
    municipio: formData.get('municipio'),
    estado: formData.get('estado'),
  }
}

/**
 * Estado devolvido pelas server actions ao `useActionState`.
 *
 * `camposComErro` só existe quando há erro de campo, e `erro` só quando há mensagem geral —
 * `exactOptionalPropertyTypes` proíbe `{ erro: undefined }`, e é bom que proíba: a ausência
 * de erro é a ausência da chave, não uma chave com valor vazio.
 */
export type EstadoFormulario = {
  erro?: string
  camposComErro?: Record<string, string[]>
}

/** Converte o erro do Zod no formato do estado, descartando as chaves sem mensagem. */
export function camposComErroDe(erro: z.ZodError): Record<string, string[]> {
  const saida: Record<string, string[]> = {}
  for (const [campo, mensagens] of Object.entries(erro.flatten().fieldErrors)) {
    if (mensagens && mensagens.length > 0) saida[campo] = mensagens
  }
  return saida
}
