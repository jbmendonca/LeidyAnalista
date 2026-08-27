import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import {
  obterFichaDoEstudante,
  ROTULO_PARTICIPACAO,
} from '@/modules/analytics/application/student-record'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { FaixaBadge, LegendaFaixaAnalitica } from '@/components/ui/faixa-badge'
import { NivelBadge } from '@/components/ui/nivel-badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from '@/components/ui/table'
import { EmptyState } from '@/components/data/empty-state'
import { IndicatorCard } from '@/components/data/indicator-card'

export const metadata = { title: 'Ficha do estudante' }

/**
 * Ficha individual do estudante — FR-088 a FR-093.
 *
 * Duas separações estruturam a página, e nenhuma é decorativa:
 *
 * - **Nível de aprendizagem × situação analítica.** O primeiro vem da fonte e é transcrito
 *   (`NivelBadge`, retângulo sólido); a segunda é cálculo do sistema sobre limites
 *   configuráveis (`FaixaBadge`, pílula tracejada com ◆) e está rotulada como tal. As
 *   contagens de Fragilidade e Atenção pertencem à segunda categoria (FR-092).
 *
 * - **Ausência × zero.** Para o estudante não avaliado, todo campo de desempenho chega
 *   `null` e sai como travessão (FR-093). Nenhum caminho desta página produz `0` a partir
 *   de ausência.
 *
 * A supressão nominal acontece na camada de dados, não aqui: esconder o nome só na
 * renderização o deixaria trafegar até o navegador.
 */
