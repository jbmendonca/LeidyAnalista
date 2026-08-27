import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type PropsSelect = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalido?: boolean
  descritoPor?: string
}

/**
 * Seleção baseada no `<select>` nativo.
 *
 * Deliberadamente não é um menu construído em JavaScript: o controle nativo já traz
 * navegação por teclado, busca por digitação e a roleta do sistema no smartphone — tudo isso
 * teria de ser reimplementado, e mal, num substituto. O contexto de uso (gestor sob pressão
 * de tempo, muitas vezes no celular) não comporta esse risco.
 */
export const Select = React.forwardRef<HTMLSelectElement, PropsSelect>(function Select(
  { className, invalido, descritoPor, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalido ? true : undefined}
        aria-describedby={descritoPor}
        className={cn(
          'h-10 w-full appearance-none rounded border bg-superficie py-2 pl-3 pr-9 text-sm text-texto',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2 focus-visible:ring-offset-superficie',
          'disabled:cursor-not-allowed disabled:bg-superficie-tenue disabled:opacity-70',
          invalido ? 'border-perigo focus-visible:ring-perigo' : 'border-borda-forte',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-texto-suave"
      />
    </div>
  )
})
