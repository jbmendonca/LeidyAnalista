import { z } from 'zod'

/**
 * Entrada externa do cadastro de avaliações.
 *
 * `dataAplicacao` é modelada como `Date | null`, nunca `Date | undefined`: com
 * `exactOptionalPropertyTypes`, "não informado" precisa ser um valor explícito para
 * atravessar a camada de aplicação sem virar chave ausente por acidente. E, coerente com o
 * Princípio I, ausência é ausência — não é uma data padrão.
 */

const ANO_MINIMO = 2000
const ANO_MAXIMO = 2100

const obrigatorio = (rotulo: string, max: number) =>
  z
    .string({ required_error: `Informe ${rotulo}.`, invalid_type_error: `Informe ${rotulo}.` })
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `${rotulo} deve ter no máximo ${max} caracteres.`)

/** Aceita o `number` da API e a string do formulário; recusa qualquer coisa fracionária. */
const anoSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : v),
  z
    .number({ required_error: 'Informe o ano.', invalid_type_error: 'O ano deve ser um número.' })
    .int('O ano deve ser um número inteiro.')
    .min(ANO_MINIMO, `O ano deve ser igual ou maior que ${ANO_MINIMO}.`)
    .max(ANO_MAXIMO, `O ano deve ser igual ou menor que ${ANO_MAXIMO}.`),
)

/** Campo vazio do formulário chega como `''`; vira `null`, e não a data de hoje. */
const dataAplicacaoSchema = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (v instanceof Date) return v
    if (typeof v === 'string') {
      const texto = v.trim()
      if (texto === '') return null
      // `yyyy-mm-dd` do <input type="date"> é lido como UTC para não deslocar o dia.
      const data = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T00:00:00Z` : texto)
      return Number.isNaN(data.getTime()) ? texto : data
    }
    return v
  },
  z
    .date({ invalid_type_error: 'Data de aplicação inválida.' })
    .nullable(),
)

export const avaliacaoSchema = z.object({
  nome: obrigatorio('o nome da avaliação', 200),
  ano: anoSchema,
  ciclo: obrigatorio('o ciclo', 80),
  componenteCurricular: obrigatorio('o componente curricular', 120),
  dataAplicacao: dataAplicacaoSchema,
})

export type EntradaAvaliacao = z.infer<typeof avaliacaoSchema>

export const assessmentIdSchema = z
  .string({ required_error: 'Avaliação não informada.' })
  .trim()
  .min(1, 'Avaliação não informada.')

export function lerAvaliacaoDoFormulario(formData: FormData): unknown {
  return {
    nome: formData.get('nome'),
    ano: formData.get('ano'),
    ciclo: formData.get('ciclo'),
    componenteCurricular: formData.get('componenteCurricular'),
    dataAplicacao: formData.get('dataAplicacao'),
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
