'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { formatarNumero } from '@/lib/format'
import { COR } from './paleta'

/**
 * Participação como barra empilhada única.
 *
 * O ponto pedagógico que esta barra existe para deixar claro: **o não avaliado
 * ocupa espaço aqui e em nenhum outro lugar**. Ele entra no denominador da
 * participação (FR-060) e sai de todo denominador de desempenho (FR-059).
 *
 * A hachura no segmento dos não avaliados não é enfeite: distingue "ausência
 * de dado" de "desempenho baixo" sem depender de cor, e sobrevive à impressão
 * em preto e branco.
 */
export function GraficoParticipacao({
  total,
  avaliados,
  naoAvaliados,
  taxaFormatada,
  className,
}: {
  total: number
  avaliados: number
  naoAvaliados: number
  taxaFormatada: string
  className?: string | undefined
}) {
  if (total === 0) {
    return (
      <p className={cn('text-sm text-texto-suave', className)}>
        Nenhum registro importado neste recorte.
      </p>
    )
  }

  const proporcaoAvaliados = (avaliados / total) * 100

  return (
    <div className={cn('space-y-2.5', className)}>
      <div
        className="flex h-9 w-full overflow-hidden rounded-md border border-borda-forte"
        aria-hidden="true"
      >
        {avaliados > 0 && (
          <div
            className="flex items-center justify-center text-rotulo font-semibold text-primaria-contraste"
            style={{ width: `${proporcaoAvaliados}%`, backgroundColor: COR.primaria }}
          >
            {proporcaoAvaliados >= 18 ? `${formatarNumero(avaliados)} avaliados` : null}
          </div>
        )}
        {naoAvaliados > 0 && (
          <div
            className="flex flex-1 items-center justify-center text-rotulo font-semibold text-texto"
            style={{
              // Hachura: ausência de dado tem textura própria, não um tom mais
              // claro da mesma cor — que seria lido como "menos desempenho".
              backgroundImage: `repeating-linear-gradient(45deg, ${COR.ausente} 0 5px, ${COR.superficie} 5px 10px)`,
            }}
          >
            {100 - proporcaoAvaliados >= 18 ? formatarNumero(naoAvaliados) : null}
          </div>
        )}
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-rotulo">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: COR.primaria }}
          />
          <dt className="text-texto-suave">Avaliados</dt>
          <dd className="font-semibold tabular-nums text-texto">
            {formatarNumero(avaliados)} — {taxaFormatada}
          </dd>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[2px] border border-borda-forte"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, ${COR.ausente} 0 3px, ${COR.superficie} 3px 6px)`,
            }}
          />
          <dt className="text-texto-suave">Não avaliados</dt>
          <dd className="font-semibold tabular-nums text-texto">
            {formatarNumero(naoAvaliados)}
          </dd>
        </div>

        <div className="flex items-center gap-1.5">
          <dt className="text-texto-suave">Total importado</dt>
          <dd className="font-semibold tabular-nums text-texto">{formatarNumero(total)}</dd>
        </div>
      </dl>

      <p className="text-rotulo text-texto-suave">
        Os {formatarNumero(naoAvaliados)} não avaliados contam aqui e ficam fora de todo
        denominador de desempenho.
      </p>
    </div>
  )
}
