import { z } from 'zod'

import { normalizeClassCode } from '@/modules/classes/domain/normalize-class-code'

/**
 * Entrada externa do cadastro de turmas.
 *
 * O `externalCode` é normalizado **aqui**, no limite do sistema, por
 * `normalizeClassCode` — a mesma função que a importação usa. Se a tela normalizasse de um
 * jeito e o importador de outro, a mesma turma nasceria duas vezes e o índice único
 * `(schoolId, externalCode)` não perceberia.
 *
 * `schoolId` é validado como texto, não como autorização: quem decide se o usuário pode
 * escrever nessa escola é `assertSchoolInScope`, na camada de aplicação.
 */

const obrigatorio = (rotulo: string, max: number) =>
  z
    .string({
      required_error: `Informe ${rotulo}.`,
      invalid_type_error: `Informe ${rotulo}.`,
    })
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `${rotulo} deve ter no máximo ${max} caracteres.`)

export const turmaSchema = z.object({
  schoolId: z
    .string({
      required_error: 'Selecione a escola.',
      invalid_type_error: 'Selecione a escola.',
    })
    .trim()
    .min(1, 'Selecione a escola.'),
  externalCode: z
    .string({
      required_error: 'Informe o código da turma.',
      invalid_type_error: 'Informe o código da turma.',
    })
    // A normalização precede as checagens: um código só de espaços é vazio, não válido.
    .transform(normalizeClassCode)
    .pipe(
      z
        .string()
        .min(1, 'Informe o código da turma.')
        .max(120, 'O código da turma deve ter no máximo 120 caracteres.'),
    ),
  name: obrigatorio('o nome da turma', 120),
  anoEscolar: obrigatorio('o ano escolar', 40),
})

export type EntradaTurma = z.infer<typeof turmaSchema>

export const classIdSchema = z
  .string({ required_error: 'Turma não informada.' })
  .trim()
  .min(1, 'Turma não informada.')

export function lerTurmaDoFormulario(formData: FormData): unknown {
  return {
    schoolId: formData.get('schoolId'),
    externalCode: formData.get('externalCode'),
    name: formData.get('name'),
    anoEscolar: formData.get('anoEscolar'),
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
