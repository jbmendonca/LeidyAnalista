import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Contêiner de rolagem da tabela.
 *
 * Regra 4 do painel: a tabela larga rola **dentro deste contêiner**; a página nunca rola na
 * horizontal. `tabIndex={0}` é o que torna a região rolável alcançável por teclado — sem ele,
 * quem não usa mouse não chega às colunas da direita (WCAG 2.1.1).
 */
export const TableContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { rotulo?: string }
>(function TableContainer({ className, rotulo, ...props }, ref) {
  return (
    <div
      ref={ref}
      role="region"
      tabIndex={0}
      aria-label={rotulo ?? 'Tabela de dados, rolável na horizontal'}
      className={cn(
        'rolagem-tabela rounded-md border border-borda bg-superficie',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  )
})

export const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(function Table({ className, ...props }, ref) {
  return (
    <table
      ref={ref}
      className={cn('w-full min-w-max caption-bottom border-collapse text-sm', className)}
      {...props}
    />
  )
})

export const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(function TableCaption({ className, ...props }, ref) {
  return (
    <caption
      ref={ref}
      className={cn('px-4 py-3 text-left text-rotulo text-texto-suave', className)}
      {...props}
    />
  )
})

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cn('border-b border-borda bg-superficie-tenue', className)}
      {...props}
    />
  )
})

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={cn('divide-y divide-borda', className)} {...props} />
})

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableFooter({ className, ...props }, ref) {
  return (
    <tfoot
      ref={ref}
      className={cn(
        'border-t-2 border-borda-forte bg-superficie-tenue font-medium',
        className,
      )}
      {...props}
    />
  )
})

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={cn(
        'transition-colors hover:bg-primaria-tenue/60 data-[selecionada=true]:bg-primaria-tenue',
        className,
      )}
      {...props}
    />
  )
})

export type PropsTableHead = React.ThHTMLAttributes<HTMLTableCellElement> & {
  /** Direção de ordenação corrente, anunciada por `aria-sort`. */
  ordenacao?: 'crescente' | 'decrescente' | null
  /** Alinha à direita — a norma para colunas numéricas. */
  numerica?: boolean
}

const ARIA_SORT = {
  crescente: 'ascending',
  decrescente: 'descending',
} as const

export const TableHead = React.forwardRef<HTMLTableCellElement, PropsTableHead>(
  function TableHead({ className, ordenacao, numerica, ...props }, ref) {
    return (
      <th
        ref={ref}
        scope="col"
        aria-sort={ordenacao ? ARIA_SORT[ordenacao] : undefined}
        className={cn(
          'px-3 py-2.5 text-left align-middle text-rotulo font-semibold text-texto',
          numerica && 'text-right tabular-nums',
          className,
        )}
        {...props}
      />
    )
  },
)

export type PropsTableCell = React.TdHTMLAttributes<HTMLTableCellElement> & {
  numerica?: boolean
}

export const TableCell = React.forwardRef<HTMLTableCellElement, PropsTableCell>(
  function TableCell({ className, numerica, ...props }, ref) {
    return (
      <td
        ref={ref}
        className={cn(
          'px-3 py-2.5 align-middle text-texto',
          numerica && 'text-right tabular-nums',
          className,
        )}
        {...props}
      />
    )
  },
)

/**
 * Célula de cabeçalho de linha (nome do estudante, da turma, da habilidade).
 * `scope="row"` é o que dá contexto ao leitor de tela em tabela larga.
 */
export const TableRowHeader = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(function TableRowHeader({ className, ...props }, ref) {
  return (
    <th
      ref={ref}
      scope="row"
      className={cn('px-3 py-2.5 text-left align-middle font-medium text-texto', className)}
      {...props}
    />
  )
})
