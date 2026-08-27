'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export type PropsTooltip = {
  /** Texto explicativo. Curto: dica não substitui rótulo. */
  conteudo: string
  /** Posição em relação ao gatilho. */
  posicao?: 'acima' | 'abaixo'
  children: React.ReactNode
  className?: string
}

/**
 * Dica de contexto em CSS puro — sem estado, sem efeito, sem JavaScript.
 *
 * Aparece em `:hover` e em `:focus-within`, para que teclado e mouse tenham o mesmo acesso
 * (WCAG 1.4.13). O gatilho recebe `tabIndex` e `aria-describedby` apontando para o balão,
 * de modo que o leitor de tela leia a dica depois do rótulo em vez de ignorá-la.
 *
 * O `title` nativo é deliberadamente **omitido**: com `aria-describedby` presente, ele
 * produziria anúncio duplicado.
 */
export function Tooltip({
  conteudo,
  posicao = 'acima',
  children,
  className,
}: PropsTooltip) {
  const id = React.useId()

  return (
    <span className={cn('group relative inline-flex', className)}>
      <span
        tabIndex={0}
        aria-describedby={id}
        className="inline-flex cursor-help items-center rounded underline decoration-dotted decoration-1 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2"
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-30 w-max max-w-[16rem] -translate-x-1/2 rounded border border-borda-forte bg-texto px-2.5 py-1.5 text-rotulo font-normal leading-snug text-white shadow-elevado',
          'invisible opacity-0 transition-opacity duration-150',
          'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
          posicao === 'acima' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {conteudo}
      </span>
    </span>
  )
}
