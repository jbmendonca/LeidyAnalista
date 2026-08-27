import { z } from 'zod'

/**
 * Entrada do cadastro de estudante — FR-168, FR-135, FR-178.
 *
 * Duas ausências neste arquivo são decisões, não esquecimento:
 *
 *  1. **Não existe campo `uniqueCode`.** O código é atribuído pelo sistema na criação
 *     (FR-169) e é permanente: não muda, não é reutilizado e não é regenerado (FR-129).
 *     Aceitá-lo do formulário abriria caminho para sobrescrevê-lo.
 *  2. **Não existe validação de nome repetido.** Dois homônimos na mesma turma podem
 *     coexistir por decisão explícita do usuário (FR-175). A colisão por nome é regra da
 *     importação de resultados, não do cadastro.
 */

/**
 * O nome original é preservado como o usuário digitou — caixa e acentuação inclusive
 * (FR-034). Só os espaços das extremidades saem: eles não são conteúdo e atrapalhariam a
 * exibição. A forma normalizada, usada em busca e duplicidade, é derivada depois por
 * `normalizeStudentName` e nunca substitui esta.
 */
const nomeOriginalSchema = z
  .string({ required_error: 'Informe o nome do estudante' })
  .trim()
  .min(1, 'Informe o nome do estudante')
  .max(200, 'O nome é longo demais (máximo de 200 caracteres)')

/**
 * Código externo da rede — separado do código único do sistema (FR-135). Só é preenchido
 * quando a fonte oficial o fornece; célula vazia vira `null`, jamais string vazia, para que
 * "não informado" continue distinguível de "informado como vazio".
 */
const codigoExternoSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((valor) => {
    const limpo = (valor ?? '').trim()
    return limpo.length === 0 ? null : limpo
  })
  .pipe(z.string().max(60, 'O código externo é longo demais').nullable())

const identificadorSchema = z.string().min(1)

export const criarEstudanteSchema = z.object({
  schoolId: identificadorSchema.describe('Escola'),
  classId: identificadorSchema.describe('Turma'),
  nomeOriginal: nomeOriginalSchema,
  codigoExterno: codigoExternoSchema,
})

export type EntradaCriarEstudante = z.infer<typeof criarEstudanteSchema>

/**
 * Edição de dados **cadastrais** apenas (FR-178). Nenhum campo daqui alcança resultado de
 * avaliação: a distinção entre dado cadastral e dado de avaliação é estrutural (FR-154).
 */
export const editarEstudanteSchema = criarEstudanteSchema.extend({
  id: identificadorSchema,
})

export type EntradaEditarEstudante = z.infer<typeof editarEstudanteSchema>

/** Filtro opcional de formulário: string vazia significa "sem filtro", não "vazio". */
const filtroOpcionalSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((valor) => {
    const limpo = (valor ?? '').trim()
    return limpo.length === 0 ? null : limpo
  })

export const filtrosEstudantesSchema = z.object({
  schoolId: filtroOpcionalSchema,
  classId: filtroOpcionalSchema,
  /** Nome (comparado pela forma normalizada) ou código único. */
  busca: filtroOpcionalSchema,
  incluirInativos: z.coerce.boolean().default(false),
  pagina: z.coerce.number().int().min(1).default(1),
  // O teto alto atende à exportação da nominata de uma rede inteira (FR-174); a listagem em
  // tela usa o padrão.
  tamanho: z.coerce.number().int().min(1).max(5000).default(100),
})

export type FiltrosEstudantes = z.infer<typeof filtrosEstudantesSchema>

/** Recorte da nominata exportada (FR-174): escola inteira ou uma turma. */
export const filtrosNominataSchema = z.object({
  schoolId: filtroOpcionalSchema,
  classId: filtroOpcionalSchema,
})

export type FiltrosNominata = z.infer<typeof filtrosNominataSchema>
