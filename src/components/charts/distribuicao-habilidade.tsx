import * as React from 'react'

import { cn } from '@/lib/utils'
import { formatarNumero } from '@/lib/format'
import { formatPercent } from '@/lib/decimal'
import { EmptyState } from '@/components/data/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from '@/components/ui/table'
import type { FaixaDaDistribuicao } from '@/modules/analytics/application/skill-detail'

/**
 * Distribuição dos estudantes por resultado possível — FR-085.
 *
 * O gráfico é uma **tabela com barras**, e não um desenho com rótulos por cima. A escolha é
 * deliberada:
 *
 * - a quantidade e o percentual de cada faixa ficam legíveis em texto, de modo que a barra
 *   seja reforço e nunca o único portador de significado (WCAG 1.4.1);
 * - a leitura por leitor de tela sai na ordem certa, com cabeçalho de linha por faixa;
 * - a impressão em preto e branco continua exata.
 *
 * As faixas vão de `0/n` a `n/n` com **n = denominador de referência** apurado dos dados
 * (FR-156). Nenhuma quantidade de itens é constante no código.
 *
 * Faixa sem ocorrência aparece com quantidade `0` — e é correto que apareça: aqui `0` é uma
 * medição ("ninguém acertou exatamente 2 de 3"), não ausência de dado. A ausência, essa sim,
 * está fora da distribuição inteira, porque resultado ausente nunca entra em contagem
 * (Const. I).
 */

export type PropsDistribuicaoHabilidade = {
  distribuicao: readonly FaixaDaDistribuicao[]
  /** Registros que compõem a distribuição — o denominador dos percentuais desta tabela. */
  totalNaDistribuicao: number
  /** Registros de denominador divergente, fora da distribuição (FR-158, FR-159). */
  totalDivergentes: number
  denominadorReferencia: number
  className?: string
}

export function DistribuicaoHabilidade({
  distribuicao,
  totalNaDistribuicao,
  totalDivergentes,
  denominadorReferencia,
  className,
}: PropsDistribuicaoHabilidade) {
  if (totalNaDistribuicao === 0) {
    return (
      <EmptyState
        titulo="Sem distribuição para este recorte"
        orientacao={
          totalDivergentes > 0
            ? `Nenhum registro do recorte usa o denominador de referência (${denominadorReferencia} itens). Os ${formatarNumero(totalDivergentes)} registros encontrados têm denominador divergente e estão listados à parte.`
            : 'Nenhum estudante avaliado tem resultado apurado nesta habilidade dentro do recorte. Amplie os filtros ou confira se a importação incluiu esta habilidade.'
        }
        className={className}
      />
    )
  }

  const maiorQuantidade = distribuicao.reduce(
    (maior, f) => Math.max(maior, f.quantidade),
    0,
  )

  return (
    <div className={cn('space-y-2', className)}>
      <TableContainer rotulo="Distribuição dos estudantes por resultado">
        <Table>
          <caption className="px-3 py-2 text-left text-rotulo text-texto-suave">
            Base: {formatarNumero(totalNaDistribuicao)}{' '}
            {totalNaDistribuicao === 1 ? 'registro avaliado' : 'registros avaliados'} com
            denominador igual ao de referência ({denominadorReferencia}{' '}
            {denominadorReferencia === 1 ? 'item' : 'itens'}).
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Resultado</TableHead>
              <TableHead numerica>Estudantes</TableHead>
              <TableHead numerica>Percentual</TableHead>
              <TableHead className="w-1/2 min-w-40">Proporção</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {distribuicao.map((faixa) => {
              // Largura relativa à maior faixa: a comparação visual é entre as barras, e o
              // valor absoluto está sempre escrito ao lado.
              const largura =
                maiorQuantidade > 0 ? (faixa.quantidade / maiorQuantidade) * 100 : 0

              return (
                <TableRow key={faixa.acertos}>
                  <TableRowHeader className="font-mono tabular-nums">
                    {faixa.acertos} / {faixa.itens}
                  </TableRowHeader>
                  <TableCell numerica>{formatarNumero(faixa.quantidade)}</TableCell>
                  <TableCell numerica>{formatPercent(faixa.proporcao)}</TableCell>
                  <TableCell>
                    <div
                      aria-hidden="true"
                      className="h-3 w-full overflow-hidden rounded-sm bg-superficie-tenue ring-1 ring-inset ring-borda"
                    >
                      <div
                        className={cn(
                          'h-full rounded-sm',
                          faixa.quantidade > 0 ? 'bg-primaria' : 'bg-transparent',
                        )}
                        style={{ width: `${largura}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {totalDivergentes > 0 ? (
        <p className="text-rotulo text-texto-suave">
          {formatarNumero(totalDivergentes)}{' '}
          {totalDivergentes === 1
            ? 'registro ficou fora desta distribuição'
            : 'registros ficaram fora desta distribuição'}{' '}
          por ter denominador diferente do de referência. Eles continuam somando no
          percentual consolidado da habilidade e estão detalhados abaixo.
        </p>
      ) : null}
    </div>
  )
}
