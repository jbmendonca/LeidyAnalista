import * as React from 'react'

import { cn } from '@/lib/utils'
import { AUSENTE } from '@/lib/format'
import type { CelulaMapaCalor } from '@/modules/analytics/application/heatmap'

/**
 * Célula do mapa de calor — FR-095, FR-096, FR-097.
 *
 * Três decisões sustentam esta célula, e nenhuma é estética:
 *
 * 1. **A cor nunca responde sozinha** (FR-096, WCAG 1.4.1). O fundo indica a faixa
 *    analítica, mas a fração aparece impressa dentro da célula e o percentual logo abaixo.
 *    Impressa em preto e branco, ou vista por quem não distingue as matizes, a célula
 *    continua legível — porque o número é o portador do significado, e a cor apenas o
 *    acompanha.
 *
 * 2. **Ausência é um estado próprio, não um zero pálido** (FR-097). A célula sem resultado
 *    tem borda tracejada, fundo neutro, hachura diagonal e travessão no lugar do número. A
 *    célula com resultado zero é sólida, colorida como Fragilidade e escrita `0 / 2`. As
 *    duas nunca se parecem, porque significam coisas opostas: "não fez" e "fez e errou".
 *
 * 3. **Todo o conteúdo de FR-095 está em `title` e `aria-label`** — código da habilidade,
 *    resultado original, percentual e descrição pedagógica — num elemento focalizável, de
 *    modo que quem navega por teclado alcance a mesma informação que quem passa o mouse.
 *
 * O texto vem formatado da camada de dados. O componente não divide, não arredonda e não
 * completa lacuna: se ele calculasse, existiriam duas verdades para o mesmo número.
 */

const FUNDO_POR_FAIXA = {
  FRAGILIDADE:
    'bg-faixa-fragilidade-fundo text-faixa-fragilidade border-faixa-fragilidade-borda',
  ATENCAO: 'bg-faixa-atencao-fundo text-faixa-atencao border-faixa-atencao-borda',
  SATISFATORIO:
    'bg-faixa-satisfatorio-fundo text-faixa-satisfatorio border-faixa-satisfatorio-borda',
} as const

/**
 * Hachura diagonal da célula vazia. Sinal de forma, independente de cor — é o que separa
 * "sem resultado" de "resultado zero" para quem imprime a tela ou não distingue matizes.
 */
const HACHURA_AUSENCIA =
  'repeating-linear-gradient(135deg, rgb(var(--cor-nivel-ausente-borda) / 0.22) 0 2px, transparent 2px 6px)'

export type PropsMapaCalorCelula = {
  celula: CelulaMapaCalor
  className?: string
}

export function MapaCalorCelula({ celula, className }: PropsMapaCalorCelula) {
  const base =
    'flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-sm border px-1 py-1 text-center leading-tight ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-1'

  if (!celula.temResultado) {
    return (
      <td
        className={cn('p-1 align-middle', className)}
        data-sem-resultado=""
        data-habilidade={celula.shortCode}
      >
        <span
          tabIndex={0}
          role="note"
          title={celula.rotuloAcessivel}
          aria-label={celula.rotuloAcessivel}
          style={{ backgroundImage: HACHURA_AUSENCIA }}
          className={cn(
            base,
            'border-dashed border-nivel-ausente-borda bg-nivel-ausente-fundo text-nivel-ausente',
          )}
        >
          <span className="ausente text-sm font-semibold" aria-hidden="true">
            {AUSENTE}
          </span>
          <span className="text-[0.6875rem]" aria-hidden="true">
            sem resultado
          </span>
        </span>
      </td>
    )
  }

  const faixa = celula.faixa

  return (
    <td
      className={cn('p-1 align-middle', className)}
      data-com-resultado=""
      data-faixa={faixa ?? undefined}
      data-habilidade={celula.shortCode}
    >
      <span
        tabIndex={0}
        role="note"
        title={celula.rotuloAcessivel}
        aria-label={celula.rotuloAcessivel}
        className={cn(
          base,
          faixa ? FUNDO_POR_FAIXA[faixa] : 'border-borda bg-superficie',
        )}
      >
        {/* O valor numérico permanece visível: a cor acompanha, nunca substitui. */}
        <span className="text-sm font-semibold tabular-nums">{celula.fracaoTexto}</span>
        <span className="text-[0.6875rem] tabular-nums opacity-90">
          {celula.percentualTexto}
        </span>
      </span>
    </td>
  )
}
