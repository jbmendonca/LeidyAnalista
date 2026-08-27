'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@/lib/utils'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from '@/components/ui/table'
import { NivelBadge, type NivelAprendizagem } from '@/components/ui/nivel-badge'

/**
 * Distribuição por nível de aprendizagem — FR-069, FR-073.
 *
 * Três decisões governam este componente:
 *
 * 1. **O denominador é o total de avaliados**, nunca o total importado (FR-062). O número
 *    aparece escrito na legenda e repetido no rodapé da tabela, porque a diferença entre
 *    "3 de 106 avaliados" e "3 de 111 importados" muda a conversa de uma reunião pedagógica.
 *
 * 2. **O gráfico não carrega informação sozinho.** Ele é `aria-hidden` e acompanhado de uma
 *    tabela com os mesmos números — quantidade e percentual. Quem não distingue as cores, quem
 *    usa leitor de tela e quem imprime em preto e branco leem exatamente o mesmo conteúdo
 *    (WCAG 1.4.1).
 *
 * 3. **"Abaixo do adequado" é regra do sistema, não da fonte.** Aparece separada do quadro
 *    principal, rotulada como agrupamento analítico e com a composição escrita por extenso.
 *    Sem esse rótulo, o número seria lido como se a planilha original tivesse essa categoria.
 */

export type ChaveNivelGrafico = 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | 'SEM_NIVEL'

export type LinhaDistribuicaoNivel = {
  chave: ChaveNivelGrafico
  rotulo: string
  quantidade: number
  /** Já formatado por `formatPercent` na camada de aplicação. */
  percentualFormatado: string
}

/**
 * Espelha as variáveis `--cor-nivel-*` de `globals.css`.
 *
 * A duplicação é deliberada e mínima: `var()` não é substituído em atributo de apresentação
 * SVG, que é como o Recharts pinta as barras. Qualquer ajuste na paleta precisa passar pelos
 * dois lugares — por isso os nomes das chaves são os mesmos das variáveis.
 */
const CORES: Record<ChaveNivelGrafico, { barra: string; borda: string }> = {
  ADEQUADO: { barra: 'rgb(209 231 221)', borda: 'rgb(25 135 84)' },
  INTERMEDIARIO: { barra: 'rgb(255 243 205)', borda: 'rgb(138 101 0)' },
  DEFASAGEM: { barra: 'rgb(248 215 218)', borda: 'rgb(176 42 55)' },
  SEM_NIVEL: { barra: 'rgb(237 238 241)', borda: 'rgb(118 124 135)' },
}

export type PropsDistribuicaoNivel = {
  linhas: readonly LinhaDistribuicaoNivel[]
  /** Denominador da distribuição. */
  totalAvaliados: number
  /** Universo importado, exibido para contraste com o denominador. */
  totalImportado: number
  naoAvaliados: number
  abaixoDoAdequado: {
    /** Visão opcional: só aparece quando pedida ou habilitada na configuração. */
    mostrar: boolean
    habilitadoNaConfiguracao: boolean
    componentes: readonly string[]
    quantidade: number
    percentualFormatado: string
    /** Endereço que liga/desliga a visão. `null` esconde o controle. */
    hrefAlternar: string | null
  }
  className?: string
}

