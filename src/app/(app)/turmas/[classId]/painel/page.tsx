import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { obterDashboardDaTurma } from '@/modules/analytics/application/class-dashboard'
import { formatarNumero } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FaixaBadge } from '@/components/ui/faixa-badge'
import { EmptyState } from '@/components/data/empty-state'
import { IndicatorCard } from '@/components/data/indicator-card'
import { TabelaEstudantes } from '@/components/data/tabela-estudantes'
import { TabelaHabilidadesTurma } from '@/components/data/tabela-habilidades-turma'
import { MapaCalor } from '@/components/data/mapa-calor'

export const metadata = { title: 'Painel da turma' }

/**
 * Dashboard da turma — FR-077 a FR-082.
 *
 * O `classId` da rota e o `?avaliacao=` são **filtro de exibição, nunca autorização**:
 * `obterDashboardDaTurma` valida a turma contra o escopo do requisitante antes de agregar
 * qualquer coisa, e turma de outra rede produz 404 — não uma tela vazia, que confirmaria a
 * existência da turma a quem não pode vê-la.
 *
 * Nada nesta página calcula: todo percentual chega formatado da camada de aplicação, onde a
 * divisão acontece uma única vez com `Decimal`. O componente que arredondasse por conta
 * própria criaria uma segunda verdade para o mesmo número.
 */
