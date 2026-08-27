import { z } from 'zod'

/**
 * ===========================================================================
 *  FILTROS COMBINADOS DO PAINEL — FR-098 a FR-101
 * ===========================================================================
 *
 * As QUINZE dimensões de recorte, num único contrato de entrada.
 *
 * Este módulo é **puro**: não importa Prisma, Next nem nada de servidor, porque a barra de
 * filtros é um componente cliente e precisa das mesmas regras de leitura que o servidor usa.
 * Um recorte interpretado de dois jeitos — um no navegador, outro no banco — produziria
 * telas que discordam de si mesmas, e é isso que a partilha deste arquivo impede.
 *
 * Três decisões merecem justificativa:
 *
 *  1. **String vazia vira `undefined`, nunca filtro.** Um `<select>` sem escolha envia `""`.
 *     Se `""` chegasse ao banco como valor, a consulta procuraria uma escola de nome vazio e
 *     devolveria lista vazia — o usuário leria "não há dados" quando na verdade não filtrou
 *     nada. Ausência de filtro é ausência da chave (Const. I aplicada à entrada).
 *
 *  2. **Valor fora do domínio é recusado, jamais corrigido em silêncio.** `avaliado=talvez`
 *     não vira "Todos": vira erro exibido. Ajuste mudo esconderia do usuário que o recorte
 *     aplicado não é o que ele pediu.
 *
 *  3. **`escola` aqui é FILTRO, nunca autorização.** Quem decide o que o usuário pode ver é
 *     `schoolScopeFilter`, no servidor (Const. IV, FR-006). Este schema apenas confere que o
 *     texto recebido é um texto.
 */

// ---------------------------------------------------------------------------
// Domínios fechados
// ---------------------------------------------------------------------------

/** Situação de participação (FR-098). "Todos" é o universo completo, não um terceiro estado. */
export const PARTICIPACOES = ['SIM', 'NAO', 'TODOS'] as const
export type Participacao = (typeof PARTICIPACOES)[number]

/** Nível de aprendizagem **da fonte**, intocável (Const. III). */
export const NIVEIS = ['ADEQUADO', 'INTERMEDIARIO', 'DEFASAGEM'] as const
export type NivelFiltro = (typeof NIVEIS)[number]

/** Situação analítica **do sistema**, derivada das faixas configuradas (FR-109, FR-111). */
export const SITUACOES = ['FRAGILIDADE', 'ATENCAO', 'SATISFATORIO'] as const
export type SituacaoFiltro = (typeof SITUACOES)[number]

export const ROTULO_PARTICIPACAO: Readonly<Record<Participacao, string>> = {
  SIM: 'Avaliados',
  NAO: 'Não avaliados',
  TODOS: 'Todos',
}

export const ROTULO_NIVEL: Readonly<Record<NivelFiltro, string>> = {
  ADEQUADO: 'Adequado',
  INTERMEDIARIO: 'Intermediário',
  DEFASAGEM: 'Defasagem',
}

export const ROTULO_SITUACAO: Readonly<Record<SituacaoFiltro, string>> = {
  FRAGILIDADE: 'Fragilidade',
  ATENCAO: 'Atenção',
  SATISFATORIO: 'Satisfatório',
}

// ---------------------------------------------------------------------------
// Blocos de construção
// ---------------------------------------------------------------------------

/**
 * Normaliza a entrada bruta antes da validação.
 *
 * `null`, `undefined` e string só de espaços são a **mesma coisa**: ausência de filtro.
 * Devolver `undefined` para os três é o que garante que o recorte vazio não vire consulta.
 */
function vazioParaIndefinido(valor: unknown): unknown {
  if (valor === null || valor === undefined) return undefined
  if (typeof valor !== 'string') return valor
  const limpo = valor.trim()
  return limpo.length === 0 ? undefined : limpo
}

const LIMITE_TEXTO = 200

function textoOpcional(rotulo: string) {
  return z.preprocess(
    vazioParaIndefinido,
    z
      .string({ invalid_type_error: `${rotulo} deve ser um texto.` })
      .max(LIMITE_TEXTO, `${rotulo} deve ter no máximo ${LIMITE_TEXTO} caracteres.`)
      .optional(),
  )
}

function enumOpcional<T extends readonly [string, ...string[]]>(
  valores: T,
  rotulo: string,
) {
  return z.preprocess(
    vazioParaIndefinido,
    z
      .enum(valores, {
        errorMap: () => ({
          message: `${rotulo} deve ser um destes valores: ${valores.join(', ')}.`,
        }),
      })
      .optional(),
  )
}

/**
 * Percentual de 0 a 100, aceito também na grafia pt-BR (`72,5`).
 *
 * O valor entra como número apenas para delimitar a faixa da consulta; nenhum cálculo de
 * desempenho passa por aqui (Const. II — a divisão continua sendo feita com `Decimal`, sobre
 * inteiros, na camada de dados).
 */
