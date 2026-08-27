import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { AppError } from '@/server/http-errors'
import { rotuloVersaoRelatorio } from '@/server/nominal-data'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { formatPercent } from '@/lib/decimal'
import { lerFiltros } from '@/modules/analytics/schemas/filters'
import {
  carregarOpcoesDeFiltro,
  resolverAvaliacaoDoRecorte,
} from '@/modules/analytics/application/filter-options'
import { obterDetalheDaHabilidade } from '@/modules/analytics/application/skill-detail'
import { BarraFiltros } from '@/components/data/barra-filtros'
import { DistribuicaoHabilidade } from '@/components/charts/distribuicao-habilidade'
import { EmptyState } from '@/components/data/empty-state'
import { IndicatorCard } from '@/components/data/indicator-card'
import { ListaDivergentes } from '@/components/data/lista-divergentes'
import { Badge } from '@/components/ui/badge'
import { FaixaBadge, LegendaFaixaAnalitica } from '@/components/ui/faixa-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { variantesBotao } from '@/components/ui/button'
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

export const metadata = { title: 'Habilidade' }

type Busca = Promise<Record<string, string | string[] | undefined>>

/**
 * ===========================================================================
 *  TELA POR HABILIDADE — FR-083 a FR-087
 * ===========================================================================
 *
 * A quantidade de itens exibida é o denominador de referência apurado dos dados
 * (`AssessmentSkill.referenceItems`, FR-156) — nunca um número escrito no código.
 *
 * O percentual consolidado inclui os registros de denominador divergente (FR-157); a
 * distribuição, não (FR-158). A tela declara essa diferença em texto, com a contagem do que
 * ficou de fora e o motivo (FR-159), para que o leitor não precise deduzi-la comparando
 * números entre dois blocos.
 */
