import * as React from 'react'

import { cn } from '@/lib/utils'

export type PropsSeparator = React.HTMLAttributes<HTMLDivElement> & {
  orientacao?: 'horizontal' | 'vertical'
  /** Separador puramente decorativo sai da árvore de acessibilidade. */
  decorativo?: boolean
}

export function Separator({
  className,
  orientacao = 'horizontal',
  decorativo = true,
  ...props
}: PropsSeparator) {
  return (
    <div
      role={decorativo ? 'none' : 'separator'}
      aria-orientation={decorativo ? undefined : orientacao}
      className={cn(
        'shrink-0 bg-borda',
        orientacao === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
}
