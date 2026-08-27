'use client'

import * as React from 'react'
import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { cn } from '@/lib/utils'
import { COR, corDaFaixa } from './paleta'

export type PontoHabilidade = {
  shortCode: string
  descricao: string
  /** Percentual de acerto da habilidade no recorte. */
  percentual: number | null
  percentualFormatado: string
  /** Percentual de estudantes cujo resultado nesta habilidade caiu em Fragilidade. */
  fragilidadePercentual: number | null
  fragilidadeFormatada: string
  estudantesEmFragilidade: number
  estudantesComResultado: number
  faixa: 'FRAGILIDADE' | 'ATENCAO' | 'SATISFATORIO' | null
}

/**
 * Desempenho médio × concentração de dificuldade.
 *
 * Existe para responder ao que a média sozinha esconde. Duas habilidades podem
 * ter o mesmo percentual de acerto e significar coisas opostas:
 *
 *   - a turma inteira acertando mais ou menos igual, ou
 *   - metade acertando tudo e metade errando tudo.
 *
 * O eixo horizontal é o desempenho da habilidade; o vertical, a proporção de
 * estudantes que ficaram na faixa de Fragilidade nela. **O canto superior
 * esquerdo é o que exige ação**: percentual baixo e dificuldade concentrada em
 * muita gente. Já um ponto no canto inferior esquerdo indica dificuldade
 * distribuída — todo mundo um pouco, ninguém muito.
 */
export function GraficoDispersaoHabilidades({
  habilidades,
  fragilidadeMax,
  className,
}: {
  habilidades: readonly PontoHabilidade[]
  fragilidadeMax: number
  className?: string | undefined
}) {
  const pontos = habilidades
    .filter(
      (h): h is PontoHabilidade & { percentual: number; fragilidadePercentual: number } =>
        h.percentual !== null && h.fragilidadePercentual !== null,
    )
    .map((h) => ({
      x: h.percentual,
      y: h.fragilidadePercentual,
      z: 1,
      shortCode: h.shortCode,
      faixa: h.faixa,
    }))

  if (pontos.length === 0) {
    return (
      <p className={cn('text-sm text-texto-suave', className)}>
        Sem habilidades com resultado suficiente para comparar.
      </p>
    )
  }

  const medianaFragilidade = mediana(pontos.map((p) => p.y))

  return (
    <div className={cn('space-y-3', className)}>
      <div style={{ height: 300 }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 20, bottom: 30, left: 4 }}>
            <CartesianGrid stroke={COR.borda} strokeDasharray="3 3" />

            {/* Zona de ação: desempenho abaixo do corte e dificuldade acima da mediana. */}
            <ReferenceArea
              x1={0}
              x2={fragilidadeMax}
              y1={medianaFragilidade}
              y2={100}
              fill={corDaFaixa('FRAGILIDADE')}
              fillOpacity={0.07}
            />

            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: COR.textoSuave, fontSize: 11 }}
              axisLine={{ stroke: COR.borda }}
              tickLine={false}
              label={{
                value: 'Percentual de acerto da habilidade →',
                position: 'insideBottom',
                offset: -18,
                style: { fill: COR.textoSuave, fontSize: 11 },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: COR.textoSuave, fontSize: 11 }}
              axisLine={{ stroke: COR.borda }}
              tickLine={false}
              width={44}
              label={{
                value: '↑ estudantes em Fragilidade',
                angle: -90,
                position: 'insideLeft',
                style: { fill: COR.textoSuave, fontSize: 11, textAnchor: 'middle' },
              }}
            />
            <ZAxis type="number" dataKey="z" range={[130, 130]} />

            <ReferenceLine
              x={fragilidadeMax}
              stroke={corDaFaixa('FRAGILIDADE')}
              strokeDasharray="4 3"
            />
            <ReferenceLine
              y={medianaFragilidade}
              stroke={COR.bordaForte}
              strokeDasharray="4 3"
            />

            <Scatter data={pontos} isAnimationActive={false}>
              {pontos.map((p) => (
                <Cell key={p.shortCode} fill={corDaFaixa(p.faixa)} />
              ))}
              <LabelList
                dataKey="shortCode"
                position="top"
                style={{ fill: COR.texto, fontSize: 10, fontWeight: 600 }}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-rotulo text-texto-suave">
        Cada ponto é uma habilidade. Quanto mais à <strong>esquerda</strong>, menor o
        percentual de acerto; quanto mais <strong>acima</strong>, em mais estudantes a
        dificuldade se concentra. A área destacada no alto à esquerda é onde a intervenção
        rende mais: desempenho baixo <em>e</em> dificuldade espalhada por muita gente.
      </p>
    </div>
  )
}

function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  if (ordenados.length % 2 === 1) return ordenados[meio] ?? 0
  return ((ordenados[meio - 1] ?? 0) + (ordenados[meio] ?? 0)) / 2
}
