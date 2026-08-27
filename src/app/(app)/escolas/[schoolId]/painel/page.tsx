import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireUser } from '@/server/authorization'
import { formatarData, formatarNumero } from '@/lib/format'
import {
  CRITERIOS_RANKING,
  normalizarCriterio,
} from '@/modules/analytics/application/assessment-dashboard'
import { obterPainelEscola } from '@/modules/analytics/application/school-dashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { FaixaBadge } from '@/components/ui/faixa-badge'
import { EmptyState } from '@/components/data/empty-state'
import { IndicatorCard } from '@/components/data/indicator-card'
import { RankingHabilidades } from '@/components/data/ranking-habilidades'
import { RankingTurmas } from '@/components/data/ranking-turmas'
import { DistribuicaoNivel } from '@/components/charts/distribuicao-nivel'

export const metadata = { title: 'Painel da escola' }

/**
 * Painel da escola — FR-074 a FR-076.
 *
 * Mesmos indicadores do painel geral, recortados por uma escola, mais os dois números de
 * cadastro que dão contexto ao recorte: quantas turmas e quantos estudantes ela tem.
 *
 * O `schoolId` da barra de endereços é **filtro, nunca autorização**: `obterPainelEscola`
 * chama `assertSchoolInScope` antes de qualquer leitura, e escola fora do escopo produz 404 —
 * jamais 403, que confirmaria a existência da escola a quem não pode vê-la (FR-006).
 *
 * A comparação entre "estudantes cadastrados na escola" e "registros importados na avaliação"
 * fica explícita porque as duas contagens divergem legitimamente: o cadastro é permanente, a
 * importação é de uma avaliação específica.
 */