function percentualOpcional(rotulo: string) {
  return z.preprocess(
    (valor) => {
      const limpo = vazioParaIndefinido(valor)
      if (limpo === undefined) return undefined
      if (typeof limpo !== 'string') return limpo
      const numero = Number(limpo.replace(',', '.'))
      // Texto que não é número é devolvido como texto de propósito: `z.number()`
      // o recusa com mensagem, em vez de `NaN` atravessar como se fosse valor.
      return Number.isFinite(numero) ? numero : limpo
    },
    z
      .number({ invalid_type_error: `${rotulo} deve ser um número entre 0 e 100.` })
      .min(0, `${rotulo} não pode ser menor que 0.`)
      .max(100, `${rotulo} não pode ser maior que 100.`)
      .optional(),
  )
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const filtrosSchema = z
  .object({
    // 1
    avaliacao: textoOpcional('A avaliação'),
    // 2
    rede: textoOpcional('A rede'),
    // 3
    estado: textoOpcional('O estado'),
    // 4
    municipio: textoOpcional('O município'),
    // 5
    escola: textoOpcional('A escola'),
    // 6
    anoEscolar: textoOpcional('O ano escolar'),
    // 7
    componenteCurricular: textoOpcional('O componente curricular'),
    // 8
    turma: textoOpcional('A turma'),
    // 9
    codigoTurma: textoOpcional('O código da turma'),
    // 10
    avaliado: enumOpcional(PARTICIPACOES, 'A situação de participação'),
    // 11
    nivel: enumOpcional(NIVEIS, 'O nível de aprendizagem'),
    // 12
    habilidade: textoOpcional('A habilidade'),
    // 13
    estudante: textoOpcional('O estudante'),
    // 14 — uma dimensão, dois limites
    percentualMin: percentualOpcional('O percentual mínimo'),
    percentualMax: percentualOpcional('O percentual máximo'),
    // 15
    situacao: enumOpcional(SITUACOES, 'A situação analítica'),
  })
  .superRefine((filtros, ctx) => {
    const { percentualMin, percentualMax } = filtros
    if (percentualMin === undefined || percentualMax === undefined) return
    if (percentualMin > percentualMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['percentualMin'],
        message: 'O percentual mínimo não pode ser maior que o máximo.',
      })
    }
  })

export type FiltrosPainel = z.infer<typeof filtrosSchema>

/** Nenhum filtro aplicado. Recorte completo dentro do escopo do usuário. */
export const FILTROS_VAZIOS: FiltrosPainel = {}

// ---------------------------------------------------------------------------
// Dimensões
// ---------------------------------------------------------------------------

export type ChaveFiltro = keyof FiltrosPainel

export type DimensaoFiltro = Readonly<{
  id: string
  rotulo: string
  /** Chaves que compõem a dimensão. "Faixa de percentual" tem duas; as demais, uma. */
  chaves: readonly ChaveFiltro[]
}>

/**
 * As quinze dimensões de FR-098, na ordem em que a barra as apresenta: do recorte mais
 * amplo (avaliação, território) ao mais específico (estudante, faixa, situação).
 */
export const DIMENSOES_FILTRO: readonly DimensaoFiltro[] = [
  { id: 'avaliacao', rotulo: 'Avaliação', chaves: ['avaliacao'] },
  { id: 'rede', rotulo: 'Rede', chaves: ['rede'] },
  { id: 'estado', rotulo: 'Estado', chaves: ['estado'] },
  { id: 'municipio', rotulo: 'Município', chaves: ['municipio'] },
  { id: 'escola', rotulo: 'Escola', chaves: ['escola'] },
  { id: 'anoEscolar', rotulo: 'Ano escolar', chaves: ['anoEscolar'] },
  {
    id: 'componenteCurricular',
    rotulo: 'Componente curricular',
    chaves: ['componenteCurricular'],
  },
  { id: 'turma', rotulo: 'Turma', chaves: ['turma'] },
  { id: 'codigoTurma', rotulo: 'Código da turma', chaves: ['codigoTurma'] },
  { id: 'avaliado', rotulo: 'Situação de participação', chaves: ['avaliado'] },
  { id: 'nivel', rotulo: 'Nível de aprendizagem', chaves: ['nivel'] },
  { id: 'habilidade', rotulo: 'Habilidade', chaves: ['habilidade'] },
  { id: 'estudante', rotulo: 'Estudante', chaves: ['estudante'] },
  {
    id: 'percentual',
    rotulo: 'Faixa de percentual geral',
    chaves: ['percentualMin', 'percentualMax'],
  },
  { id: 'situacao', rotulo: 'Situação analítica', chaves: ['situacao'] },
]

/** Todas as chaves aceitas na query string. */
export const CHAVES_FILTRO: readonly ChaveFiltro[] = DIMENSOES_FILTRO.flatMap(
  (d) => d.chaves,
)

// ---------------------------------------------------------------------------
// Leitura e escrita
// ---------------------------------------------------------------------------

