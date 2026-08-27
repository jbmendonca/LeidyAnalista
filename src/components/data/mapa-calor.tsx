'use client'

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { cn } from '@/lib/utils'
import { formatarNumero } from '@/lib/format'
import { LegendaFaixaAnalitica } from '@/components/ui/faixa-badge'
import { EmptyState } from '@/components/data/empty-state'
import { MapaCalorCelula } from '@/components/data/mapa-calor-celula'
import type { LinhaMapaCalor, MapaDeCalor } from '@/modules/analytics/application/heatmap'

/**
 * Mapa de calor estudante × habilidade — FR-094 a FR-097.
 *
 * **Marcação de tabela de verdade.** `<table>` com `<th scope="col">` por habilidade e
 * `<th scope="row">` por estudante: é o que dá ao leitor de tela o par "quem × qual
 * habilidade" ao entrar em cada célula. Uma grade de `<div>` com `role="grid"` reproduziria
 * o desenho e perderia essa relação, que é justamente o conteúdo do mapa.
 *
 * **Virtualização só quando ela paga o próprio custo.** Acima de
 * {@link LIMITE_VIRTUALIZACAO} estudantes as linhas passam a ser janeladas por
 * `@tanstack/react-virtual`; abaixo disso a tabela é renderizada inteira. Uma turma tem
 * dezenas de crianças, não milhares: virtualizar sempre custaria altura estimada,
 * espaçadores e uma tabela que o Ctrl+F do navegador não encontra por completo, em troca de
 * nada. O limite existe para a tela de escola ou de rede, onde o mesmo componente recebe
 * centenas de linhas.
 *
 * **Rolagem dentro do contêiner.** O elemento de rolagem é o `<div>` desta região, com
 * `tabIndex={0}` para ser alcançável por teclado (WCAG 2.1.1); a página nunca rola na
 * horizontal. A primeira coluna fica fixa: sem ela, quem chega à habilidade H12 já não sabe
 * de que criança é a linha.
 */

/** Acima deste número de estudantes, as linhas passam a ser janeladas. */
export const LIMITE_VIRTUALIZACAO = 60

/** Altura fixa da linha, em px. Fixa de propósito: alimenta a estimativa do virtualizador. */
const ALTURA_LINHA = 56

function Linha({
  linha,
  estilo,
}: {
  linha: LinhaMapaCalor
  estilo?: React.CSSProperties
}) {
  return (
    <tr
      style={estilo}
      data-nao-avaliado={linha.avaliado ? undefined : ''}
      className={cn(
        'border-b border-borda',
        linha.avaliado ? undefined : 'bg-nivel-ausente-fundo/40',
      )}
    >
      <th
        scope="row"
        className={cn(
          'sticky left-0 z-10 min-w-48 max-w-64 border-r border-borda bg-superficie px-3 py-1 text-left align-middle',
          linha.avaliado ? undefined : 'bg-superficie-tenue',
        )}
      >
        <span className="block truncate text-sm font-medium text-texto">
          {linha.nomeOriginal}
        </span>
        <span className="block truncate font-mono text-rotulo font-normal text-texto-suave">
          {linha.uniqueCode}
          {linha.avaliado ? null : ' · não avaliado'}
        </span>
      </th>

      {linha.celulas.map((celula) => (
        <MapaCalorCelula key={celula.skillId} celula={celula} className="w-20" />
      ))}
    </tr>
  )
}

export type PropsMapaCalor = {
  mapa: MapaDeCalor
  fragilidadeMaxTexto: string
  atencaoMaxTexto: string
  className?: string
}

