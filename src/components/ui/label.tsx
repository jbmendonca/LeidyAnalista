import * as React from 'react'

import { cn } from '@/lib/utils'

export type PropsLabel = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Exibe a marca de obrigatoriedade. */
  obrigatorio?: boolean
}

/**
 * Rótulo de campo.
 *
 * O asterisco de obrigatoriedade vem acompanhado do texto "obrigatório" para leitor de tela:
 * um `*` solto é uma convenção visual que não se traduz em áudio.
 */
export const Label = React.forwardRef<HTMLLabelElement, PropsLabel>(function Label(
  { className, obrigatorio, children, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn('block text-rotulo font-medium text-texto', className)}
      {...props}
    >
      {children}
      {obrigatorio ? (
        <>
          <span aria-hidden="true" className="ml-0.5 text-perigo">
            *
          </span>
          <span className="apenas-leitor-de-tela"> (obrigatório)</span>
        </>
      ) : null}
    </label>
  )
})