export function DistribuicaoNivel({
  linhas,
  totalAvaliados,
  totalImportado,
  naoAvaliados,
  abaixoDoAdequado,
  className,
}: PropsDistribuicaoNivel) {
  const semAvaliados = totalAvaliados <= 0

  const dados = linhas.map((linha) => ({
    chave: linha.chave,
    rotulo: linha.rotulo,
    quantidade: linha.quantidade,
    percentualFormatado: linha.percentualFormatado,
  }))

  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardHeader>
        <CardTitle as="h2">Distribuição por nível de aprendizagem</CardTitle>
        <CardDescription>
          Percentuais sobre{' '}
          <strong className="font-medium text-texto">
            {formatarNumero(totalAvaliados)} estudantes avaliados
          </strong>
          , e não sobre os {formatarNumero(totalImportado)} importados. Os{' '}
          {formatarNumero(naoAvaliados)} não avaliados ficam fora deste quadro: não têm
          nível e não são Defasagem.
        </CardDescription>
        <p className="text-rotulo text-texto-suave">
          Nível informado na fonte — o sistema apenas transcreve, não classifica.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {semAvaliados ? (
          <p className="rounded border border-dashed border-borda-forte bg-superficie-tenue px-3 py-6 text-center text-sm text-texto-suave">
            <span className="ausente" aria-hidden="true">
              {AUSENTE}
            </span>{' '}
            Nenhum estudante avaliado neste recorte: não há distribuição a calcular.
          </p>
        ) : (
          <>
            {/* O gráfico é redundante em relação à tabela abaixo, de propósito. */}
            <div className="h-56 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dados}
                  layout="vertical"
                  margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
                  barCategoryGap="22%"
                >
                  <XAxis type="number" hide domain={[0, totalAvaliados]} />
                  <YAxis
                    type="category"
                    dataKey="rotulo"
                    width={112}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: 'rgb(84 91 102)' }}
                  />
                  <Bar
                    dataKey="quantidade"
                    isAnimationActive={false}
                    radius={[0, 3, 3, 0]}
                  >
                    {dados.map((d) => (
                      <Cell
                        key={d.chave}
                        fill={CORES[d.chave].barra}
                        stroke={CORES[d.chave].borda}
                        strokeWidth={1}
                      />
                    ))}
                    <LabelList
                      dataKey="quantidade"
                      position="right"
                      className="fill-texto"
                      style={{ fontSize: 12, fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <TableContainer rotulo="Distribuição por nível de aprendizagem">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nível</TableHead>
                    <TableHead numerica>Estudantes</TableHead>
                    <TableHead numerica>% dos avaliados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((linha) => (
                    <TableRow key={linha.chave}>
                      <TableRowHeader>
                        {linha.chave === 'SEM_NIVEL' ? (
                          <span className="text-texto-suave">{linha.rotulo}</span>
                        ) : (
                          <NivelBadge
                            nivel={linha.chave as NivelAprendizagem}
                            avaliado={true}
                          />
                        )}
                      </TableRowHeader>
                      <TableCell numerica>{formatarNumero(linha.quantidade)}</TableCell>
                      <TableCell numerica>{linha.percentualFormatado}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableRowHeader>Total de avaliados</TableRowHeader>
                    <TableCell numerica>{formatarNumero(totalAvaliados)}</TableCell>
                    <TableCell numerica>denominador</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
          </>
        )}

        <div className="space-y-2 rounded border border-dashed border-borda-forte bg-superficie-tenue p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variante="destaque">Regra analítica do sistema</Badge>
            <span className="text-rotulo text-texto-suave">não é categoria da fonte</span>
          </div>

          <p className="text-sm text-texto">
            <strong className="font-semibold">Abaixo do adequado</strong> ={' '}
            {abaixoDoAdequado.componentes.join(' + ')}.{' '}
            {abaixoDoAdequado.habilitadoNaConfiguracao
              ? 'Habilitada na configuração analítica vigente.'
              : 'Visão opcional, desligada na configuração analítica vigente.'}
          </p>

          {abaixoDoAdequado.mostrar ? (
            semAvaliados ? (
              <p className="text-sm text-texto-suave">
                <span className="ausente" aria-hidden="true">
                  {AUSENTE}
                </span>{' '}
                sem estudantes avaliados para agrupar.
              </p>
            ) : (
              <p className="text-sm text-texto">
                <span className="text-lg font-semibold tabular-nums">
                  {abaixoDoAdequado.percentualFormatado}
                </span>{' '}
                — {formatarNumero(abaixoDoAdequado.quantidade)} de{' '}
                {formatarNumero(totalAvaliados)} estudantes avaliados.
              </p>
            )
          ) : null}

          {abaixoDoAdequado.hrefAlternar ? (
            <Link
              href={abaixoDoAdequado.hrefAlternar}
              className="inline-block text-rotulo text-primaria underline underline-offset-4"
            >
              {abaixoDoAdequado.mostrar
                ? 'Ocultar a visão “Abaixo do adequado”'
                : 'Mostrar a visão “Abaixo do adequado”'}
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
