import * as React from 'react'
import { FileQuestion } from 'lucide-react'

import { cn } from '@/lib/utils'

export type PropsEmptyState = {
  /** Primeira linha. Padrão: "Nenhum registro para o recorte selecionado". */
  titulo?: string
  /** Por que não há nada e o que ainda pode ser tentado. Obrigatório: o vazio sem
   *  orientação deixa o usuário sem próximo passo. */
  orientacao: React.ReactNode
  /** Ação sugerida — limpar filtro, abrir importação, trocar período. */
  acao?: React.ReactNode
  /** Ícone alternativo, já dimensionado pelo componente. */
  icone?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  className?: string
}

/**
 * Estado vazio.
 *
 * Const. I — **nunca** exibe indicador zerado. Ausência de registro não é desempenho de 0%
 * nem participação de 0: é ausência, e é assim que precisa se apresentar. Um painel que
 * mostrasse "0%" para um recorte sem dado levaria um gestor a concluir que a escola foi mal
 * quando na verdade nada foi importado — o erro de leitura mais caro que este sistema pode
 * induzir.
 *
 * Por isso a orientação é obrigatória: o vazio precisa dizer o que fazer a seguir.
 */
export function EmptyState({
  titulo = 'Nenhum registro para o recorte selecionado',
  orientacao,
  acao,
  icone: Icone = FileQuestion,
  className,
}: PropsEmptyState) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-borda-forte bg-superficie px-5 py-10 text-center',
        className,
      )}
    >
      <Icone aria-hidden="true" className="size-8 text-texto-suave" />

      <p className="text-base font-semibold text-texto">{titulo}</p>

      <div className="max-w-prose text-sm text-texto-suave">{orientacao}</div>

      {acao ? (
        <div className="mt-1 flex flex-wrap justify-center gap-2">{acao}</div>
      ) : null}
    </div>
  )
}

/**
 * Estado vazio dentro de tabela, ocupando a largura toda.
 *
 * Existe para que ninguém precise improvisar uma linha com traços — improviso que costuma
 * degenerar em uma linha de zeros.
 */
export function EmptyTableRow({
  colunas,
  orientacao,
  titulo,
}: {
  colunas: number
  orientacao: React.ReactNode
  titulo?: string
}) {
  return (
    <tr>
      <td colSpan={colunas} className="p-0">
        <EmptyState
          titulo={titulo ?? 'Nenhum registro para o recorte selecionado'}
          orientacao={orientacao}
          className="rounded-none border-0 border-t"
        />
      </td>
    </tr>
  )
}