export default async function PaginaPainelDaTurma({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ avaliacao?: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const { classId } = await params
  const { avaliacao: avaliacaoSelecionada } = await searchParams

  const { turma, conteudo } = await obterDashboardDaTurma(
    ctx,
    classId,
    avaliacaoSelecionada ?? null,
  )

  const cabecalho = (
    <header className="space-y-1">
      <Link href="/turmas" className="text-rotulo text-primaria underline underline-offset-4">
        Voltar para turmas
      </Link>
      <h1 className="text-xl font-semibold text-texto">
        {turma.turmaNome}{' '}
        <span className="font-normal text-texto-suave">
          · turma {turma.codigoTurma}
        </span>
      </h1>
      <p className="text-sm text-texto-suave">
        {turma.escolaNome} ({turma.escolaCodigo}) — {turma.municipio}/{turma.estado} ·{' '}
        {turma.anoEscolar}
        {conteudo ? ` · ${conteudo.avaliacao.componenteCurricular}` : ''}
      </p>
      {conteudo ? (
        <p className="text-rotulo text-texto-suave">
          {conteudo.avaliacao.nome} · {conteudo.avaliacao.ciclo} · {conteudo.avaliacao.ano} ·{' '}
          {conteudo.versaoRelatorio}
        </p>
      ) : null}
    </header>
  )

  if (!conteudo) {
    return (
      <main className="space-y-6 p-4 sm:p-6">
        {cabecalho}
        <EmptyState
          titulo="Esta turma ainda não tem resultados importados"
          orientacao="Nenhuma avaliação com resultados foi encontrada para esta turma. Nenhum indicador é exibido enquanto não houver importação confirmada — ausência de dado não é desempenho zero nem participação zero."
        />
      </main>
    )
  }

  const { participacao, desempenho, distribuicao, faixas } = conteudo

  return (
    <main className="space-y-8 p-4 sm:p-6">
      {cabecalho}

      {/* FR-078 — participação e desempenho, cada número com sua procedência ao lado. */}
      <section className="space-y-3" aria-labelledby="titulo-indicadores">
        <h2 id="titulo-indicadores" className="text-lg font-semibold text-texto">
          Indicadores da turma
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <IndicatorCard
            titulo="Estudantes"
            valor={formatarNumero(participacao.total)}
            numerador={participacao.avaliados}
            denominador={participacao.total}
            unidade="avaliados"
            descricao={`${formatarNumero(participacao.naoAvaliados)} não avaliados, fora de todo cálculo de desempenho.`}
          />

          <IndicatorCard
            titulo="Taxa de participação"
            valor={participacao.taxaTexto}
            numerador={participacao.avaliados}
            denominador={participacao.total}
            unidade="estudantes"
            notaAusencia="nenhum registro importado para esta turma"
            descricao="Única métrica cujo denominador inclui os não avaliados."
          />

          <IndicatorCard
            titulo="Percentual geral"
            valor={desempenho.percentualTexto}
            numerador={desempenho.acertos}
            denominador={desempenho.itens}
            unidade="itens"
            notaAusencia="nenhum item possível entre os avaliados"
            classificacao={<FaixaBadge faixa={desempenho.faixa} />}
            descricao="Σ acertos ÷ Σ itens entre os avaliados — nunca a média dos percentuais."
          />

          <Card className="flex h-full flex-col gap-1 p-4">
            <p className="text-rotulo font-medium uppercase tracking-wide text-texto-suave">
              Distribuição por nível
            </p>
            <p className="text-rotulo text-texto-suave">
              Nível de aprendizagem informado na fonte, entre os{' '}
              {formatarNumero(distribuicao.totalAvaliados)} avaliados.
            </p>
            <dl className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt>Defasagem</dt>
                <dd className="tabular-nums font-medium">
                  {formatarNumero(distribuicao.defasagem)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Intermediário</dt>
                <dd className="tabular-nums font-medium">
                  {formatarNumero(distribuicao.intermediario)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Adequado</dt>
                <dd className="tabular-nums font-medium">
                  {formatarNumero(distribuicao.adequado)}
                </dd>
              </div>
              {distribuicao.semNivel > 0 ? (
                <div className="flex justify-between gap-2 text-texto-suave">
                  <dt>Sem nível na fonte</dt>
                  <dd className="tabular-nums font-medium">
                    {formatarNumero(distribuicao.semNivel)}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="pt-1 text-rotulo text-texto-suave">
              Os {formatarNumero(participacao.naoAvaliados)} não avaliados não entram aqui:
              não avaliado não é Defasagem.
            </p>
          </Card>
        </div>
      </section>

      {/* FR-079 — os dois extremos do ranking, sempre com a fração ao lado. */}
      <section className="grid gap-3 md:grid-cols-2" aria-labelledby="titulo-extremos">
        <h2 id="titulo-extremos" className="sr-only apenas-leitor-de-tela md:col-span-2">
          Habilidades extremas da turma
        </h2>

        <Card>
          <CardHeader>
            <CardTitle as="h3">Habilidade mais frágil</CardTitle>
          </CardHeader>
          <CardContent>
            {conteudo.habilidadeMaisFragil ? (
              <div className="space-y-1">
                <p className="font-mono text-sm font-semibold">
                  {conteudo.habilidadeMaisFragil.shortCode} ·{' '}
                  {conteudo.habilidadeMaisFragil.referenceCode}
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {conteudo.habilidadeMaisFragil.percentualTexto}{' '}
                  <span className="text-rotulo font-normal text-texto-suave">
                    ({conteudo.habilidadeMaisFragil.fracaoTexto})
                  </span>
                </p>
                <FaixaBadge faixa={conteudo.habilidadeMaisFragil.faixa} />
                <p className="text-rotulo text-texto-suave">
                  {conteudo.habilidadeMaisFragil.descricao}
                </p>
              </div>
            ) : (
              <p className="text-sm text-texto-suave">
                Nenhuma habilidade com desempenho apurado nesta turma.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h3">Melhor desempenho</CardTitle>
          </CardHeader>
          <CardContent>
            {conteudo.habilidadeMelhorDesempenho ? (
              <div className="space-y-1">
                <p className="font-mono text-sm font-semibold">
                  {conteudo.habilidadeMelhorDesempenho.shortCode} ·{' '}
                  {conteudo.habilidadeMelhorDesempenho.referenceCode}
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {conteudo.habilidadeMelhorDesempenho.percentualTexto}{' '}
                  <span className="text-rotulo font-normal text-texto-suave">
                    ({conteudo.habilidadeMelhorDesempenho.fracaoTexto})
                  </span>
                </p>
                <FaixaBadge faixa={conteudo.habilidadeMelhorDesempenho.faixa} />
                <p className="text-rotulo text-texto-suave">
                  {conteudo.habilidadeMelhorDesempenho.descricao}
                </p>
              </div>
            ) : (
              <p className="text-sm text-texto-suave">
                Nenhuma habilidade com desempenho apurado nesta turma.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* FR-080 */}
      <section className="space-y-3" aria-labelledby="titulo-habilidades">
        <h2 id="titulo-habilidades" className="text-lg font-semibold text-texto">
          Habilidades da turma
        </h2>
        <TabelaHabilidadesTurma
          habilidades={conteudo.habilidades}
          fragilidadeMaxTexto={faixas.fragilidadeMaxTexto}
          atencaoMaxTexto={faixas.atencaoMaxTexto}
        />
      </section>

      {/* FR-081, FR-082 */}
      <section className="space-y-3" aria-labelledby="titulo-estudantes">
        <h2 id="titulo-estudantes" className="text-lg font-semibold text-texto">
          Estudantes
        </h2>
        <TabelaEstudantes
          avaliados={conteudo.estudantesAvaliados}
          naoAvaliados={conteudo.estudantesNaoAvaliados}
        />
      </section>

      {/* FR-094 a FR-097 */}
      <section className="space-y-3" aria-labelledby="titulo-mapa">
        <h2 id="titulo-mapa" className="text-lg font-semibold text-texto">
          Mapa de calor
        </h2>
        <MapaCalor
          mapa={conteudo.mapaDeCalor}
          fragilidadeMaxTexto={faixas.fragilidadeMaxTexto}
          atencaoMaxTexto={faixas.atencaoMaxTexto}
        />
      </section>
    </main>
  )
}
