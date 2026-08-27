import * as React from 'react'

import { cn } from '@/lib/utils'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
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
import type { LinhaTurma } from '@/modules/analytics/application/assessment-dashboard'

/**
 * Ranking de turmas, em duas leituras que o painel exibe lado a lado:
 *
 * - **menor desempenho geral** — `Σ acertos ÷ Σ itens` entre os avaliados da turma;
 * - **maior percentual em Defasagem** — sobre os avaliados da turma, nunca sobre o total
 *   importado.
 *
 * As duas colunas convivem na mesma tabela de propósito. Uma turma pode liderar a primeira
 * lista sem liderar a segunda, e ver os dois números juntos evita a conclusão apressada de
 * que "a turma com pior média é a turma com mais crianças em Defasagem".
 *
 * A coluna de não avaliados fica visível em todas as linhas: uma turma com muitos ausentes
 * tem desempenho apurado sobre poucas crianças, e sem esse número o percentual parece mais
 * sólido do que é.
 */

export type DestaqueRankingTurma = 'DESEMPENHO' | 'DEFASAGEM'

export type PropsRankingTurmas = {
  turmas: readonly LinhaTurma[]
  /** Qual coluna a ordenação recebida privilegia — anunciada por `aria-sort`. */
  destaque: DestaqueRankingTurma
  titulo: string
  descricao: React.ReactNode
  /** Exibe apenas as primeiras N turmas. Sem valor, exibe todas. */
  limite?: number
  /** Mostra a coluna de escola — útil no painel da rede, redundante no da escola. */
  mostrarEscola?: boolean
  className?: string
}

export function RankingTurmas({
  turmas,
  destaque,
  titulo,
  descricao,
  limite,
  mostrarEscola = false,
  className,
}: PropsRankingTurmas) {
  const exibidas = typeof limite === 'number' ? turmas.slice(0, limite) : turmas
  const ocultas = turmas.length - exibidas.length

  return (
    <section className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
        <p className="text-sm text-texto-suave">{descricao}</p>
      </div>

      {exibidas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma turma com resultado no recorte"
          orientacao="Não há resultados importados para turmas dentro do seu escopo nesta avaliação."
        />
      ) : (
        <>
          <TableContainer rotulo={titulo}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead numerica>#</TableHead>
                  <TableHead>Turma</TableHead>
                  {mostrarEscola ? <TableHead>Escola</TableHead> : null}
                  <TableHead numerica>Importados</TableHead>
                  <TableHead numerica>Avaliados</TableHead>
                  <TableHead numerica>Não avaliados</TableHead>
                  <TableHead numerica>Acertos / itens</TableHead>
                  <TableHead
                    numerica
                    {...(destaque === 'DESEMPENHO'
                      ? ({ ordenacao: 'crescente' } as const)
                      : {})}
                  >
                    Desempenho
                  </TableHead>
                  <TableHead
                    numerica
                    {...(destaque === 'DEFASAGEM'
                      ? ({ ordenacao: 'decrescente' } as const)
                      : {})}
                  >
                    Em Defasagem
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exibidas.map((turma, indice) => (
                  <TableRow key={turma.classId}>
                    <TableCell numerica>{indice + 1}</TableCell>
                    <TableRowHeader>
                      <span className="font-semibold">{turma.nome}</span>
                      <span className="mt-0.5 block text-rotulo font-normal text-texto-suave">
                        {turma.externalCode} · {turma.anoEscolar}
                      </span>
                    </TableRowHeader>
                    {mostrarEscola ? <TableCell>{turma.escolaNome}</TableCell> : null}
                    <TableCell numerica>{formatarNumero(turma.total)}</TableCell>
                    <TableCell numerica>{formatarNumero(turma.avaliados)}</TableCell>
                    <TableCell numerica>
                      {turma.naoAvaliados > 0 ? (
                        formatarNumero(turma.naoAvaliados)
                      ) : (
                        <span className="text-texto-suave">0</span>
                      )}
                    </TableCell>
                    <TableCell numerica>
                      {turma.desempenho.numerador === null ||
                      turma.desempenho.denominador === null ? (
                        <span className="ausente" aria-hidden="true">
                          {AUSENTE}
                        </span>
                      ) : (
                        `${formatarNumero(turma.desempenho.numerador)} / ${formatarNumero(
                          turma.desempenho.denominador,
                        )}`
                      )}
                    </TableCell>
                    <TableCell numerica className="font-semibold">
                      {turma.desempenho.percentual === null ? (
                        <>
                          <span className="ausente" aria-hidden="true">
                            {AUSENTE}
                          </span>
                          <span className="apenas-leitor-de-tela">
                            Sem dados de desempenho
                          </span>
                        </>
                      ) : (
                        turma.desempenho.percentualFormatado
                      )}
                    </TableCell>
                    <TableCell numerica>
                      {turma.avaliados > 0 ? (
                        <>
                          <span className="font-semibold">
                            {turma.proporcaoDefasagem.percentualFormatado}
                          </span>
                          <span className="block text-rotulo font-normal text-texto-suave">
                            {formatarNumero(turma.defasagem)} de{' '}
                            {formatarNumero(turma.avaliados)} avaliados
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="ausente" aria-hidden="true">
                            {AUSENTE}
                          </span>
                          <span className="apenas-leitor-de-tela">
                            Nenhum estudante avaliado nesta turma
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {ocultas > 0 ? (
            <p className="text-rotulo text-texto-suave">
              <Badge variante="neutro">Recorte</Badge> Exibindo{' '}
              {formatarNumero(exibidas.length)} de {formatarNumero(turmas.length)} turmas
              com resultado.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
