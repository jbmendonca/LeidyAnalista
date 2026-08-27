import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Etiqueta genérica de estado (importação, papel de usuário, situação de registro).
 *
 * Não serve para nível de aprendizagem nem para faixa analítica: aqueles têm componentes
 * próprios (`NivelBadge`, `FaixaBadge`) justamente para que as duas escalas do sistema não
 * possam ser desenhadas por engano com o mesmo vocabulário visual desta.
 *
 * O rótulo textual é sempre o conteúdo do elemento — nenhuma variante comunica só por cor.
 */
const variantesBadge = cva(
  'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-rotulo font-medium',
  {
    variants: {
      variante: {
        neutro: 'border-borda-forte bg-superficie-tenue text-texto',
        informativo: 'border-info bg-info-tenue text-info',
        sucesso: 'border-sucesso bg-sucesso-tenue text-sucesso',
        aviso: 'border-aviso bg-aviso-tenue text-aviso',
        perigo: 'border-perigo bg-perigo-tenue text-perigo',
        destaque: 'border-primaria bg-primaria-tenue text-primaria-forte',
      },
    },
    defaultVariants: { variante: 'neutro' },
  },
)

export type PropsBadge = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof variantesBadge>

export function Badge({ className, variante, ...props }: PropsBadge) {
  return <span className={cn(variantesBadge({ variante }), className)} {...props} />
}

export { variantesBadge }
