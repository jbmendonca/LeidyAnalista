import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { AUSENTE } from '@/lib/format'
import {
  entradaDeSearchParams,
  montarRelatorio,
  registrarExportacaoDeRelatorio,
} from '@/modules/reports/application/report-scope'
import type { Celula, SecaoRelatorio } from '@/modules/reports/domain/report-header'

/**
 * ===========================================================================
 *  FOLHA DE IMPRESSÃO — FR-103 (PDF)
 * ===========================================================================
 *
 * O PDF **não é gerado no servidor**. Esta rota entrega a mesma estrutura de relatório em
 * HTML preparado para papel, e quem produz o arquivo é o "Salvar como PDF" do navegador.
 *
 * A decisão é deliberada e tem três razões: nenhuma dependência de renderização
 * headless para manter, nenhum binário de navegador no servidor de produção, e — a que
 * mais importa — o texto continua sendo texto. Um PDF rasterizado por biblioteca perde
 * seleção, busca e leitura por leitor de tela, e este documento vai para reunião
 * pedagógica e para a família.
 *
 * A página fica **fora do grupo `(app)`** de propósito: sem navegação lateral, sem casca,
 * só o documento. As regras de `@media print` de `globals.css` cuidam do resto — a barra
 * de ações traz `nao-imprimir`, as tabelas deixam de rolar e os cabeçalhos se repetem a
 * cada folha.
 *
 * O escopo e a supressão nominal são exatamente os do CSV e do XLSX: o mesmo
 * `montarRelatorio`, com o mesmo recorte. Nada aqui é escondido por CSS — o que o
 * solicitante não pode ver não chega a esta página (FR-007a).
 */

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Relatório para impressão' }

function CelulaTexto({ celula }: { celula: Celula }) {
  if (celula.texto === AUSENTE) {
    return (
      <>
        <span className="ausente" aria-hidden="true">
          {AUSENTE}
        </span>
        <span className="apenas-leitor-de-tela">Sem dado</span>
      </>
    )
  }
  return <>{celula.texto}</>
}

function Secao({ secao }: { secao: SecaoRelatorio }) {
  return (
    <section className="space-y-2 break-inside-avoid">
      <h2 className="text-base font-semibold text-texto">{secao.titulo}</h2>

      {secao.descricao !== null ? (
        <p className="text-sm text-texto-suave">{secao.descricao}</p>
      ) : null}

      {secao.linhas.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum registro neste recorte.</p>
      ) : (
        <div className="rolagem-tabela">
          <table className="w-full border-collapse text-sm">
            <caption className="apenas-leitor-de-tela">{secao.titulo}</caption>
            <thead>
              <tr>
                {secao.colunas.map((c) => (
                  <th
                    key={c.chave}
                    scope="col"
                    className={`border border-borda bg-superficie-tenue px-2 py-1 text-left font-semibold ${
                      c.numerica ? 'text-right' : ''
                    }`}
                  >
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {secao.linhas.map((linha, indiceLinha) => (
                <tr key={`${secao.id}-${String(indiceLinha)}`}>
                  {linha.map((celula, indiceCelula) => (
                    <td
                      key={secao.colunas[indiceCelula]?.chave ?? String(indiceCelula)}
                      className={`border border-borda px-2 py-1 align-top ${
                        secao.colunas[indiceCelula]?.numerica
                          ? 'text-right tabular-nums'
                          : ''
                      }`}
                    >
                      <CelulaTexto celula={celula} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {secao.nota !== null ? (
        <p className="text-rotulo text-texto-suave">{secao.nota}</p>
      ) : null}
    </section>
  )
}

export default async function PaginaImpressaoDeRelatorio({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const { tipo } = await params
  const consulta = await searchParams

  const { escopo, relatorio } = await montarRelatorio(
    ctx,
    tipo,
    entradaDeSearchParams(consulta),
  )

  // A folha impressa sai do sistema como qualquer outra exportação, e por isso é
  // registrada como qualquer outra (FR-121).
  await registrarExportacaoDeRelatorio(escopo, 'IMPRESSAO', relatorio)

  return (
    <div id="conteudo-principal" className="mx-auto w-full max-w-[60rem] space-y-6 p-6">
      <div className="nao-imprimir flex flex-wrap items-center justify-between gap-3 rounded border border-borda bg-superficie-tenue p-3">
        <p className="text-sm text-texto-suave">
          Use <strong>Imprimir</strong> e escolha <strong>Salvar como PDF</strong> no
          destino. O arquivo sai com o texto selecionável.
        </p>
        <button
          type="button"
          data-imprimir=""
          className="rounded bg-primaria px-4 py-2 text-sm font-semibold text-primaria-contraste"
        >
          Imprimir
        </button>
      </div>

      <header className="space-y-3 border-b border-borda pb-4">
        <div>
          <h1 className="text-xl font-semibold text-texto">
            {relatorio.cabecalho.titulo}
          </h1>
          <p className="text-sm text-texto-suave">{relatorio.cabecalho.subtitulo}</p>
        </div>

        {/* FR-106 e FR-166: o cabeçalho é parte do documento, não enfeite da tela. */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {relatorio.cabecalho.linhas.map((linha) => (
            <div key={linha.rotulo} className="contents">
              <dt className="font-medium text-texto-suave">{linha.rotulo}</dt>
              <dd className="text-texto">{linha.valor}</dd>
            </div>
          ))}
        </dl>

        {relatorio.nominal ? null : (
          <p className="rounded border border-borda bg-superficie-tenue px-3 py-2 text-sm">
            {relatorio.cabecalho.rotuloVersao}. Os números são os mesmos da versão
            nominal; apenas a identificação dos estudantes foi substituída pelo código
            único.
          </p>
        )}
      </header>

      {relatorio.secoes.map((secao) => (
        <Secao key={secao.id} secao={secao} />
      ))}

      {/*
        Sem componente cliente só para um `window.print()`: o script inline evita
        arrastar um bundle de interatividade para uma página cuja única ação é imprimir.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "document.querySelectorAll('[data-imprimir]').forEach(function(b){" +
            "b.addEventListener('click',function(){window.print()})})",
        }}
      />
    </div>
  )
}
