import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const variantesBotao = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2 focus-visible:ring-offset-superficie',
    // `aria-disabled` cobre o botão que precisa continuar focável para anunciar o motivo.
    'disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ),
  {
    variants: {
      variante: {
        primario:
          'bg-primaria text-primaria-contraste hover:bg-primaria-forte active:bg-primaria-forte',
        secundario:
          'border border-borda-forte bg-superficie text-texto hover:bg-superficie-tenue',
        sutil: 'bg-transparent text-texto hover:bg-superficie-tenue',
        vinculo:
          'bg-transparent text-primaria underline underline-offset-4 hover:text-primaria-forte',
        perigo:
          'bg-perigo text-perigo-contraste hover:brightness-95 active:brightness-90',
      },
      tamanho: {
        // 2,25rem = 36px no desktop; o `@media (pointer: coarse)` de globals.css
        // eleva para 44px onde o alvo é o dedo (WCAG 2.5.5).
        pequeno: 'h-9 px-3 text-rotulo',
        medio: 'h-10 px-4 text-sm',
        grande: 'h-11 px-6 text-base',
        icone: 'size-10 p-0',
      },
      largura: {
        automatica: '',
        total: 'w-full',
      },
    },
    defaultVariants: {
      variante: 'primario',
      tamanho: 'medio',
      largura: 'automatica',
    },
  },
)

export type PropsBotao = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variantesBotao>

/**
 * Botão base. `type` é `button` por padrão de propósito: o padrão do HTML é `submit`, e um
 * botão auxiliar dentro de formulário acabaria enviando dados sem que ninguém pedisse.
 */
export const Button = React.forwardRef<HTMLButtonElement, PropsBotao>(
  function Button({ className, variante, tamanho, largura, type, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(variantesBotao({ variante, tamanho, largura }), className)}
        {...props}
      />
    )
  },
)

export { variantesBotao }
