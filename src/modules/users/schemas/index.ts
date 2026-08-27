import { z } from 'zod'

import type { Role } from '@prisma/client'

/**
 * ===========================================================================
 *  ENTRADA DA GESTÃO DE USUÁRIOS — FR-005, FR-006, FR-007
 * ===========================================================================
 *
 * O ponto delicado deste módulo é `canAccessNominalData`. Ela **não** é um atributo do
 * perfil: é permissão própria de cada usuário, ortogonal ao papel e ao escopo de escola
 * (FR-007). O perfil apenas define o valor INICIAL — concedida a Administrador e a Escola,
 * negada a Analista — e o Administrador pode alterá-la individualmente depois.
 *
 * Por isso o formulário oferece três opções e não uma caixa de seleção: "padrão do perfil",
 * "conceder" e "negar". Uma caixa desmarcada não é enviada pelo navegador, e o servidor não
 * teria como distinguir "o Administrador desmarcou" de "o campo não veio" — a diferença
 * entre negar a permissão e aplicar o padrão.
 */

export const PERFIS = ['ADMIN', 'ANALISTA', 'ESCOLA'] as const satisfies readonly Role[]

export type Perfil = (typeof PERFIS)[number]

export const ROTULO_PERFIL = {
  ADMIN: 'Administrador',
  ANALISTA: 'Gestor / Analista',
  ESCOLA: 'Escola',
} as const satisfies Record<Perfil, string>

/**
 * Valor inicial da permissão de dados nominais, por perfil (FR-007).
 *
 * Escola precisa dos nomes para agir pedagogicamente sobre as próprias crianças;
 * Gestor/Analista opera sobre agregados na maior parte do trabalho e recebe a versão sem
 * nomes (FR-007a) — nunca uma negação de acesso à tela.
 */
export function padraoDadosNominais(perfil: Perfil): boolean {
  return perfil === 'ADMIN' || perfil === 'ESCOLA'
}

export const ESCOLHAS_DADOS_NOMINAIS = ['PADRAO', 'CONCEDER', 'NEGAR'] as const
export type EscolhaDadosNominais = (typeof ESCOLHAS_DADOS_NOMINAIS)[number]

/** Resolve a escolha do formulário no booleano que vai para o banco. */
export function resolverDadosNominais(
  escolha: EscolhaDadosNominais,
  perfil: Perfil,
): boolean {
  if (escolha === 'CONCEDER') return true
  if (escolha === 'NEGAR') return false
  return padraoDadosNominais(perfil)
}

const nome = z
  .string({
    required_error: 'Informe o nome do usuário.',
    invalid_type_error: 'Informe o nome do usuário.',
  })
  .trim()
  .min(1, 'Informe o nome do usuário.')
  .max(200, 'O nome deve ter no máximo 200 caracteres.')

const email = z
  .string({
    required_error: 'Informe o e-mail.',
    invalid_type_error: 'Informe o e-mail.',
  })
  .trim()
  .min(1, 'Informe o e-mail.')
  .max(200, 'O e-mail deve ter no máximo 200 caracteres.')
  .email('E-mail inválido.')
  // Minúsculas na borda: o índice único é sensível a caixa, e "Ana@" e "ana@" são a
  // mesma pessoa. Normalizar aqui é o que impede duas contas para o mesmo e-mail.
  .transform((v) => v.toLowerCase())

/** Mesmo mínimo de `novaSenhaSchema` em auth. Repetido, não importado: módulos distintos. */
const senha = z
  .string({
    required_error: 'Informe a senha inicial.',
    invalid_type_error: 'Informe a senha inicial.',
  })
  .min(12, 'A senha precisa ter ao menos 12 caracteres.')
  .max(200, 'A senha é longa demais.')

const perfil = z.enum([...PERFIS], {
  required_error: 'Selecione o perfil.',
  invalid_type_error: 'Perfil desconhecido.',
})

const escolas = z
  .array(z.string().trim().min(1), { invalid_type_error: 'Seleção de escolas inválida.' })
  .default([])
  .transform((ids) => [...new Set(ids)])

const dadosNominais = z
  .enum([...ESCOLHAS_DADOS_NOMINAIS], {
    invalid_type_error: 'Escolha inválida para a permissão de dados nominais.',
  })
  .default('PADRAO')

/**
 * `ESCOLA` sem vínculo enxergaria uma lista vazia em toda tela — e leria o vazio como
 * "não há dados", que é a leitura errada mais cara do sistema. Exigir ao menos uma escola
 * na criação evita a conta nascer inútil.
 */
function exigirEscolaParaPerfilEscola(
  valores: { role: Perfil; schoolIds: string[] },
  ctx: z.RefinementCtx,
): void {
  if (valores.role === 'ESCOLA' && valores.schoolIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['schoolIds'],
      message: 'Vincule ao menos uma escola: o perfil Escola só enxerga o que está vinculado.',
    })
  }
}

export const novoUsuarioSchema = z
  .object({
    name: nome,
    email,
    senha,
    role: perfil,
    schoolIds: escolas,
    dadosNominais,
  })
  .superRefine(exigirEscolaParaPerfilEscola)

export type EntradaNovoUsuario = z.infer<typeof novoUsuarioSchema>

/**
 * Atualização de usuário.
 *
 * `senha` é opcional: ausente significa "manter a atual", nunca "apagar". `canAccessNominalData`
 * chega aqui já resolvido em booleano porque a edição é sempre explícita — o padrão do perfil
 * só vale no nascimento da conta.
 */
export const atualizacaoUsuarioSchema = z
  .object({
    name: nome,
    email,
    senha: senha.optional(),
    role: perfil,
    active: z.boolean({ invalid_type_error: 'Situação inválida.' }),
    canAccessNominalData: z.boolean({
      invalid_type_error: 'Permissão de dados nominais inválida.',
    }),
    schoolIds: escolas,
  })
  .superRefine(exigirEscolaParaPerfilEscola)

export type EntradaAtualizacaoUsuario = z.infer<typeof atualizacaoUsuarioSchema>

/** Lê os campos do formulário de criação sem confiar no que o navegador enviou. */
export function lerNovoUsuarioDoFormulario(formData: FormData): unknown {
  return {
    name: formData.get('name'),
    email: formData.get('email'),
    senha: formData.get('senha'),
    role: formData.get('role'),
    schoolIds: formData.getAll('schoolIds'),
    dadosNominais: formData.get('dadosNominais') ?? 'PADRAO',
  }
}

export type EstadoUsuario = {
  erro?: string
  camposComErro?: Record<string, string[]>
}

export function camposComErroDe(erro: z.ZodError): Record<string, string[]> {
  const saida: Record<string, string[]> = {}
  for (const [campo, mensagens] of Object.entries(erro.flatten().fieldErrors)) {
    if (mensagens && mensagens.length > 0) saida[campo] = mensagens
  }
  return saida
}