export default async function PaginaFichaDoEstudante({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ avaliacao?: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const { studentId } = await params
  const { avaliacao: avaliacaoSelecionada } = await searchParams

  const ficha = await obterFichaDoEstudante(ctx, studentId, avaliacaoSelecionada ?? null)
  const naoAvaliado = ficha.situacao !== 'AVALIADO'

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href={`/turmas/${ficha.classId}/painel`}
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para o painel da turma
        </Link>
        <h1 className="text-xl font-semibold text-texto">{ficha.nomeOriginal}</h1>
        <p className="text-sm text-texto-suave">
          Código único{' '}
          <span className="font-mono font-medium text-texto">{ficha.uniqueCode}</span>
          {ficha.codigoExterno ? ` · código da rede ${ficha.codigoExterno}` : ''}
        </p>
        <p className="text-sm text-texto-suave">
          {ficha.escolaNome} · {ficha.turmaNome} (turma {ficha.codigoTurma}) ·{' '}
          {ficha.anoEscolar}
          {ficha.avaliacao ? ` · ${ficha.avaliacao.componenteCurricular}` : ''}
        </p>
        {ficha.avaliacao ? (
          <p className="text-rotulo text-texto-suave">
            {ficha.avaliacao.nome} · {ficha.avaliacao.ciclo} · {ficha.avaliacao.ano} ·{' '}
            {ficha.versaoRelatorio}
          </p>
        ) : null}
      </header>

      {ficha.situacao === 'SEM_REGISTRO' ? (
        <EmptyState
          titulo="Sem registro nesta avaliação"
          orientacao="Este estudante está cadastrado, mas não há linha importada para a avaliação selecionada. A ausência de registro não é participação zero nem desempenho zero — é ausência, e é assim que aparece."
        />
      ) : null}

      {/* FR-089, FR-090 */}
      <section className="space-y-3" aria-labelledby="titulo-situacao">
        <h2 id="titulo-situacao" className="text-lg font-semibold text-texto">
          Situação e desempenho geral
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="flex h-full flex-col gap-2 p-4">
            <p className="text-rotulo font-medium uppercase tracking-wide text-texto-suave">
              Participação
            </p>
            <p className="text-lg font-semibold text-texto">
              {ROTULO_PARTICIPACAO[ficha.situacao]}
            </p>
            <p className="text-rotulo text-texto-suave">
              {naoAvaliado
                ? 'Fora de todo denominador de desempenho, dentro do indicador de participação.'
                : 'Dentro do cálculo de desempenho da turma, da escola e da rede.'}
            </p>
          </Card>

          <Card className="flex h-full flex-col gap-2 p-4">
            <p className="text-rotulo font-medium uppercase tracking-wide text-texto-suave">
              Nível de aprendizagem
            </p>
            <div>
              <NivelBadge
                nivel={ficha.nivelNormalizado}
                avaliado={ficha.situacao === 'AVALIADO'}
              />
            </div>
            {/* Const. III — o texto bruto da fonte permanece visível, sem tradução. */}
            <p className="text-rotulo text-texto-suave">
              Recebido da fonte:{' '}
              <span className="font-medium text-texto">
                {ficha.nivelOriginal && ficha.nivelOriginal.trim() !== ''
                  ? ficha.nivelOriginal
                  : AUSENTE}
              </span>
            </p>
            <p className="text-rotulo text-texto-suave">
              Classificação oficial da avaliação. O sistema a transcreve; não a recalcula.
            </p>
          </Card>

          <IndicatorCard
            titulo="Percentual geral"
            valor={ficha.percentualTexto}
            numerador={ficha.acertosTotais}
            denominador={ficha.itensPossiveis}
            unidade="itens possíveis"
            notaAusencia={
              naoAvaliado
                ? 'estudante não avaliado — sem resultados'
                : 'sem itens possíveis registrados'
            }
            descricao="Σ acertos ÷ Σ itens do próprio estudante."
          />

          <Card className="flex h-full flex-col gap-1 p-4">
            <p className="text-rotulo font-medium uppercase tracking-wide text-texto-suave">
              Situação analítica das habilidades
            </p>
            <p className="text-rotulo text-texto-suave">
              Critério analítico do sistema — não é o nível de aprendizagem da fonte.
            </p>
            <dl className="mt-1 space-y-0.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt>
                  <FaixaBadge faixa="FRAGILIDADE" />
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {ficha.habilidadesEmFragilidade === null ? (
                    <>
                      <span className="ausente" aria-hidden="true">
                        {AUSENTE}
                      </span>
                      <span className="apenas-leitor-de-tela">Sem dado</span>
                    </>
                  ) : (
                    formatarNumero(ficha.habilidadesEmFragilidade)
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>
                  <FaixaBadge faixa="ATENCAO" />
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {ficha.habilidadesEmAtencao === null ? (
                    <>
                      <span className="ausente" aria-hidden="true">
                        {AUSENTE}
                      </span>
                      <span className="apenas-leitor-de-tela">Sem dado</span>
                    </>
                  ) : (
                    formatarNumero(ficha.habilidadesEmAtencao)
                  )}
                </dd>
              </div>
            </dl>
            <p className="pt-1 text-rotulo text-texto-suave">
              Limites em vigor: Fragilidade abaixo de {ficha.faixas.fragilidadeMaxTexto}%,
              Atenção até menos de {ficha.faixas.atencaoMaxTexto}%.
            </p>
          </Card>
        </div>
      </section>

      {/* FR-091 */}
      <section className="space-y-3" aria-labelledby="titulo-habilidades">
        <h2 id="titulo-habilidades" className="text-lg font-semibold text-texto">
          Detalhamento por habilidade
        </h2>

        {ficha.habilidades.length === 0 ? (
          <EmptyState
            titulo="Nenhuma habilidade apurada para esta avaliação"
            orientacao="O denominador de referência de cada habilidade nasce da apuração sobre os dados importados. Sem importação confirmada não há detalhamento a exibir."
          />
        ) : (
          <>
            <TableContainer rotulo="Detalhamento por habilidade">
              <Table>
                <TableCaption>
                  {naoAvaliado
                    ? 'Estudante sem avaliação: todas as habilidades aparecem com travessão. Ausência de resultado não é resultado zero.'
                    : 'O resultado original acompanha o percentual em toda linha, para que a origem do número permaneça verificável.'}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Habilidade</TableHead>
                    <TableHead numerica>Resultado original</TableHead>
                    <TableHead numerica>Percentual</TableHead>
                    <TableHead>Situação analítica</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ficha.habilidades.map((habilidade) => (
                    <TableRow key={habilidade.skillId}>
                      <TableRowHeader className="whitespace-nowrap font-mono">
                        {habilidade.shortCode}
                        <span className="block text-rotulo font-normal text-texto-suave">
                          {habilidade.referenceCode}
                        </span>
                      </TableRowHeader>
                      <TableCell className="max-w-prose text-rotulo text-texto-suave">
                        {habilidade.descricao}
                      </TableCell>
                      <TableCell numerica>
                        {habilidade.acertos === null ? (
                          <>
                            <span className="ausente" aria-hidden="true">
                              {AUSENTE}
                            </span>
                            <span className="apenas-leitor-de-tela">
                              Sem resultado registrado
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block font-medium">
                              {habilidade.fracaoTexto}
                            </span>
                            {habilidade.valorOriginal &&
                            habilidade.valorOriginal !== habilidade.fracaoTexto ? (
                              <span className="block text-rotulo text-texto-suave">
                                na fonte: {habilidade.valorOriginal}
                              </span>
                            ) : null}
                          </>
                        )}
                      </TableCell>
                      <TableCell numerica>
                        {habilidade.acertos === null ? (
                          <>
                            <span className="ausente" aria-hidden="true">
                              {AUSENTE}
                            </span>
                            <span className="apenas-leitor-de-tela">Sem dado</span>
                          </>
                        ) : (
                          <span className="font-medium">
                            {habilidade.percentualTexto}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <FaixaBadge faixa={habilidade.faixa} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <LegendaFaixaAnalitica />
          </>
        )}
      </section>
    </div>
  )
}
