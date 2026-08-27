import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { rotuloVersaoRelatorio } from '@/server/nominal-data'
import { EmptyState } from '@/components/data/empty-state'
import { Button, variantesBotao } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  ROTULO_TIPO,
  TIPOS_RELATORIO,
  type TipoRelatorio,
} from '@/modules/reports/domain/report-header'
import {
  entradaDeSearchParams,
  listarOpcoesDeRelatorio,
  queryDoRecorte,
} from '@/modules/reports/application/report-scope'

/**
 * ===========================================================================
 *  TELA DE RELATÓRIOS — FR-101 a FR-106
 * ===========================================================================
 *
 * A tela monta um recorte e o entrega, **idêntico**, aos três formatos: CSV, XLSX e a
 * folha de impressão. Os três links carregam a mesma query string, produzida por
 * `queryDoRecorte`, e os três caminhos a leem pela mesma função no servidor. É assim que
 * FR-101 vale na prática: não existe um lugar onde um filtro possa ser esquecido em um
 * formato e não no outro.
 *
 * Os seletores são preenchidos apenas com o que o requisitante alcança — conveniência,
 * não segurança. A defesa real está no servidor: `resolverEscopoRelatorio` valida cada
 * identificador contra o escopo e responde 404 para o que estiver fora dele, mesmo que
 * alguém edite a barra de endereços (FR-006, FR-104).
 *
 * A tela nunca nega um relatório por falta de permissão nominal. Quem não a tem recebe a
 * versão agregada, e o aviso no topo diz exatamente isso — o dado existe, a permissão é
 * que não (FR-007a).
 */

export const metadata = { title: 'Relatórios' }

/** Requisitos de recorte de cada tipo, na ordem em que a tela os pede. */
const EXIGENCIA: Readonly<Record<TipoRelatorio, string | null>> = {
  geral: null,
  escola: 'schoolId',
  turma: 'classId',
  habilidade: 'skillId',
  individual: 'studentId',
}

const AJUDA: Readonly<Record<TipoRelatorio, string>> = {
  geral:
    'Participação, distribuição por nível, desempenho, ranking de habilidades, comparação de turmas e estudantes em prioridade pedagógica.',
  escola:
    'Resumo da escola, indicadores, rankings e as listas de Defasagem, Intermediário e não avaliados.',
  turma:
    'Resumo, desempenho, distribuição, ranking de habilidades e a lista de estudantes por prioridade pedagógica.',
  habilidade:
    'Descrição, itens de referência apurados, percentual, comparação entre turmas, distribuição de acertos e estudantes com dificuldade.',
  individual:
    'Identificação, código único, nível da fonte, acertos, itens, percentual e o detalhamento habilidade a habilidade.',
}