export default async function PaginaHabilidade({
  params,
  searchParams,
}: {
  params: Promise<{ skillId: string }>
  searchParams: Busca
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const { skillId } = await params
  const lido = lerFiltros(await searchParams)
  // A habilidade da rota é o recorte fixo desta tela: o filtro correspondente fica visível
  // como ativo, porém não editável — trocá-lo aqui significaria mudar de página.
  const filtros = { ...lido.filtros, habilidade: skillId }

  try {
    const [avaliacao, opcoes] = await Promise.all([
      resolverAvaliacaoDoRecorte(ctx, filtros),
      carregarOpcoesDeFiltro(ctx, filtros),
    ])

    const detalhe =
      avaliacao === null
        ? null
        : await obterDetalheDaHabilidade(ctx, filtros, avaliacao.id, skillId)

    const barra = (
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <BarraFiltros
          filtros={filtros}
          opcoes={opcoes}
          erros={lido.erros}
          chavesFixas={['habilidade']}
        />
      </Suspense>
    )

    if (detalhe === null) {
      return (
        <main className="space-y-6 p-4 sm:p-6">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold text-texto">Habilidade</h1>
          </header>
          {barra}
          <EmptyState
            titulo="Habilidade sem dados nesta avaliação"
            orientacao={
              <>
                Esta habilidade não tem denominador de referência apurado na avaliação
                selecionada — o que só acontece quando nenhum resultado dela foi importado. A
                quantidade de itens nunca é presumida pelo sistema: ela nasce dos dados.
              </>
            }
            acao={
              <Link href="/habilidades" className={variantesBotao({ variante: 'secundario' })}>
                Voltar às habilidades
              </Link>
            }
          />
        </main>
      )
    }

    const { habilidade, denominadorReferencia } = detalhe
    const semRegistros = detalhe.estudantesComResultado === 0

    return (
      <main className="space-y-6 p-4 sm:p-6">
        {/* --- FR-083: identificação da habilidade ------------------------- */}
        <header className="space-y-2">
          <p className="text-rotulo text-texto-suave">
            <Link href="/habilidades" className="underline underline-offset-4">
              Habilidades
            </Link>{' '}
            / {detalhe.avaliacao.nome} ({detalhe.avaliacao.ano})
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-texto">{habilidade.shortCode}</h1>
            <Badge variante="informativo" className="font-mono">
              {habilidade.referenceCode}
            </Badge>
            <FaixaBadge faixa={detalhe.faixa} />
          </div>

          <p className="max-w-prose text-sm text-texto">{habilidade.descricao}</p>

          <p className="text-rotulo text-texto-suave">
            {rotuloVersaoRelatorio(ctx)}
            {detalhe.denominadorPorEmpate
              ? ' · denominador de referência definido por desempate de frequência (adotado o maior)'
              : ''}
          </p>
        </header>

        {barra}

        {semRegistros ? (
          <EmptyState
            titulo="Nenhum resultado nesta habilidade para o recorte"
            orientacao="Nenhum estudante avaliado do recorte tem resultado apurado nesta habilidade. Remova um filtro de cada vez para descobrir qual esvaziou o recorte — os indicadores não são exibidos zerados porque ausência de dado não é desempenho de 0%."
          />
        ) : (
          <>
            {/* --- FR-084: indicadores do recorte -------------------------- */}
            <section aria-label="Indicadores da habilidade no recorte">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <IndicatorCard
                  titulo="Percentual de acerto"
                  valor={formatPercent(detalhe.percentual)}
                  numerador={detalhe.totalAcertos}
                  denominador={detalhe.totalItens}
                  unidade="itens"
                  descricao="Σ acertos ÷ Σ itens de todos os avaliados, inclusive os de denominador divergente."
                  classificacao={<FaixaBadge faixa={detalhe.faixa} />}
                />

                <IndicatorCard
                  titulo="Quantidade de itens"
                  valor={formatarNumero(denominadorReferencia)}
                  numerador={denominadorReferencia}
                  denominador={denominadorReferencia}
                  unidade="itens de referência"
                  descricao="Denominador de referência apurado dos dados importados."
                />

                <IndicatorCard
                  titulo="Estudantes avaliados"
                  valor={formatarNumero(detalhe.estudantesComResultado)}
                  numerador={detalhe.estudantesComResultado}
                  denominador={detalhe.avaliadosNoRecorte}
                  unidade="avaliados no recorte"
                  descricao={
                    detalhe.semResultado > 0
                      ? `${formatarNumero(detalhe.semResultado)} avaliado(s) sem resultado nesta habilidade — ausência, não zero.`
                      : 'Todos os avaliados do recorte têm resultado nesta habilidade.'
                  }
                />

                <IndicatorCard
                  titulo="Total de acertos"
                  valor={formatarNumero(detalhe.totalAcertos)}
                  numerador={detalhe.totalAcertos}
                  denominador={detalhe.totalItens}
                  unidade="itens possíveis"
                  descricao="Somatórios inteiros que originam o percentual."
                />
              </div>
            </section>

            {/* --- FR-085: distribuição ------------------------------------ */}
            <section aria-labelledby="distribuicao-titulo" className="space-y-3">
              <h2 id="distribuicao-titulo" className="text-base font-semibold text-texto">
                Distribuição dos estudantes por resultado
              </h2>
              <DistribuicaoHabilidade
                distribuicao={detalhe.distribuicao}
                totalNaDistribuicao={detalhe.totalNaDistribuicao}
                totalDivergentes={detalhe.totalDivergentes}
                denominadorReferencia={denominadorReferencia}
              />
            </section>

            {/* --- FR-158, FR-159: divergentes ----------------------------- */}
            <ListaDivergentes
              divergentes={detalhe.divergentes}
              denominadorReferencia={denominadorReferencia}
              denominadorPorEmpate={detalhe.denominadorPorEmpate}
            />

            {/* --- FR-086: ranking das turmas ------------------------------ */}
            <section aria-labelledby="turmas-titulo" className="space-y-3">
              <h2 id="turmas-titulo" className="text-base font-semibold text-texto">
                Turmas nesta habilidade
              </h2>
              <TableContainer rotulo="Ranking das turmas na habilidade">
                <Table>
                  <caption className="px-3 py-2 text-left text-rotulo text-texto-suave">
                    Da menor para a maior taxa de acerto. Empate resolvido por maior
                    quantidade de itens e, por fim, pelo nome da turma.
                  </caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Turma</TableHead>
                      <TableHead>Escola</TableHead>
                      <TableHead numerica>Estudantes</TableHead>
                      <TableHead numerica>Acertos / itens</TableHead>
                      <TableHead numerica>Percentual</TableHead>
                      <TableHead>Situação analítica</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalhe.turmas.map((t) => (
                      <TableRow key={t.classId}>
                        <TableRowHeader>
                          {t.turma}
                          <span className="block font-mono text-rotulo font-normal text-texto-suave">
                            {t.codigoTurma}
                          </span>
                        </TableRowHeader>
                        <TableCell>{t.escola}</TableCell>
                        <TableCell numerica>
                          {formatarNumero(t.estudantesComResultado)}
                        </TableCell>
                        <TableCell numerica>
                          {formatarNumero(t.acertos)} / {formatarNumero(t.itens)}
                        </TableCell>
                        <TableCell numerica>{formatPercent(t.percentual)}</TableCell>
                        <TableCell>
                          <FaixaBadge faixa={t.faixa} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </section>

            {/* --- FR-087: maior dificuldade ------------------------------- */}
            <section aria-labelledby="dificuldade-titulo" className="space-y-3">
              <h2 id="dificuldade-titulo" className="text-base font-semibold text-texto">
                Estudantes com maior dificuldade
              </h2>
              {detalhe.nomesVisiveis ? null : (
                <p className="text-rotulo text-texto-suave">
                  Seu perfil não tem a permissão de dados nominais: os estudantes aparecem
                  identificados apenas pelo código único.
                </p>
              )}
              <TableContainer rotulo="Estudantes com maior dificuldade na habilidade">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estudante</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Resultado original</TableHead>
                      <TableHead numerica>Percentual</TableHead>
                      <TableHead>Situação analítica</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalhe.dificuldades.map((e) => (
                      <TableRow key={e.studentId}>
                        <TableRowHeader>{e.nomeOriginal}</TableRowHeader>
                        <TableCell className="font-mono text-rotulo">
                          {e.uniqueCode}
                        </TableCell>
                        <TableCell>
                          {e.turma}{' '}
                          <span className="font-mono text-rotulo text-texto-suave">
                            ({e.codigoTurma})
                          </span>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {e.resultadoOriginal ?? (
                            <>
                              <span className="ausente" aria-hidden="true">
                                {AUSENTE}
                              </span>
                              <span className="apenas-leitor-de-tela">
                                Sem valor de origem
                              </span>
                            </>
                          )}
                          {e.divergente ? (
                            <span className="ml-1.5 text-rotulo font-sans text-texto-suave">
                              (denominador divergente)
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell numerica>{formatPercent(e.percentual)}</TableCell>
                        <TableCell>
                          <FaixaBadge faixa={e.faixa} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </section>

            <LegendaFaixaAnalitica />
          </>
        )}
      </main>
    )
  } catch (erro) {
    if (erro instanceof AppError && erro.codigo === 'NAO_ENCONTRADO') notFound()
    throw erro
  }
}