export default async function PaginaPainelEscola({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await getAuthContext()
  if (!sessao) redirect('/entrar')
  const ctx = requireUser(sessao)

  const { schoolId } = await params
  const consulta = await searchParams

  const criterio = normalizarCriterio(consulta['ordenar'])
  const mostrarAbaixo = consulta['abaixo'] === '1'
  const avaliacaoPedida = consulta['avaliacao']

  const { escola, avaliacoes, avaliacaoSelecionada, painel } = await obterPainelEscola(ctx, {
    schoolId,
    assessmentId: typeof avaliacaoPedida === 'string' ? avaliacaoPedida : null,
    criterio,
  })

  const parametros = new URLSearchParams({ ordenar: criterio })
  if (avaliacaoSelecionada) parametros.set('avaliacao', avaliacaoSelecionada.id)
  if (!mostrarAbaixo) parametros.set('abaixo', '1')
  const hrefAlternarAbaixo = `?${parametros.toString()}`

  const preservados = [
    ...(avaliacaoSelecionada
      ? [{ nome: 'avaliacao', valor: avaliacaoSelecionada.id }]
      : []),
    ...(mostrarAbaixo ? [{ nome: 'abaixo', valor: '1' }] : []),
  ]

  const maisFragil = painel?.habilidadeMaisFragil ?? null
  const melhor = painel?.habilidadeMelhorDesempenho ?? null

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <Link
          href="/escolas"
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para escolas
        </Link>
        <h1 className="text-xl font-semibold text-texto">{escola.name}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-texto-suave">
          <span>{escola.code}</span>
          <span aria-hidden="true">·</span>
          <span>{escola.rede}</span>
          <span aria-hidden="true">·</span>
          <span>
            {escola.municipio} / {escola.estado}
          </span>
        </div>
      </header>

      <section aria-labelledby="titulo-cadastro" className="space-y-3">
        <h2 id="titulo-cadastro" className="text-lg font-semibold text-texto">
          Cadastro da escola
        </h2>
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
          <IndicatorCard
            titulo="Turmas"
            valor={formatarNumero(escola.totalTurmas)}
            numerador={escola.totalTurmas}
            denominador={escola.totalTurmas}
            unidade="turmas cadastradas"
            descricao="Cadastro permanente da escola, independente de qualquer avaliação."
            notaAusencia="nenhuma turma cadastrada"
          />
          <IndicatorCard
            titulo="Estudantes"
            valor={formatarNumero(escola.totalEstudantes)}
            numerador={escola.totalEstudantes}
            denominador={escola.totalEstudantes}
            unidade="estudantes cadastrados"
            descricao="Pode divergir do total importado numa avaliação específica."
            notaAusencia="nenhum estudante cadastrado"
          />
        </div>
      </section>

      {avaliacoes.length === 0 || !avaliacaoSelecionada || !painel ? (
        <EmptyState
          titulo="Nenhuma avaliação com resultados nesta escola"
          orientacao="Nenhum resultado foi importado para esta escola. O painel fica sem indicadores em vez de exibir zeros: zero afirmaria desempenho nulo, e o fato é que não há dado."
          acao={
            <Link href="/importacoes" className="text-primaria underline underline-offset-4">
              Ir para importações
            </Link>
          }
        />
      ) : (
        <>
          <section aria-labelledby="titulo-avaliacao" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 id="titulo-avaliacao" className="text-lg font-semibold text-texto">
                  {avaliacaoSelecionada.nome}
                </h2>
                <p className="text-sm text-texto-suave">
                  {avaliacaoSelecionada.ano} · {avaliacaoSelecionada.ciclo} ·{' '}
                  {avaliacaoSelecionada.componenteCurricular} · Aplicação em{' '}
                  {formatarData(avaliacaoSelecionada.dataAplicacao)}
                </p>
              </div>

              {avaliacoes.length > 1 ? (
                <form method="get" className="flex flex-wrap items-end gap-2 nao-imprimir">
                  <input type="hidden" name="ordenar" value={criterio} />
                  {mostrarAbaixo ? (
                    <input type="hidden" name="abaixo" value="1" />
                  ) : null}
                  <div className="space-y-1">
                    <label
                      htmlFor="avaliacao-do-painel"
                      className="block text-rotulo font-medium text-texto"
                    >
                      Avaliação
                    </label>
                    <Select
                      id="avaliacao-do-painel"
                      name="avaliacao"
                      defaultValue={avaliacaoSelecionada.id}
                      className="min-w-[16rem]"
                    >
                      {avaliacoes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome} ({a.ano})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" variante="secundario">
                    Abrir
                  </Button>
                </form>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
              <IndicatorCard
                titulo="Estudantes importados"
                valor={formatarNumero(painel.participacao.total)}
                numerador={painel.participacao.total}
                denominador={painel.participacao.total}
                unidade="registros nesta escola"
                descricao="Avaliados e não avaliados desta avaliação."
              />
              <IndicatorCard
                titulo="Avaliados"
                valor={formatarNumero(painel.participacao.avaliados)}
                numerador={painel.participacao.avaliados}
                denominador={painel.participacao.total}
                unidade="estudantes importados"
                descricao="Única base do cálculo de desempenho."
              />
              <IndicatorCard
                titulo="Taxa de participação"
                valor={painel.participacao.taxa.percentualFormatado}
                numerador={painel.participacao.taxa.numerador}
                denominador={painel.participacao.taxa.denominador}
                unidade="estudantes importados"
                descricao={`${formatarNumero(painel.participacao.naoAvaliados)} não avaliados, fora do desempenho.`}
                notaAusencia="sem registros importados"
              />
              <IndicatorCard
                titulo="Percentual geral de acerto"
                valor={painel.desempenhoGeral.percentualFormatado}
                numerador={painel.desempenhoGeral.numerador}
                denominador={painel.desempenhoGeral.denominador}
                unidade="itens possíveis dos avaliados"
                descricao="Σ acertos ÷ Σ itens — nunca a média dos percentuais individuais."
                notaAusencia="sem dados de desempenho"
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <DistribuicaoNivel
                linhas={painel.distribuicao.linhas.map((l) => ({
                  chave: l.chave,
                  rotulo: l.rotulo,
                  quantidade: l.quantidade,
                  percentualFormatado: l.proporcao.percentualFormatado,
                }))}
                totalAvaliados={painel.distribuicao.totalAvaliados}
                totalImportado={painel.participacao.total}
                naoAvaliados={painel.participacao.naoAvaliados}
                abaixoDoAdequado={{
                  mostrar:
                    mostrarAbaixo ||
                    painel.distribuicao.abaixoDoAdequado.habilitadoNaConfiguracao,
                  habilitadoNaConfiguracao:
                    painel.distribuicao.abaixoDoAdequado.habilitadoNaConfiguracao,
                  componentes: painel.distribuicao.abaixoDoAdequado.componentes,
                  quantidade: painel.distribuicao.abaixoDoAdequado.quantidade,
                  percentualFormatado:
                    painel.distribuicao.abaixoDoAdequado.proporcao.percentualFormatado,
                  hrefAlternar: hrefAlternarAbaixo,
                }}
              />
            </div>

            <div className="space-y-3">
              <IndicatorCard
                titulo="Habilidade mais frágil"
                valor={maisFragil?.percentualFormatado ?? null}
                numerador={maisFragil?.acertos ?? null}
                denominador={maisFragil?.itens ?? null}
                unidade="itens possíveis"
                notaAusencia="nenhuma habilidade com resultado"
                classificacao={
                  maisFragil ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variante="neutro">{maisFragil.shortCode}</Badge>
                      <FaixaBadge faixa={maisFragil.faixa} />
                    </div>
                  ) : null
                }
                descricao={maisFragil?.descricao ?? 'Sem resultado para comparar.'}
              />
              <IndicatorCard
                titulo="Habilidade de melhor desempenho"
                valor={melhor?.percentualFormatado ?? null}
                numerador={melhor?.acertos ?? null}
                denominador={melhor?.itens ?? null}
                unidade="itens possíveis"
                notaAusencia="nenhuma habilidade com resultado"
                classificacao={
                  melhor ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variante="neutro">{melhor.shortCode}</Badge>
                      <FaixaBadge faixa={melhor.faixa} />
                    </div>
                  ) : null
                }
                descricao={melhor?.descricao ?? 'Sem resultado para comparar.'}
              />
            </div>
          </div>

          <RankingHabilidades
            habilidades={painel.habilidades}
            criterio={painel.criterio}
            criterios={CRITERIOS_RANKING}
            parametrosPreservados={preservados}
            fragilidadeMaxTexto={painel.configuracao.fragilidadeMaxTexto}
            atencaoMaxTexto={painel.configuracao.atencaoMaxTexto}
            titulo="Ranking de habilidades da escola"
          />

          <RankingTurmas
            turmas={painel.turmasPorMenorDesempenho}
            destaque="DESEMPENHO"
            titulo="Turmas por menor desempenho geral"
            descricao="Ordenadas do menor para o maior Σ acertos ÷ Σ itens entre os estudantes avaliados da turma."
          />

          <RankingTurmas
            turmas={painel.turmasPorMaiorDefasagem}
            destaque="DEFASAGEM"
            titulo="Turmas por maior percentual em Defasagem"
            descricao="Percentual de estudantes classificados como Defasagem pela fonte, sobre os avaliados da própria turma."
          />
        </>
      )}
    </main>
  )
}
