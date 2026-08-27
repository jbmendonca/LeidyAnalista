'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button, variantesBotao } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Alert } from '@/components/ui/alert'
import type { OpcoesDeFiltro } from '@/modules/analytics/application/filter-options'
import {
  CHAVES_FILTRO,
  descreverFiltrosAtivos,
  type ChaveFiltro,
  type FiltrosPainel,
} from '@/modules/analytics/schemas/filters'

/**
 * ===========================================================================
 *  BARRA DE FILTROS COMBINADOS — FR-098 a FR-101
 * ===========================================================================
 *
 * As quinze dimensões, e três compromissos que decidem o desenho:
 *
 *  1. **A query string é o estado.** Nenhum filtro vive só na memória do componente. O
 *     recorte precisa sobreviver ao recarregamento e caber num link colado no grupo da
 *     coordenação — é assim que uma análise vira conversa entre duas pessoas (FR-101). Como
 *     efeito colateral, o botão "voltar" do navegador desfaz o filtro, que é o que qualquer
 *     usuário espera dele.
 *
 *  2. **Filtro ativo é visível e removível um a um** (FR-100). A lista de etiquetas mostra o
 *     recorte em português — "Escola: Escola Municipal X" — e não os identificadores que
 *     trafegam na URL. Sem o nome, remover um filtro seria adivinhação.
 *
 *  3. **O servidor não confia em nada disto.** `escola` sai daqui como preferência de
 *     exibição; quem decide o que o usuário pode ver é `schoolScopeFilter` (Const. IV).
 *
 * O formulário é enviado por ação explícita, não a cada tecla: filtro que se aplica sozinho
 * dispara consultas a meio caminho da digitação e faz a tela piscar números intermediários.
 */

export type PropsBarraFiltros = {
  filtros: FiltrosPainel
  opcoes: OpcoesDeFiltro
  /** Mensagens de valores recusados na leitura da query string. */
  erros?: readonly string[]
  /** Chaves fixadas pela rota (a habilidade, na tela da habilidade). Não são editáveis. */
  chavesFixas?: readonly ChaveFiltro[]
  className?: string
}

type PropsCampo = {
  id: ChaveFiltro
  rotulo: string
  children: React.ReactNode
}

function Campo({ id, rotulo, children }: PropsCampo) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  )
}

function valorDe(filtros: FiltrosPainel, chave: ChaveFiltro): string {
  const valor = filtros[chave]
  return valor === undefined ? '' : String(valor)
}

