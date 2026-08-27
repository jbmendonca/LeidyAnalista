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
import { formatarNumero } from '@/lib/format'
import { COR, COR_NIVEL, ROTULO_NIVEL } from './paleta'

export type BarraTurma = {
  classId: string
  nome: string
  total: number
  avaliados: number
  naoAvaliados: number
  acertos: number | null
  itens: number | null
  /** Já dividido. `null` quando a turma não tem nenhum avaliado. */
  percentual: number | null
  percentualFormatado: string
  adequado: number
  intermediario: number
  defasagem: number
  semNivel: number
}

const ALTURA_POR_BARRA = 32
const ALTURA_EIXO = 34

/**
 * Desempenho por turma, com a média do recorte como régua.
 *
 * A régua é o que transforma quatro números soltos numa comparação: sem ela, é
 * preciso fazer a conta de cabeça para saber quais turmas puxam o resultado
 * para baixo.
 *
 * Turma sem nenhum avaliado não vira barra de tamanho zero — ela sai do gráfico
 * e é listada à parte. Uma barra vazia seria lida como pior desempenho, quando
 * o que existe ali é ausência de dado (Const. I).
 */
export function GraficoDesempenhoTurmas({
  turmas,
  mediaGeral,
  mediaGeralFormatada,
  className,
}: {
  turmas: readonly BarraTurma[]
  mediaGeral: number | null
  mediaGeralFormatada: string
  className?: string | undefined
}) {
  const comDado = turmas.filter(
    (t): t is BarraTurma & { percentual: number } => t.percentual !== null,
  )
  const semDado = turmas.filter((t) => t.percentual === null)

  if (comDado.length === 0) {
    return (
      <p className={cn('text-sm text-texto-suave', className)}>
        Nenhuma turma com estudante avaliado neste recorte.
      </p>
    )
  }

  const dados = [...comDado]
    .sort((a, b) => a.percentual - b.percentual)
    .map((t) => ({
      nome: t.nome,
      valor: t.percentual,
      rotulo: t.percentualFormatado,
      abaixoDaMedia: mediaGeral !== null && t.percentual < mediaGeral,
    }))

  const altura = dados.length * ALTURA_POR_BARRA + ALTURA_EIXO

  return (
    <div className={cn('space-y-3', className)}>
      <div style={{ height: altura }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
            barCategoryGap={8}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: COR.textoSuave, fontSize: 11 }}
              axisLine={{ stroke: COR.borda }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="nome"
              width={96}
              tick={{ fill: COR.texto, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />

            {mediaGeral !== null && (
              <ReferenceLine
                x={mediaGeral}
                stroke={COR.texto}
                strokeDasharray="5 3"
                strokeWidth={1.5}
              />
            )}

            <Bar dataKey="valor" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {dados.map((d) => (
                <Cell
                  key={d.nome}
                  // Abaixo da média fica em tom pleno; acima, em tom claro com
                  // contorno. A distinção não é só de cor: a barra abaixo da
                  // média também é a que fica antes da régua.
                  fill={d.abaixoDaMedia ? COR.primaria : COR.primariaTenue}
                  stroke={COR.primaria}
                  strokeWidth={d.abaixoDaMedia ? 0 : 1}
                />
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

      <p className="text-rotulo text-texto-suave">
        A linha tracejada marca o desempenho geral do recorte ({mediaGeralFormatada}). As
        turmas em tom pleno estão abaixo dele.
      </p>

      {semDado.length > 0 && (
        <p className="text-rotulo text-texto-suave">
          Sem estudante avaliado, fora do gráfico:{' '}
          {semDado.map((t) => t.nome).join(', ')}.
        </p>
      )}
    </div>
  )
}

/**
 * Composição de cada turma por nível de aprendizagem da fonte.
 *
 * Responde à pergunta que o percentual médio não responde: uma turma com 80%
 * pode ter todos próximos de 80 ou metade em Defasagem e metade em Adequado —
 * e a ação pedagógica é completamente diferente nos dois casos.
 *
 * O não avaliado aparece como faixa hachurada própria: ele existe na turma,
 * mas não é um nível de aprendizagem (Const. III).
 */
export function GraficoComposicaoTurmas({
  turmas,
  className,
}: {
  turmas: readonly BarraTurma[]
  className?: string | undefined
}) {
  if (turmas.length === 0) {
    return (
      <p className={cn('text-sm text-texto-suave', className)}>Nenhuma turma no recorte.</p>
    )
  }

  const ordenadas = [...turmas].sort((a, b) => {
    const criticoA = (a.defasagem + a.intermediario) / Math.max(a.avaliados, 1)
    const criticoB = (b.defasagem + b.intermediario) / Math.max(b.avaliados, 1)
    return criticoB - criticoA
  })

  return (
    <div className={cn('space-y-3', className)}>
      <ul className="space-y-2.5">
        {ordenadas.map((t) => (
          <li key={t.classId} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium text-texto">{t.nome}</span>
              <span className="text-rotulo tabular-nums text-texto-suave">
                {formatarNumero(t.total)} estudantes · {t.percentualFormatado}
              </span>
            </div>

            <div
              className="flex h-6 w-full overflow-hidden rounded border border-borda-forte"
              aria-hidden="true"
            >
              <Segmento
                quantidade={t.defasagem}
                total={t.total}
                cor={COR_NIVEL.DEFASAGEM}
                claro
              />
              <Segmento
                quantidade={t.intermediario}
                total={t.total}
                cor={COR_NIVEL.INTERMEDIARIO}
                claro
              />
              <Segmento
                quantidade={t.adequado}
                total={t.total}
                cor={COR_NIVEL.ADEQUADO}
                claro
              />
              <Segmento quantidade={t.semNivel} total={t.total} cor={COR_NIVEL.SEM_NIVEL} claro />
              {t.naoAvaliados > 0 && (
                <div
                  className="flex items-center justify-center text-rotulo font-semibold text-texto"
                  style={{
                    width: `${(t.naoAvaliados / t.total) * 100}%`,
                    backgroundImage: `repeating-linear-gradient(45deg, ${COR.ausente} 0 4px, ${COR.superficie} 4px 8px)`,
                  }}
                >
                  {t.naoAvaliados / t.total >= 0.1 ? t.naoAvaliados : null}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-rotulo font-medium text-texto-suave">
          Nível de aprendizagem da fonte:
        </span>
        {(['DEFASAGEM', 'INTERMEDIARIO', 'ADEQUADO'] as const).map((n) => (
          <span key={n} className="flex items-center gap-1.5 text-rotulo text-texto">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: COR_NIVEL[n] }}
            />
            {ROTULO_NIVEL[n]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-rotulo text-texto">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[2px] border border-borda-forte"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, ${COR.ausente} 0 3px, ${COR.superficie} 3px 6px)`,
            }}
          />
          Não avaliado
        </span>
      </div>

      <p className="text-rotulo text-texto-suave">
        Ordenadas pela maior concentração de Defasagem e Intermediário entre os avaliados.
      </p>
    </div>
  )
}

function Segmento({
  quantidade,
  total,
  cor,
  claro,
}: {
  quantidade: number
  total: number
  cor: string
  claro?: boolean
}) {
  if (quantidade <= 0) return null
  const largura = (quantidade / total) * 100
  return (
    <div
      className={cn(
        'flex items-center justify-center text-rotulo font-semibold',
        claro ? 'text-white' : 'text-texto',
      )}
      style={{ width: `${largura}%`, backgroundColor: cor }}
    >
      {largura >= 8 ? quantidade : null}
    </div>
  )
}