export function MapaCalor({
  mapa,
  fragilidadeMaxTexto,
  atencaoMaxTexto,
  className,
}: PropsMapaCalor) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const linhas = mapa.linhas
  const virtualizar = linhas.length > LIMITE_VIRTUALIZACAO

  // O hook é chamado incondicionalmente — regra dos hooks. O que é condicional é o uso do
  // resultado: sem virtualização, o `count` é zero e o virtualizador não mede nada.
  const virtualizador = useVirtualizer({
    count: virtualizar ? linhas.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 10,
  })

  if (mapa.habilidades.length === 0 || linhas.length === 0) {
    return (
      <EmptyState
        titulo="Sem matriz para exibir"
        orientacao="O mapa de calor precisa de habilidades apuradas e de estudantes com registro na avaliação. Nada aqui é preenchido com zero na falta de dado."
        className={className}
      />
    )
  }

  const itens = virtualizador.getVirtualItems()
  const primeiro = itens[0]
  const ultimo = itens[itens.length - 1]
  const espacoAntes = virtualizar && primeiro ? primeiro.start : 0
  const espacoDepois =
    virtualizar && ultimo ? virtualizador.getTotalSize() - ultimo.end : 0

  const colunas = mapa.habilidades.length + 1

  return (
    <div className={cn('space-y-3', className)}>
      <div
        ref={containerRef}
        role="region"
        tabIndex={0}
        aria-label="Mapa de calor de estudantes por habilidade, rolável"
        className={cn(
          'rolagem-tabela max-h-[70vh] overflow-auto rounded-md border border-borda bg-superficie',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2',
        )}
      >
        <table className="w-full min-w-max caption-bottom border-collapse text-sm">
          <caption className="max-w-prose px-3 py-2 text-left text-rotulo text-texto-suave">
            Cada célula traz o resultado original e o percentual em texto; a cor indica a
            faixa analítica do sistema e nunca é o único portador de significado. Célula
            sem resultado é tracejada e traz travessão — distinta de célula com resultado
            zero.
          </caption>

          <thead className="sticky top-0 z-20 border-b border-borda bg-superficie-tenue">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-30 min-w-48 border-r border-borda bg-superficie-tenue px-3 py-2.5 text-left text-rotulo font-semibold text-texto"
              >
                Estudante
              </th>
              {mapa.habilidades.map((habilidade) => (
                <th
                  key={habilidade.skillId}
                  scope="col"
                  title={`${habilidade.shortCode} (${habilidade.referenceCode}): ${habilidade.descricao}`}
                  className="w-20 px-1 py-2.5 text-center align-bottom text-rotulo font-semibold text-texto"
                >
                  <span className="font-mono">{habilidade.shortCode}</span>
                  <span className="apenas-leitor-de-tela">
                    {' '}
                    — {habilidade.referenceCode}: {habilidade.descricao}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {espacoAntes > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={colunas} style={{ height: espacoAntes }} className="p-0" />
              </tr>
            ) : null}

            {virtualizar
              ? itens.map((item) => {
                  const linha = linhas[item.index]
                  if (!linha) return null
                  return (
                    <Linha
                      key={linha.studentId}
                      linha={linha}
                      estilo={{ height: ALTURA_LINHA }}
                    />
                  )
                })
              : linhas.map((linha) => <Linha key={linha.studentId} linha={linha} />)}

            {espacoDepois > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={colunas} style={{ height: espacoDepois }} className="p-0" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <LegendaFaixaAnalitica />

      <p className="text-rotulo text-texto-suave">
        {formatarNumero(linhas.length)} estudantes ×{' '}
        {formatarNumero(mapa.habilidades.length)} habilidades ·{' '}
        {formatarNumero(mapa.celulasComResultado)} células com resultado. Limites em
        vigor: Fragilidade abaixo de {fragilidadeMaxTexto}%, Atenção de{' '}
        {fragilidadeMaxTexto}% a menos de {atencaoMaxTexto}%, Satisfatório a partir de{' '}
        {atencaoMaxTexto}%.
        {virtualizar
          ? ` Linhas janeladas acima de ${formatarNumero(LIMITE_VIRTUALIZACAO)} estudantes.`
          : ''}
      </p>
    </div>
  )
}