export function BarraFiltros({
  filtros,
  opcoes,
  erros,
  chavesFixas = [],
  className,
}: PropsBarraFiltros) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const queryAtual = searchParams?.toString() ?? ''

  const fixas = React.useMemo(() => new Set(chavesFixas), [chavesFixas])

  const navegar = React.useCallback(
    (query: URLSearchParams) => {
      const texto = query.toString()
      router.push(texto.length > 0 ? `${pathname}?${texto}` : pathname)
    },
    [pathname, router],
  )

  const aoEnviar = React.useCallback(
    (evento: React.FormEvent<HTMLFormElement>) => {
      evento.preventDefault()
      const dados = new FormData(evento.currentTarget)
      const query = new URLSearchParams()

      for (const chave of CHAVES_FILTRO) {
        // As chaves fixadas pela rota permanecem como estão: o formulário não as edita.
        if (fixas.has(chave)) {
          const atual = filtros[chave]
          if (atual !== undefined) query.set(chave, String(atual))
          continue
        }
        const bruto = dados.get(chave)
        if (typeof bruto !== 'string') continue
        const valor = bruto.trim()
        // Campo em branco não vira filtro de valor vazio: vira ausência de filtro.
        if (valor.length === 0) continue
        query.set(chave, valor)
      }

      navegar(query)
    },
    [filtros, fixas, navegar],
  )

  const removerChaves = React.useCallback(
    (chaves: readonly ChaveFiltro[]) => {
      const query = new URLSearchParams(queryAtual)
      for (const chave of chaves) query.delete(chave)
      navegar(query)
    },
    [navegar, queryAtual],
  )

  const limparTudo = React.useCallback(() => {
    const query = new URLSearchParams(queryAtual)
    for (const chave of CHAVES_FILTRO) {
      if (fixas.has(chave)) continue
      query.delete(chave)
    }
    navegar(query)
  }, [fixas, navegar, queryAtual])

  const ativos = descreverFiltrosAtivos(filtros, opcoes.rotulosPorValor).filter(
    (a) => !a.chaves.every((c) => fixas.has(c)),
  )

  const selecao = (
    chave: ChaveFiltro,
    itens: readonly { valor: string; rotulo: string }[],
    vazio: string,
  ) => (
    <Select id={chave} name={chave} defaultValue={valorDe(filtros, chave)}>
      <option value="">{vazio}</option>
      {itens.map((i) => (
        <option key={i.valor} value={i.valor}>
          {i.rotulo}
        </option>
      ))}
    </Select>
  )

  return (
    <section
      aria-label="Filtros do recorte"
      className={cn(
        'space-y-3 rounded-md border border-borda bg-superficie p-4',
        className,
      )}
    >
      {erros && erros.length > 0 ? (
        <Alert variante="erro" titulo="Recorte não aplicado">
          <ul className="list-inside list-disc space-y-0.5">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {ativos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-rotulo font-semibold text-texto">
            <Filter aria-hidden="true" className="mr-1 inline size-3.5" />
            Filtros ativos:
          </span>

          {ativos.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded border border-borda-forte bg-superficie-tenue py-0.5 pl-2 pr-0.5 text-rotulo text-texto"
            >
              <span>
                <span className="font-medium">{a.rotulo}:</span> {a.valor}
              </span>
              <button
                type="button"
                onClick={() => removerChaves(a.chaves)}
                aria-label={`Remover filtro ${a.rotulo}: ${a.valor}`}
                className="rounded p-1 text-texto-suave hover:bg-superficie hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={limparTudo}
            className={cn(variantesBotao({ variante: 'vinculo', tamanho: 'pequeno' }))}
          >
            Limpar tudo
          </button>
        </div>
      ) : (
        <p className="text-rotulo text-texto-suave">
          Nenhum filtro aplicado — o recorte é o conjunto completo do seu acesso.
        </p>
      )}

      <details className="group" open>
        <summary className="cursor-pointer select-none text-rotulo font-medium text-primaria-forte">
          Ajustar filtros
        </summary>

        {/* `key` refaz o formulário quando a URL muda, para que os campos reflitam o
            recorte vigente inclusive depois do botão "voltar" do navegador. */}
        <form key={queryAtual} onSubmit={aoEnviar} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Campo id="avaliacao" rotulo="Avaliação">
              {selecao('avaliacao', opcoes.avaliacoes, 'Mais recente disponível')}
            </Campo>

            <Campo id="rede" rotulo="Rede">
              {selecao('rede', opcoes.redes, 'Todas as redes')}
            </Campo>

            <Campo id="estado" rotulo="Estado">
              {selecao('estado', opcoes.estados, 'Todos os estados')}
            </Campo>

            <Campo id="municipio" rotulo="Município">
              {selecao('municipio', opcoes.municipios, 'Todos os municípios')}
            </Campo>

            <Campo id="escola" rotulo="Escola">
              {selecao('escola', opcoes.escolas, 'Todas as escolas do meu acesso')}
            </Campo>

            <Campo id="anoEscolar" rotulo="Ano escolar">
              {selecao('anoEscolar', opcoes.anosEscolares, 'Todos os anos')}
            </Campo>

            <Campo id="componenteCurricular" rotulo="Componente curricular">
              {selecao(
                'componenteCurricular',
                opcoes.componentesCurriculares,
                'Todos os componentes',
              )}
            </Campo>

            <Campo id="turma" rotulo="Turma">
              {selecao('turma', opcoes.turmas, 'Todas as turmas')}
            </Campo>

            <Campo id="codigoTurma" rotulo="Código da turma">
              {selecao('codigoTurma', opcoes.codigosTurma, 'Todos os códigos')}
            </Campo>

            <Campo id="avaliado" rotulo="Situação de participação">
              {selecao('avaliado', opcoes.participacoes, 'Todos')}
            </Campo>

            <Campo id="nivel" rotulo="Nível de aprendizagem (fonte)">
              {selecao('nivel', opcoes.niveis, 'Todos os níveis')}
            </Campo>

            {fixas.has('habilidade') ? null : (
              <Campo id="habilidade" rotulo="Habilidade">
                {selecao('habilidade', opcoes.habilidades, 'Todas as habilidades')}
              </Campo>
            )}

            <Campo id="estudante" rotulo="Estudante">
              {opcoes.estudantesDisponiveis ? (
                selecao('estudante', opcoes.estudantes, 'Todos os estudantes')
              ) : (
                <p className="text-rotulo text-texto-suave">
                  Selecione uma escola ou turma para listar estudantes.
                </p>
              )}
            </Campo>

            <Campo id="situacao" rotulo="Situação analítica (sistema)">
              {selecao('situacao', opcoes.situacoes, 'Todas as situações')}
            </Campo>

            <div className="min-w-0 space-y-1.5">
              <span
                className="block text-rotulo font-medium text-texto"
                id="faixa-percentual"
              >
                Faixa de percentual geral
              </span>
              <div
                className="flex items-center gap-2"
                role="group"
                aria-labelledby="faixa-percentual"
              >
                <Input
                  id="percentualMin"
                  name="percentualMin"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  aria-label="Percentual mínimo"
                  placeholder="mín."
                  defaultValue={valorDe(filtros, 'percentualMin')}
                />
                <span aria-hidden="true" className="text-texto-suave">
                  a
                </span>
                <Input
                  id="percentualMax"
                  name="percentualMax"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  aria-label="Percentual máximo"
                  placeholder="máx."
                  defaultValue={valorDe(filtros, 'percentualMax')}
                />
              </div>
            </div>
          </div>

          {opcoes.estudantesTruncados ? (
            <p className="text-rotulo text-texto-suave">
              A lista de estudantes foi limitada. Estreite o recorte por turma para
              encontrar quem procura.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit">Aplicar filtros</Button>
            <Button type="button" variante="secundario" onClick={limparTudo}>
              Limpar tudo
            </Button>
          </div>
        </form>
      </details>
    </section>
  )
}
