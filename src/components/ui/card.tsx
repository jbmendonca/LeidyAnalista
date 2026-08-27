import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Cartão de superfície. `data-cartao` existe para a folha de impressão, que evita quebrar
 * um cartão ao meio entre duas páginas.
 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-cartao=""
        className={cn(
          'rounded-md border border-borda bg-superficie shadow-cartao',
          className,
        )}
        {...props}
      />
    )
  },
)

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1 px-4 py-4 sm:px-5', className)}
      {...props}
    />
  )
})

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }
>(function CardTitle({ className, as: Tag = 'h3', ...props }, ref) {
  return (
    <Tag
      ref={ref}
      className={cn('text-base font-semibold text-texto', className)}
      {...props}
    />
  )
})

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-texto-suave', className)} {...props} />
})

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('px-4 pb-4 sm:px-5', className)} {...props} />
})

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-wrap items-center gap-2 border-t border-borda px-4 py-3 sm:px-5',
        className,
      )}
      {...props}
    />
  )
})