export type LeituraDeFiltros = Readonly<{
  filtros: FiltrosPainel
  /** Mensagens dos valores recusados. Vazio quando o recorte é válido. */
  erros: readonly string[]
}>

type EntradaBruta = Readonly<Record<string, string | string[] | undefined>>

function primeiro(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0]
  return valor
}

/**
 * Interpreta o recorte vindo da query string.
 *
 * Recorte inválido **não** é aplicado pela metade: devolve os filtros vazios e as mensagens,
 * para que a tela mostre o que foi recusado em vez de exibir números de um recorte que o
 * usuário não pediu.
 */
export function lerFiltros(entrada: EntradaBruta | URLSearchParams): LeituraDeFiltros {
  const bruto: Record<string, string | undefined> = {}

  if (entrada instanceof URLSearchParams) {
    for (const chave of CHAVES_FILTRO) {
      const valor = entrada.get(chave)
      if (valor !== null) bruto[chave] = valor
    }
  } else {
    for (const chave of CHAVES_FILTRO) {
      bruto[chave] = primeiro(entrada[chave])
    }
  }

  const analise = filtrosSchema.safeParse(bruto)
  if (analise.success) return { filtros: analise.data, erros: [] }

  return {
    filtros: FILTROS_VAZIOS,
    erros: analise.error.issues.map((i) => i.message),
  }
}

/** Serializa o recorte. É o que torna a análise compartilhável por link (FR-101). */
export function filtrosParaQuery(filtros: FiltrosPainel): URLSearchParams {
  const query = new URLSearchParams()
  for (const chave of CHAVES_FILTRO) {
    const valor = filtros[chave]
    if (valor === undefined) continue
    query.set(chave, String(valor))
  }
  return query
}

/** Remove uma ou mais chaves, devolvendo um recorte novo. Nunca muta o recebido. */
export function removerFiltros(
  filtros: FiltrosPainel,
  chaves: readonly ChaveFiltro[],
): FiltrosPainel {
  const saida: FiltrosPainel = { ...filtros }
  for (const chave of chaves) {
    delete saida[chave]
  }
  return saida
}

export function algumFiltroAtivo(filtros: FiltrosPainel): boolean {
  return CHAVES_FILTRO.some((chave) => filtros[chave] !== undefined)
}

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

export type FiltroAtivo = Readonly<{
  id: string
  rotulo: string
  valor: string
  /** Chaves que o botão "remover" apaga. */
  chaves: readonly ChaveFiltro[]
}>

/**
 * Descreve os filtros ativos em texto legível — FR-100.
 *
 * `rotulos` traduz identificador em nome (`clx…` → "Escola Municipal X"). Sem a tradução o
 * usuário veria uma sequência opaca e não teria como saber o que está removendo. Quando o
 * identificador não estiver no mapa, o próprio valor é exibido: melhor um código visível que
 * um filtro invisível.
 */
export function descreverFiltrosAtivos(
  filtros: FiltrosPainel,
  rotulos: Readonly<Record<string, string>> = {},
): readonly FiltroAtivo[] {
  const traduzir = (valor: string): string => rotulos[valor] ?? valor
  const ativos: FiltroAtivo[] = []

  for (const dimensao of DIMENSOES_FILTRO) {
    if (dimensao.id === 'percentual') {
      const min = filtros.percentualMin
      const max = filtros.percentualMax
      if (min === undefined && max === undefined) continue
      const texto =
        min !== undefined && max !== undefined
          ? `de ${min}% a ${max}%`
          : min !== undefined
            ? `a partir de ${min}%`
            : `até ${max}%`
      ativos.push({
        id: dimensao.id,
        rotulo: dimensao.rotulo,
        valor: texto,
        chaves: dimensao.chaves,
      })
      continue
    }

    const chave = dimensao.chaves[0]
    if (chave === undefined) continue
    const valor = filtros[chave]
    if (valor === undefined) continue

    const texto =
      chave === 'avaliado'
        ? ROTULO_PARTICIPACAO[valor as Participacao]
        : chave === 'nivel'
          ? ROTULO_NIVEL[valor as NivelFiltro]
          : chave === 'situacao'
            ? ROTULO_SITUACAO[valor as SituacaoFiltro]
            : traduzir(String(valor))

    ativos.push({
      id: dimensao.id,
      rotulo: dimensao.rotulo,
      valor: texto,
      chaves: dimensao.chaves,
    })
  }

  return ativos
}

/**
 * Converte a situação de participação escolhida no valor do banco.
 *
 * `null` significa "não restringir" — e não "não avaliado". A distinção é a mesma que separa
 * FR-059 de FR-060, e trocá-la aqui rebaixaria turmas inteiras sem erro visível.
 */
export function avaliadoParaBooleano(
  participacao: Participacao | undefined,
): boolean | null {
  if (participacao === 'SIM') return true
  if (participacao === 'NAO') return false
  return null
}