export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const consulta = await searchParams
  const entrada = entradaDeSearchParams(consulta)

  const opcoes = await listarOpcoesDeRelatorio(ctx, {
    assessmentId: entrada.assessmentId,
    schoolId: entrada.schoolId,
    classId: entrada.classId,
  })

  const query = queryDoRecorte(entrada)
  const temAvaliacao = Boolean(entrada.assessmentId)

  const selecionado = (chave: keyof typeof entrada): string => {
    const valor = entrada[chave]
    return typeof valor === 'string' ? valor : ''
  }

  const disponivel = (tipo: TipoRelatorio): boolean => {
    const exigido = EXIGENCIA[tipo]
    if (!temAvaliacao) return false
    if (exigido === null) return true
    return selecionado(exigido as keyof typeof entrada) !== ''
  }

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-texto">Relatórios</h1>
        <p className="text-sm text-texto-suave">
          Monte o recorte e exporte em CSV, planilha ou PDF. Os três formatos usam
          exatamente os mesmos números da tela.
        </p>
      </header>

      {opcoes.nominal ? null : (
        <p className="rounded border border-borda bg-superficie-tenue px-3 py-2 text-sm">
          {rotuloVersaoRelatorio(ctx)}. Todos os relatórios continuam disponíveis com os
          números completos; a identificação dos estudantes é substituída pelo código
          único.
        </p>
      )}

      <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="assessmentId">Avaliação</Label>
          <Select
            id="assessmentId"
            name="assessmentId"
            defaultValue={selecionado('assessmentId')}
          >
            <option value="">Selecione a avaliação</option>
            {opcoes.avaliacoes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="schoolId">Escola</Label>
          <Select id="schoolId" name="schoolId" defaultValue={selecionado('schoolId')}>
            <option value="">Todas as escolas do meu acesso</option>
            {opcoes.escolas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="classId">Turma</Label>
          <Select id="classId" name="classId" defaultValue={selecionado('classId')}>
            <option value="">Todas as turmas do recorte</option>
            {opcoes.turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.rotulo}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="skillId">Habilidade</Label>
          <Select id="skillId" name="skillId" defaultValue={selecionado('skillId')}>
            <option value="">
              {temAvaliacao
                ? 'Selecione para o relatório de habilidade'
                : 'Escolha a avaliação primeiro'}
            </option>
            {opcoes.habilidades.map((h) => (
              <option key={h.id} value={h.id}>
                {h.rotulo}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="studentId">Estudante</Label>
          <Select id="studentId" name="studentId" defaultValue={selecionado('studentId')}>
            <option value="">
              {selecionado('classId') === ''
                ? 'Escolha a turma primeiro'
                : 'Selecione para o relatório individual'}
            </option>
            {opcoes.estudantes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nivel">Nível de aprendizagem (fonte)</Label>
          <Select id="nivel" name="nivel" defaultValue={selecionado('nivel')}>
            <option value="">Todos os níveis</option>
            <option value="ADEQUADO">Adequado</option>
            <option value="INTERMEDIARIO">Intermediário</option>
            <option value="DEFASAGEM">Defasagem</option>
          </Select>
        </div>

        <div className="flex items-end gap-3">
          <Button type="submit" variante="secundario">
            Aplicar recorte
          </Button>
          {query === '' ? null : (
            <Link
              href="/relatorios"
              className={variantesBotao({ variante: 'vinculo', tamanho: 'medio' })}
            >
              Limpar
            </Link>
          )}
        </div>
      </form>

      {temAvaliacao ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {TIPOS_RELATORIO.map((tipo) => {
            const pronto = disponivel(tipo)
            const sufixo = query === '' ? '' : `?${query}`

            return (
              <Card key={tipo} data-cartao="" className="flex h-full flex-col">
                <CardHeader>
                  <CardTitle>{ROTULO_TIPO[tipo]}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <p className="text-sm text-texto-suave">{AJUDA[tipo]}</p>

                  {pronto ? (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/reports/${tipo}/csv${sufixo}`}
                        className={variantesBotao({ variante: 'secundario', tamanho: 'pequeno' })}
                      >
                        CSV
                      </a>
                      <a
                        href={`/api/reports/${tipo}/xlsx${sufixo}`}
                        className={variantesBotao({ variante: 'secundario', tamanho: 'pequeno' })}
                      >
                        Planilha
                      </a>
                      <Link
                        href={`/relatorios/${tipo}/imprimir${sufixo}`}
                        className={variantesBotao({ tamanho: 'pequeno' })}
                      >
                        PDF / imprimir
                      </Link>
                    </div>
                  ) : (
                    <p className="text-rotulo text-texto-suave">
                      Selecione {EXIGENCIA[tipo] === 'schoolId' ? 'a escola' : null}
                      {EXIGENCIA[tipo] === 'classId' ? 'a turma' : null}
                      {EXIGENCIA[tipo] === 'skillId' ? 'a habilidade' : null}
                      {EXIGENCIA[tipo] === 'studentId' ? 'o estudante' : null} no recorte
                      acima para liberar este relatório.
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          titulo="Escolha a avaliação"
          orientacao="Todo relatório nasce de uma avaliação: é dela que vêm as habilidades, os denominadores apurados e os resultados. Selecione uma acima para liberar as exportações."
        />
      )}
    </main>
  )
}
