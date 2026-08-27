import { z } from 'zod'

export const credenciaisSchema = z.object({
  email: z
    .string()
    .min(1, 'Informe o e-mail')
    .email('E-mail inválido')
    .transform((v) => v.trim().toLowerCase()),
  senha: z.string().min(1, 'Informe a senha'),
})

export type Credenciais = z.infer<typeof credenciaisSchema>

export const novaSenhaSchema = z
  .string()
  .min(12, 'A senha precisa ter ao menos 12 caracteres')
  .max(200, 'A senha é longa demais')
