import * as React from 'react'

import { cn } from '@/lib/utils'

export type PropsInput = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Marca o campo como inválido e vincula a mensagem de erro por `aria-describedby`. */
  invalido?: boolean
  /** `id` do elemento que descreve o campo (ajuda ou erro). */
  descritoPor?: string
}

/**
 * Campo de texto.
 *
 * A borda usa `borda-forte` (4,2:1 contra a superfície) porque contorno de controle é
 * elemento gráfico e precisa de 3:1 — a borda decorativa clara reprovaria em WCAG 1.4.11.
 * O estado inválido não é sinalizado apenas pela borda vermelha: `aria-invalid` o expõe ao
 * leitor de tela e a mensagem em texto acompanha o campo.
 */
export const Input = React.forwardRef<HTMLInputElement, PropsInput>(function Input(
  { className, invalido, descritoPor, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type ?? 'text'}
      aria-invalid={invalido ? true : undefined}
      aria-describedby={descritoPor}
      className={cn(
        'flex h-10 w-full rounded border bg-superficie px-3 py-2 text-sm text-texto',
        'placeholder:text-texto-suave',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2 focus-visible:ring-offset-superficie',
        'disabled:cursor-not-allowed disabled:bg-superficie-tenue disabled:opacity-70',
        invalido ? 'border-perigo focus-visible:ring-perigo' : 'border-borda-forte',
        className,
      )}
      {...props}
    />
  )
})
