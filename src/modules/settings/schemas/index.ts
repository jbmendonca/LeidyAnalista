import { z } from 'zod'

import type { LearningLevel } from '@prisma/client'

/**
 * ===========================================================================
 *  ENTRADA DOS CRITÉRIOS ANALÍTICOS — FR-109 a FR-113, FR-162 a FR-167
 * ===========================================================================
 *
 * Três decisões estruturais moram aqui:
 *
 *  1. **Não existe escopo.** A configuração é única para todo o sistema (FR-162, FR-167):
 *     não há campo de escola nem de avaliação neste schema, e não pode passar a haver. Uma
 *     rede que configurasse faixas por escola produziria dois "Fragilidade" incomparáveis
 *     entre si — exatamente o que o produto existe para evitar.
 *
 *  2. **Nenhum limite trafega como ponto flutuante.** `60,5` vira o inteiro `6050`
 *     (centésimos de ponto percentual), é comparado como inteiro e sai como literal decimal
 *     `"60.50"` para o `Decimal(5,2)` do banco. `Number('0.1') + Number('0.2')` não
 *     participa de nenhuma etapa (Const. II).
 *
 *  3. **As categorias daqui não são o `Nível de aprendizagem` da fonte.** `baixoRendimento`
 *     apenas *seleciona* níveis existentes para uma visão analítica; nada neste módulo cria,
 *     altera ou reordena o nível informado na planilha (Const. III, FR-112).
 */

/**
 * Níveis da fonte, na ordem pedagógica. Espelha `LearningLevel` do schema — o `satisfies`
 * quebra a compilação se o enum do banco mudar e esta lista não acompanhar.
 */
export const NIVEIS_APRENDIZAGEM = [
  'ADEQUADO',
  'INTERMEDIARIO',
  'DEFASAGEM',
] as const satisfies readonly LearningLevel[]

export type NivelAprendizagem = (typeof NIVEIS_APRENDIZAGEM)[number]

/** Aceita `60`, `60.5`, `60,50`. Recusa notação exponencial, sinal e milhar. */
const LITERAL_LIMITE = /^(\d{1,3})(?:[.,](\d{1,2}))?$/

/** Cem pontos percentuais em centésimos. Teto absoluto de qualquer faixa. */
const TETO = 10_000

/**
 * Converte o texto digitado em centésimos de ponto percentual.
 *
 * Devolve `null` para qualquer coisa que não seja um decimal posicional com até duas casas —
 * inclusive `""`, `"1e2"` e `"60%"`. Nunca devolve `0` para entrada inválida: zero é um
 * limite legítimo e não pode se confundir com ausência (Const. I).
 */
export function limiteEmCentesimos(texto: string): number | null {
  const casado = LITERAL_LIMITE.exec(texto.trim())
  if (!casado) return null

  const inteiro = casado[1]
  if (inteiro === undefined) return null

  const decimais = (casado[2] ?? '').padEnd(2, '0')
  return Number(inteiro) * 100 + Number(decimais)
}

/** Centésimos → literal decimal com duas casas, pronto para o `Decimal(5,2)` do Prisma. */
export function centesimosParaLiteral(centesimos: number): string {
  const inteiro = Math.trunc(centesimos / 100)
  const resto = centesimos % 100
  return `${inteiro}.${String(resto).padStart(2, '0')}`
}

/** `"60.00"` → `"60,00%"`. Apresentação em pt-BR; não participa de cálculo algum. */
export function formatarLimite(literal: string): string {
  return `${literal.replace('.', ',')}%`
}

function limite(rotulo: string) {
  return z
    .string({
      required_error: `Informe ${rotulo}.`,
      invalid_type_error: `Informe ${rotulo}.`,
    })
    .trim()
    .transform((valor, ctx) => {
      const centesimos = limiteEmCentesimos(valor)

      if (centesimos === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Informe ${rotulo} como número de 0 a 100, com até duas casas decimais — por exemplo 60 ou 62,5.`,
        })
        return z.NEVER
      }

      if (centesimos > TETO) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${rotulo} não pode passar de 100.`,
        })
        return z.NEVER
      }

      return centesimos
    })
}

/**
 * Critérios analíticos submetidos pelo formulário.
 *
 * Os dois limites são **superiores exclusivos**: `< fragilidadeMax` é Fragilidade,
 * `[fragilidadeMax, atencaoMax)` é Atenção, `>= atencaoMax` é Satisfatório. A checagem de
 * coerência repete a CHECK constraint `settings_faixas_coerentes` de propósito — a do banco
 * é a garantia, esta é a mensagem legível.
 */
export const criteriosSchema = z
  .object({
    fragilidadeMax: limite('o limite da faixa Fragilidade'),
    atencaoMax: limite('o limite da faixa Atenção'),
    baixoRendimento: z
      .array(
        z.enum([...NIVEIS_APRENDIZAGEM], {
          invalid_type_error: 'Nível de aprendizagem desconhecido.',
        }),
        { invalid_type_error: 'Seleção de níveis inválida.' },
      )
      .default([]),
    abaixoDoAdequadoHabilitado: z.boolean({
      invalid_type_error: 'Seleção inválida para a visão "Abaixo do adequado".',
    }),
  })
  .superRefine((valores, ctx) => {
    if (valores.fragilidadeMax > valores.atencaoMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fragilidadeMax'],
        message:
          'O limite de Fragilidade não pode ser maior que o de Atenção — a faixa Atenção ficaria vazia.',
      })
    }
  })
  .transform((valores) => ({
    fragilidadeMax: centesimosParaLiteral(valores.fragilidadeMax),
    atencaoMax: centesimosParaLiteral(valores.atencaoMax),
    // Duplicata de nível é ruído do formulário, não intenção: colapsada aqui.
    baixoRendimento: [...new Set(valores.baixoRendimento)],
    abaixoDoAdequadoHabilitado: valores.abaixoDoAdequadoHabilitado,
  }))

export type EntradaCriterios = z.infer<typeof criteriosSchema>

/** Lê os campos do formulário sem confiar no que o navegador enviou. */
export function lerCriteriosDoFormulario(formData: FormData): unknown {
  const marcado = formData.get('abaixoDoAdequadoHabilitado')

  return {
    fragilidadeMax: formData.get('fragilidadeMax'),
    atencaoMax: formData.get('atencaoMax'),
    baixoRendimento: formData.getAll('baixoRendimento'),
    abaixoDoAdequadoHabilitado: marcado === 'on' || marcado === 'true',
  }
}

/**
 * Estado devolvido ao `useActionState`.
 *
 * `exactOptionalPropertyTypes` proíbe `{ erro: undefined }` — e é bom que proíba: ausência
 * de erro é ausência da chave, não uma chave vazia.
 */
export type EstadoCriterios = {
  erro?: string
  camposComErro?: Record<string, string[]>
  versaoCriada?: number
}

/** Converte o erro do Zod no formato do estado, descartando chaves sem mensagem. */
export function camposComErroDe(erro: z.ZodError): Record<string, string[]> {
  const saida: Record<string, string[]> = {}
  for (const [campo, mensagens] of Object.entries(erro.flatten().fieldErrors)) {
    if (mensagens && mensagens.length > 0) saida[campo] = mensagens
  }
  return saida
}
