import * as React from 'react'

import { cn } from '@/lib/utils'

/** Categoria analítica produzida pelo sistema. Espelha `AnalyticalBand` do domínio. */
export type FaixaAnalitica = 'FRAGILIDADE' | 'ATENCAO' | 'SATISFATORIO'

const FAIXAS = {
  FRAGILIDADE: {
    rotulo: 'Fragilidade',
    classe:
      'border-faixa-fragilidade-borda bg-faixa-fragilidade-fundo text-faixa-fragilidade',
  },
  ATENCAO: {
    rotulo: 'Atenção',
    classe: 'border-faixa-atencao-borda bg-faixa-atencao-fundo text-faixa-atencao',
  },
  SATISFATORIO: {
    rotulo: 'Satisfatório',
    classe:
      'border-faixa-satisfatorio-borda bg-faixa-satisfatorio-fundo text-faixa-satisfatorio',
  },
} as const satisfies Record<FaixaAnalitica, { rotulo: string; classe: string }>

/** Texto único de proveniência, repetido em `title` e em leitor de tela. */
export const PROVENIENCIA_FAIXA = 'critério analítico do sistema'

export type PropsFaixaBadge = {
  faixa: FaixaAnalitica | null
  className?: string
}

/**
 * Faixa analítica do sistema — **não** é a classificação da fonte.
 *
 * Const. III exige que a categoria calculada pelo painel não se confunda com o nível de
 * aprendizagem informado na planilha original. A separação é sustentada por quatro sinais
 * simultâneos, nenhum deles dependente de cor:
 *
 * 1. **forma** — pílula (`rounded-full`) contra o retângulo de canto reto de `NivelBadge`;
 * 2. **borda tracejada** — o traço lê o valor como derivado, não como registrado;
 * 3. **marcador ◆** — glifo presente aqui e ausente lá, visível inclusive impresso em P&B;
 * 4. **matiz** — petróleo / laranja-queimado / vinho, família distinta do
 *    verde / âmbar / vermelho dos níveis oficiais.
 *
 * A proveniência aparece em texto: `title` para o mouse e conteúdo para leitor de tela. Os
 * limites das faixas vêm de `AnalyticalSettings` e são configuráveis — motivo a mais para
 * que a etiqueta nunca se apresente como fato da fonte.
 */
export function FaixaBadge({ faixa, className }: PropsFaixaBadge) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-0.5 text-rotulo font-semibold'

  if (faixa === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center text-rotulo',
          'border-transparent',
          className,
        )}
        title={`Sem faixa analítica: não há resultado para classificar (${PROVENIENCIA_FAIXA})`}
      >
        <span className="ausente" aria-hidden="true">
          —
        </span>
        <span className="apenas-leitor-de-tela">
          Sem faixa analítica — não há resultado para classificar
        </span>
      </span>
    )
  }

  const { rotulo, classe } = FAIXAS[faixa]

  return (
    <span
      className={cn(base, classe, className)}
      title={`${rotulo} — ${PROVENIENCIA_FAIXA}, calculado a partir do desempenho`}
    >
      <span aria-hidden="true" className="text-[0.6rem] leading-none">
        ◆
      </span>
      {rotulo}
      <span className="apenas-leitor-de-tela"> ({PROVENIENCIA_FAIXA})</span>
    </span>
  )
}

/**
 * Legenda das faixas analíticas.
 *
 * Uma tabela cheia de pílulas exige que a distinção esteja escrita em algum lugar da página;
 * este bloco é esse lugar. Deve acompanhar todo quadro que exiba `FaixaBadge`.
 */
export function LegendaFaixaAnalitica({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 text-rotulo text-texto-suave',
        className,
      )}
    >
      <span className="font-medium text-texto">
        Faixas analíticas <span className="font-normal">({PROVENIENCIA_FAIXA})</span>:
      </span>
      {(Object.keys(FAIXAS) as FaixaAnalitica[]).map((chave) => (
        <FaixaBadge key={chave} faixa={chave} />
      ))}
      <span>
        Distintas do{' '}
        <strong className="font-medium text-texto">nível de aprendizagem</strong>{' '}
        informado na fonte.
      </span>
    </div>
  )
}
