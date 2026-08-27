'use client'

import * as React from 'react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@/lib/utils'
import { COR, corDaFaixa, ROTULO_FAIXA } from './paleta'

/**
 * Ranking de habilidades em barras horizontais.
 *
 * Quatro decisões que valem explicar:
 *
 * 1. **Barra horizontal, não vertical.** O rótulo de cada habilidade é o código
 *    curto mais a descrição; na vertical o texto giraria ou seria truncado, e a
 *    leitura passaria a depender de decorar qual coluna é qual.
 *
 * 2. **A cor da barra é a faixa analítica, mas o valor está escrito na ponta.**
 *    Quem não distingue os matizes, quem usa leitor de tela e quem imprime em
 *    preto e branco leem o mesmo número (Const. VIII).
 *
 * 3. **As linhas de corte aparecem no gráfico.** Sem elas, uma barra em 61% e
 *    outra em 59% parecem quase iguais — quando estão em faixas diferentes. A
 *    régua torna a fronteira visível, e ela vem da configuração, nunca de
 *    constante no código (FR-111).
 *
 * 4. **Altura calculada, não `100%`.** O contêiner recebe altura em pixels
 *    derivada do número de barras. `ResponsiveContainer` com altura relativa
 *    dentro de um pai sem altura definida produz medição instável — origem
 *    clássica de gráfico que invade o bloco vizinho.
 */

export type BarraHabilidade = {
  shortCode: string
  referenceCode: string
  descricao: string
  acertos: number | null
  itens: number | null
  /** Já dividido, para a barra. `null` é ausência: a habilidade não entra. */
  percentual: number | null
  percentualFormatado: string
  faixa: 'FRAGILIDADE' | 'ATENCAO' | 'SATISFATORIO' | null
  estudantesEmFragilidade: number
  estudantesComResultado: number
}

const ALTURA_POR_BARRA = 30
const ALTURA_EIXO = 34

export function GraficoRankingHabilidades({
  habilidades,
  fragilidadeMax,
  atencaoMax,
  className,
}: {
  habilidades: readonly BarraHabilidade[]
  /** Limite superior da faixa Fragilidade, em pontos percentuais. */
  fragilidadeMax: number
  /** Limite superior da faixa Atenção, em pontos percentuais. */
  atencaoMax: number
  className?: string | undefined
}) {
  const comResultado = habilidades.filter(
    (h): h is BarraHabilidade & { percentual: number } => h.percentual !== null,
  )
  const semResultado = habilidades.filter((h) => h.percentual === null)

  if (comResultado.length === 0) {
    return (
      <p className={cn('text-sm text-texto-suave', className)}>
        Nenhuma habilidade com resultado neste recorte. Sem denominador não há percentual —
        e ausência não é zero.
      </p>
    )
  }

  const dados = comResultado.map((h) => ({
    shortCode: h.shortCode,
    valor: h.percentual,
    rotulo: h.percentualFormatado,
    faixa: h.faixa,
  }))

  const altura = dados.length * ALTURA_POR_BARRA + ALTURA_EIXO

  return (
    <div className={cn('space-y-3', className)}>
      {/*
        O gráfico é redundante em relação à tabela que o acompanha na página,
        por isso é escondido do leitor de tela: anunciar duas vezes o mesmo
        conteúdo atrapalha em vez de ajudar.
      */}
      <div style={{ height: altura }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
            barCategoryGap={6}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: COR.textoSuave, fontSize: 11 }}
              axisLine={{ stroke: COR.borda }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="shortCode"
              width={42}
              tick={{ fill: COR.texto, fontSize: 12, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />

            {/* Réguas das faixas analíticas, vindas da configuração vigente. */}
            <ReferenceLine
              x={fragilidadeMax}
              stroke={corDaFaixa('FRAGILIDADE')}
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
            <ReferenceLine
              x={atencaoMax}
              stroke={corDaFaixa('ATENCAO')}
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />

            <Bar dataKey="valor" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {dados.map((d) => (
                <Cell key={d.shortCode} fill={corDaFaixa(d.faixa)} />
              ))}
              <LabelList
                dataKey="rotulo"
                position="right"
                style={{ fill: COR.texto, fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Legenda fragilidadeMax={fragilidadeMax} atencaoMax={atencaoMax} />

      {semResultado.length > 0 && (
        <p className="text-rotulo text-texto-suave">
          {semResultado.length} habilidade(s) sem resultado no recorte não aparecem no
          gráfico: {semResultado.map((h) => h.shortCode).join(', ')}. Ausência de dado não é
          desempenho zero.
        </p>
      )}
    </div>
  )
}

function Legenda({
  fragilidadeMax,
  atencaoMax,
}: {
  fragilidadeMax: number
  atencaoMax: number
}) {
  const itens = [
    { faixa: 'FRAGILIDADE', texto: `abaixo de ${formatar(fragilidadeMax)}%` },
    {
      faixa: 'ATENCAO',
      texto: `de ${formatar(fragilidadeMax)}% a ${formatar(atencaoMax - 0.01)}%`,
    },
    { faixa: 'SATISFATORIO', texto: `${formatar(atencaoMax)}% ou mais` },
  ] as const

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="text-rotulo font-medium text-texto-suave">
        Faixa analítica do sistema:
      </span>
      {itens.map((i) => (
        <span key={i.faixa} className="flex items-center gap-1.5 text-rotulo text-texto">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: corDaFaixa(i.faixa) }}
          />
          <strong className="font-semibold">{ROTULO_FAIXA[i.faixa]}</strong>
          <span className="text-texto-suave">— {i.texto}</span>
        </span>
      ))}
    </div>
  )
}

function formatar(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor)
}
