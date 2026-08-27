import * as React from 'react'

import { cn } from '@/lib/utils'

export type PropsSkeleton = React.HTMLAttributes<HTMLDivElement> & {
  /** Texto anunciado enquanto o conteúdo carrega. */
  rotulo?: string
}

/**
 * Espaço reservado durante o carregamento.
 *
 * Const. I — o esqueleto não é um valor: nunca deve ser substituído por `0` quando a
 * resposta chegar vazia. Sem dado, quem entra no lugar é `EmptyState` ou o travessão.
 *
 * `aria-hidden` nas peças e um único `status` textual por bloco: dezenas de retângulos
 * anunciados individualmente transformariam o carregamento em ruído.
 */
export function Skeleton({ className, rotulo, ...props }: PropsSkeleton) {
  return (
    <>
      {rotulo ? (
        <span role="status" className="apenas-leitor-de-tela">
          {rotulo}
        </span>
      ) : null}
      <div
        aria-hidden="true"
        className={cn('animate-pulsar rounded bg-superficie-tenue', className)}
        {...props}
      />
    </>
  )
}
