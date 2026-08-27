import * as React from 'react'

import { cn } from '@/lib/utils'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { LegendaFaixaAnalitica, FaixaBadge } from '@/components/ui/faixa-badge'
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
import type { LinhaHabilidade } from '@/modules/analytics/application/assessment-dashboard'

/**
 * Ranking completo de habilidades — FR-070 a FR-072.
 *
 * **O critério de ordenação fica visível o tempo todo.** Um ranking sem a regra escrita ao
 * lado convida à leitura de que a primeira linha é "a pior habilidade", quando ela é apenas a
 * primeira sob aquele critério — e os quatro critérios produzem primeiras linhas diferentes
 * para os mesmos dados. Por isso o critério ativo aparece em etiqueta, por extenso, com a
 * explicação da regra logo abaixo, além de vir pré-selecionado no controle.
 *
 * O seletor é um `<form method="get">` nativo: funciona sem JavaScript, o estado vive na
 * barra de endereços e o resultado é compartilhável por link — três propriedades que um menu
 * construído em JavaScript perderia de uma vez.
 *
 * Ausência de resultado desce ao fim da lista e aparece como travessão. Uma habilidade sem
 * item respondido não é a habilidade mais frágil: ela é a habilidade sem dado (Const. I).
 */

export type OpcaoCriterioRanking = {
  valor: string
  rotulo: string
  explicacao: string
}

export type PropsRankingHabilidades = {
  habilidades: readonly LinhaHabilidade[]
  /** Valor ativo, entre os de `criterios`. */
  criterio: string
  criterios: readonly OpcaoCriterioRanking[]
  /** Nome do parâmetro de consulta que carrega o critério. */
  nomeParametro?: string
  /** Parâmetros da URL que o formulário precisa preservar ao reordenar. */
  parametrosPreservados?: readonly { nome: string; valor: string }[]
  /** Limites da configuração vigente, exibidos junto à legenda das faixas. */
  fragilidadeMaxTexto: string
  atencaoMaxTexto: string
  titulo?: string
  className?: string
}

export function RankingHabilidades({
  habilidades,
  criterio,
  criterios,
  nomeParametro = 'ordenar',
  parametrosPreservados = [],
  fragilidadeMaxTexto,
  atencaoMaxTexto,
  titulo = 'Ranking de habilidades',
  className,
}: PropsRankingHabilidades) {
  const ativo = criterios.find((c) => c.valor === criterio) ?? criterios[0]
  const idExplicacao = 'explicacao-criterio-ranking'
  const comResultado = habilidades.filter((h) => h.percentual !== null).length

  return (
    <section className={cn('space-y-3', className)} aria-labelledby="titulo-ranking-habilidades">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="titulo-ranking-habilidades" className="text-lg font-semibold text-texto">
            {titulo}
          </h2>
          <p className="text-sm text-texto-suave">
            {formatarNumero(habilidades.length)} habilidades da avaliação,{' '}
            {formatarNumero(comResultado)} com resultado no recorte. Percentual ={' '}
            <span className="whitespace-nowrap">Σ acertos ÷ Σ itens</span> entre os avaliados.
          </p>
        </div>

        <form method="get" className="flex flex-wrap items-end gap-2 nao-imprimir">
          {parametrosPreservados.map((p) => (
            <input key={p.nome} type="hidden" name={p.nome} value={p.valor} />
          ))}

          <div className="space-y-1">
            <label
              htmlFor="criterio-ranking"
              className="block text-rotulo font-medium text-texto"
            >
              Ordenar por
            </label>
            <Select
              id="criterio-ranking"
              name={nomeParametro}
              defaultValue={criterio}
              descritoPor={idExplicacao}
              className="min-w-[16rem]"
            >
              {criterios.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </Select>
          </div>

          <Button type="submit" variante="secundario">
            Aplicar
          </Button>
        </form>
      </div>

      {/* O critério ativo, escrito — não só pré-selecionado no controle. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variante="informativo">Ordenado por: {ativo?.rotulo ?? criterio}</Badge>
        <p id={idExplicacao} className="text-rotulo text-texto-suave">
          {ativo?.explicacao ?? ''} Empates são desfeitos pela maior quantidade de itens e,
          em seguida, pelo código da habilidade.
        </p>
      </div>

      {habilidades.length === 0 ? (
        <EmptyState
          titulo="Nenhuma habilidade para o recorte selecionado"
          orientacao="Nenhum resultado foi importado para esta avaliação dentro do seu escopo. Importe um arquivo de resultados para que o ranking possa ser apurado."
        />
      ) : (
        <>
          <TableContainer rotulo="Ranking de habilidades por fragilidade">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead numerica>#</TableHead>
                  <TableHead>Habilidade</TableHead>
                  <TableHead numerica>Acertos</TableHead>
                  <TableHead numerica>Itens possíveis</TableHead>
                  <TableHead
                    numerica
                    {...(criterio === 'LOWEST_PERCENT'
                      ? ({ ordenacao: 'crescente' } as const)
                      : {})}
                  >
                    Percentual
                  </TableHead>
                  <TableHead>Faixa analítica</TableHead>
                  <TableHead numerica>Estudantes em fragilidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {habilidades.map((h) => (
                  <TableRow key={h.skillId}>
                    <TableCell numerica>{h.posicao}</TableCell>
                    <TableRowHeader>
                      <span className="font-semibold">{h.shortCode}</span>
                      {h.referenceCode ? (
                        <span className="ml-2 text-rotulo text-texto-suave">
                          {h.referenceCode}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block max-w-prose text-rotulo font-normal text-texto-suave">
                        {h.descricao}
                      </span>
                    </TableRowHeader>
                    <TableCell numerica>
                      {h.acertos === null ? (
                        <span className="ausente" aria-hidden="true">
                          {AUSENTE}
                        </span>
                      ) : (
                        formatarNumero(h.acertos)
                      )}
                    </TableCell>
                    <TableCell numerica>
                      {h.itens === null ? (
                        <span className="ausente" aria-hidden="true">
                          {AUSENTE}
                        </span>
                      ) : (
                        formatarNumero(h.itens)
                      )}
                    </TableCell>
                    <TableCell numerica className="font-semibold">
                      {h.percentual === null ? (
                        <>
                          <span className="ausente" aria-hidden="true">
                            {AUSENTE}
                          </span>
                          <span className="apenas-leitor-de-tela">
                            Sem dados de desempenho
                          </span>
                        </>
                      ) : (
                        h.percentualFormatado
                      )}
                    </TableCell>
                    <TableCell>
                      <FaixaBadge faixa={h.faixa} />
                    </TableCell>
                    <TableCell numerica>
                      {h.estudantesComResultado > 0 ? (
                        <>
                          {formatarNumero(h.estudantesEmFragilidade)} de{' '}
                          {formatarNumero(h.estudantesComResultado)}
                          <span className="block text-rotulo font-normal text-texto-suave">
                            {h.fragilidadeFormatada}
                          </span>
                        </>
                      ) : (
                        <span className="ausente" aria-hidden="true">
                          {AUSENTE}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <LegendaFaixaAnalitica />
          <p className="text-rotulo text-texto-suave">
            Limites vigentes: Fragilidade abaixo de {fragilidadeMaxTexto}%, Atenção de{' '}
            {fragilidadeMaxTexto}% a menos de {atencaoMaxTexto}%, Satisfatório a partir de{' '}
            {atencaoMaxTexto}%. Configuráveis pela rede — não são constantes do sistema.
          </p>
        </>
      )}
    </section>
  )
}
