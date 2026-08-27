import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { AppError } from '@/server/http-errors'
import { formatarNumero } from '@/lib/format'
import { formatPercent } from '@/lib/decimal'
import { lerFiltros, filtrosParaQuery } from '@/modules/analytics/schemas/filters'
import {
  carregarOpcoesDeFiltro,
  resolverAvaliacaoDoRecorte,
} from '@/modules/analytics/application/filter-options'
import { listarHabilidadesDoRecorte } from '@/modules/analytics/application/skill-detail'
import { BarraFiltros } from '@/components/data/barra-filtros'
import { EmptyState } from '@/components/data/empty-state'
import { FaixaBadge, LegendaFaixaAnalitica } from '@/components/ui/faixa-badge'
import { Skeleton } from '@/components/ui/skeleton'
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

export const metadata = { title: 'Habilidades' }

type Busca = Promise<Record<string, string | string[] | undefined>>

/**
 * Habilidades da avaliação no recorte, da maior fragilidade para a menor (FR-072).
 *
 * A quantidade de itens de cada habilidade é o **denominador de referência** apurado dos
 * dados (FR-156). Nada aqui presume doze habilidades nem vinte e dois itens: a lista é a que
 * a importação produziu, com o `n` que ela produziu.
 *
 * Recorte sem registros mostra estado vazio com orientação — nunca indicadores zerados
 * (FR-099, Const. I).
 */
export default async function PaginaHabilidades({
  searchParams,
}: {
  searchParams: Busca
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const { filtros, erros } = lerFiltros(await searchParams)

  try {
    const [avaliacao, opcoes] = await Promise.all([
      resolverAvaliacaoDoRecorte(ctx, filtros),
      carregarOpcoesDeFiltro(ctx, filtros),
    ])

    const habilidades =
      avaliacao === null
        ? []
        : await listarHabilidadesDoRecorte(ctx, filtros, avaliacao.id)

    const query = filtrosParaQuery(filtros)
    if (avaliacao) query.set('avaliacao', avaliacao.id)
    const sufixo = query.toString()

    return (
      <div className="space-y-6 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-texto">Habilidades</h1>
          <p className="text-sm text-texto-suave">
            {avaliacao
              ? `${avaliacao.nome} (${avaliacao.ano}) — ${avaliacao.componenteCurricular}`
              : 'Nenhuma avaliação com resultados no seu acesso.'}
          </p>
        </header>

        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <BarraFiltros filtros={filtros} opcoes={opcoes} erros={erros} />
        </Suspense>

        {avaliacao === null ? (
          <EmptyState
            titulo="Nenhuma avaliação a analisar"
            orientacao="Não há resultados importados nas escolas do seu acesso. Importe um arquivo de resultados para que as habilidades apareçam aqui."
          />
        ) : habilidades.length === 0 ? (
          <EmptyState
            titulo="Nenhuma habilidade para este recorte"
            orientacao="Os filtros aplicados não alcançam nenhum registro avaliado. Remova um filtro de cada vez na barra acima para descobrir qual esvaziou o recorte."
          />
        ) : (
          <>
            <TableContainer rotulo="Habilidades da avaliação no recorte">
              <Table>
                <caption className="px-3 py-2 text-left text-rotulo text-texto-suave">
                  Ordenadas da maior fragilidade para a menor. O percentual é Σ acertos ÷
                  Σ itens dos estudantes avaliados — nunca a média dos percentuais.
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Habilidade</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead numerica>Itens</TableHead>
                    <TableHead numerica>Estudantes</TableHead>
                    <TableHead numerica>Acertos / itens</TableHead>
                    <TableHead numerica>Percentual</TableHead>
                    <TableHead>Situação analítica</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {habilidades.map((h) => (
                    <TableRow key={h.id}>
                      <TableRowHeader>
                        <Link
                          href={
                            sufixo.length > 0
                              ? `/habilidades/${h.id}?${sufixo}`
                              : `/habilidades/${h.id}`
                          }
                          className="text-primaria underline underline-offset-4 hover:text-primaria-forte"
                        >
                          {h.shortCode}
                        </Link>
                        <span className="block font-mono text-rotulo font-normal text-texto-suave">
                          {h.referenceCode}
                        </span>
                      </TableRowHeader>
                      <TableCell className="max-w-prose">{h.descricao}</TableCell>
                      <TableCell numerica>
                        {formatarNumero(h.denominadorReferencia)}
                      </TableCell>
                      <TableCell numerica>
                        {formatarNumero(h.estudantesComResultado)}
                      </TableCell>
                      <TableCell numerica>
                        {h.itens > 0
                          ? `${formatarNumero(h.acertos)} / ${formatarNumero(h.itens)}`
                          : '—'}
                      </TableCell>
                      <TableCell numerica>{formatPercent(h.percentual)}</TableCell>
                      <TableCell>
                        <FaixaBadge faixa={h.faixa} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <LegendaFaixaAnalitica />
          </>
        )}
      </div>
    )
  } catch (erro) {
    // Escola fora do escopo responde 404, jamais 403: o 403 confirmaria a existência da
    // escola a quem não pode vê-la (FR-006).
    if (erro instanceof AppError && erro.codigo === 'NAO_ENCONTRADO') notFound()
    throw erro
  }
}
