import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { requireUser } from '@/server/authorization'
import { formatarData, formatarNumero } from '@/lib/format'
import {
  CRITERIOS_RANKING,
  normalizarCriterio,
  obterPainelAvaliacao,
} from '@/modules/analytics/application/assessment-dashboard'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { FaixaBadge } from '@/components/ui/faixa-badge'
import { EmptyState } from '@/components/data/empty-state'
import { IndicatorCard } from '@/components/data/indicator-card'
import { RankingHabilidades } from '@/components/data/ranking-habilidades'
import { RankingTurmas } from '@/components/data/ranking-turmas'
import { DistribuicaoNivel } from '@/components/charts/distribuicao-nivel'

export const metadata = { title: 'Painel da avaliação' }

/**
 * Painel geral da avaliação — FR-066 a FR-073.
 *
 * A tela inteira obedece a uma separação que o sistema não pode confundir em nenhum ponto:
 *
 * - **participação** conta todo registro importado, inclusive os não avaliados;
 * - **desempenho** conta apenas os avaliados, sempre como `Σ acertos ÷ Σ itens`;
 * - **distribuição por nível** tem como denominador o total de avaliados.
 *
 * Nenhum indicador aparece sozinho: cada cartão traz o numerador e o denominador que o
 * originaram, para que o leitor possa conferir de onde saiu o percentual em vez de aceitá-lo.
 * Recorte sem dado exibe travessão com nota — jamais `0%`, que afirmaria que ninguém acertou
 * nada quando o fato é que nada foi importado.
 *
 * O escopo por escola nunca é decidido aqui: `obterPainelAvaliacao` recebe o `AuthContext` e
 * as consultas filtram por `ctx.allowedSchoolIds`. Não existe parâmetro nesta rota capaz de
 * ampliar o alcance do usuário.
 */
export default async function PaginaPainelAvaliacao({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await getAuthContext()
  if (!sessao) redirect('/entrar')
  const ctx = requireUser(sessao)

  const { assessmentId } = await params
  const consulta = await searchParams

  const criterio = normalizarCriterio(consulta['ordenar'])
  const mostrarAbaixo = consulta['abaixo'] === '1'

  const painel = await obterPainelAvaliacao(ctx, { assessmentId, criterio })

  const { avaliacao, participacao, distribuicao, configuracao } = painel
  const semRegistros = participacao.total === 0

  const parametros = new URLSearchParams({ ordenar: criterio })
  if (!mostrarAbaixo) parametros.set('abaixo', '1')
  const hrefAlternarAbaixo = `?${parametros.toString()}`

  const maisFragil = painel.habilidadeMaisFragil
  const melhor = painel.habilidadeMelhorDesempenho

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <Link
          href="/avaliacoes"
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para avaliações
        </Link>
        <h1 className="text-xl font-semibold text-texto">{avaliacao.nome}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-texto-suave">
          <span>{avaliacao.ano}</span>
          <span aria-hidden="true">·</span>
          <span>{avaliacao.ciclo}</span>
          <span aria-hidden="true">·</span>
          <span>{avaliacao.componenteCurricular}</span>
          <span aria-hidden="true">·</span>
          <span>Aplicação em {formatarData(avaliacao.dataAplicacao)}</span>
        </div>
        <p className="text-rotulo text-texto-suave">
          Números restritos ao seu escopo de acesso. Configuração analítica versão{' '}
          {configuracao.versao}.
        </p>
      </header>

      {semRegistros ? (
        <EmptyState
          titulo="Nenhum resultado importado para esta avaliação"
          orientacao="Nada foi importado dentro do seu escopo de acesso. O painel não exibe zeros porque zero afirmaria que ninguém acertou nada — o fato é que ainda não há dado."
          acao={
            <Link
              href="/importacoes"
              className="text-primaria underline underline-offset-4"
            >
              Ir para importações
            </Link>
          }
        />
      ) : (
        <>
          <section aria-labelledby="titulo-indicadores" className="space-y-3">
            <h2 id="titulo-indicadores" className="text-lg font-semibold text-texto">
              Indicadores gerais
            </h2>

            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <IndicatorCard
                titulo="Estudantes importados"
                valor={formatarNumero(participacao.total)}
                numerador={participacao.total}
                denominador={participacao.total}
                unidade="registros no seu escopo"
                descricao="Universo completo da avaliação, avaliados e não avaliados."
              />

              <IndicatorCard
                titulo="Avaliados"
                valor={formatarNumero(participacao.avaliados)}
                numerador={participacao.avaliados}
                denominador={participacao.total}
                unidade="estudantes importados"
                descricao="Única base do cálculo de desempenho."
              />

              <IndicatorCard
                titulo="Não avaliados"
                valor={formatarNumero(participacao.naoAvaliados)}
                numerador={participacao.naoAvaliados}
                denominador={participacao.total}
                unidade="estudantes importados"
                descricao="Fora de todo denominador de desempenho; dentro da participação."
              />

              <IndicatorCard
                titulo="Taxa de participação"
                valor={participacao.taxa.percentualFormatado}
                numerador={participacao.taxa.numerador}
                denominador={participacao.taxa.denominador}
                unidade="estudantes importados"
                descricao="Avaliados sobre o total importado."
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
                linhas={distribuicao.linhas.map((l) => ({
                  chave: l.chave,
                  rotulo: l.rotulo,
                  quantidade: l.quantidade,
                  percentualFormatado: l.proporcao.percentualFormatado,
                }))}
                totalAvaliados={distribuicao.totalAvaliados}
                totalImportado={participacao.total}
                naoAvaliados={participacao.naoAvaliados}
                abaixoDoAdequado={{
                  mostrar:
                    mostrarAbaixo || distribuicao.abaixoDoAdequado.habilitadoNaConfiguracao,
                  habilitadoNaConfiguracao:
                    distribuicao.abaixoDoAdequado.habilitadoNaConfiguracao,
                  componentes: distribuicao.abaixoDoAdequado.componentes,
                  quantidade: distribuicao.abaixoDoAdequado.quantidade,
                  percentualFormatado:
                    distribuicao.abaixoDoAdequado.proporcao.percentualFormatado,
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
            parametrosPreservados={mostrarAbaixo ? [{ nome: 'abaixo', valor: '1' }] : []}
            fragilidadeMaxTexto={configuracao.fragilidadeMaxTexto}
            atencaoMaxTexto={configuracao.atencaoMaxTexto}
          />

          <RankingTurmas
            turmas={painel.turmasPorMenorDesempenho}
            destaque="DESEMPENHO"
            mostrarEscola
            titulo="Turmas por menor desempenho geral"
            descricao={
              <>
                Ordenadas do menor para o maior <span>Σ acertos ÷ Σ itens</span> entre os
                estudantes avaliados. Turma sem nenhum avaliado aparece com travessão e vai
                para o fim: ausência de dado não é o pior desempenho.
              </>
            }
          />

          <RankingTurmas
            turmas={painel.turmasPorMaiorDefasagem}
            destaque="DEFASAGEM"
            mostrarEscola
            titulo="Turmas por maior percentual em Defasagem"
            descricao="Percentual de estudantes classificados como Defasagem pela fonte, sobre os avaliados da própria turma."
          />

          {distribuicao.totalAvaliados === 0 ? (
            <Alert variante="aviso" titulo="Nenhum estudante avaliado neste recorte">
              Há {formatarNumero(participacao.total)} registros importados, mas nenhum
              avaliado. Os indicadores de desempenho ficam sem denominador e por isso
              aparecem como travessão.
            </Alert>
          ) : null}
        </>
      )}
    </main>
  )
}
