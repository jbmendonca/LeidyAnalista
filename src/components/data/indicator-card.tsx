import * as React from 'react'

import { cn } from '@/lib/utils'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { Card } from '@/components/ui/card'

export type PropsIndicatorCard = {
  /** Nome do indicador. Ex.: "Desempenho geral". */
  titulo: string
  /**
   * Valor **já formatado** por quem chama — `formatPercent` de `src/lib/decimal.ts` para
   * desempenho, `formatarNumero` para contagem. O cartão não calcula nada: se ele
   * arredondasse por conta própria, existiriam duas verdades para o mesmo número.
   *
   * `null` ou o travessão significam ausência de dado.
   */
  valor: string | null
  /** Numerador que originou o valor. Ex.: acertos, ou crianças avaliadas. */
  numerador: number | null
  /** Denominador que originou o valor. Ex.: itens possíveis, ou crianças previstas. */
  denominador: number | null
  /** Nome do que está sendo contado, no plural. Ex.: "itens", "crianças". */
  unidade: string
  /** Texto curto de contexto, abaixo da procedência. */
  descricao?: React.ReactNode
  /** Nota exibida quando não há dado. */
  notaAusencia?: string
  /** Etiqueta de faixa ou nível, quando o indicador tiver classificação associada. */
  classificacao?: React.ReactNode
  className?: string
}

/**
 * Cartão de indicador com procedência do cálculo.
 *
 * Requisito de rastreabilidade: o percentual **nunca** aparece sozinho. Logo abaixo do valor
 * vêm os dois inteiros que o produziram — "95 de 106 itens" — porque é a razão
 * `Σ acertos ÷ Σ itens` que define o desempenho, e sem os termos visíveis o leitor não tem
 * como distinguir 100% de 1/1 de 100% de 300/300. Os dois casos pedem decisões pedagógicas
 * opostas.
 *
 * Const. I — sem dado, o valor é travessão acompanhado de nota explícita, jamais `0` ou `0%`.
 * Um denominador ausente ou não positivo é tratado como ausência total: percentual sobre
 * denominador zero não existe.
 */
export function IndicatorCard({
  titulo,
  valor,
  numerador,
  denominador,
  unidade,
  descricao,
  notaAusencia = 'sem dados de desempenho',
  classificacao,
  className,
}: PropsIndicatorCard) {
  const semDenominador =
    denominador === null || !Number.isFinite(denominador) || denominador <= 0
  const semValor = valor === null || valor === '' || valor === AUSENTE
  const semNumerador = numerador === null || !Number.isFinite(numerador)

  const semDado = semValor || semDenominador || semNumerador

  return (
    <Card
      data-indicador=""
      className={cn('flex h-full flex-col gap-1 p-4', className)}
      aria-label={titulo}
    >
      <p className="text-rotulo font-medium uppercase tracking-wide text-texto-suave">
        {titulo}
      </p>

      {semDado ? (
        <>
          <p className="text-3xl font-semibold leading-tight">
            <span className="ausente" aria-hidden="true">
              {AUSENTE}
            </span>
            <span className="apenas-leitor-de-tela">Sem dado</span>
          </p>
          <p className="text-rotulo text-texto-suave">{notaAusencia}</p>
        </>
      ) : (
        <>
          <p className="text-3xl font-semibold leading-tight tabular-nums text-texto">
            {valor}
          </p>
          {/* A procedência do cálculo, sempre visível junto ao número. */}
          <p className="text-rotulo text-texto-suave">
            <span className="font-medium text-texto">{formatarNumero(numerador)}</span> de{' '}
            <span className="font-medium text-texto">{formatarNumero(denominador)}</span>{' '}
            {unidade}
          </p>
        </>
      )}

      {classificacao ? <div className="pt-1">{classificacao}</div> : null}

      {descricao ? (
        <p className="pt-1 text-rotulo text-texto-suave">{descricao}</p>
      ) : null}
    </Card>
  )
}
