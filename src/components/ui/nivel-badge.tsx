import * as React from 'react'

import { cn } from '@/lib/utils'

/** Classificação oficial da fonte. Espelha `LearningLevel` do schema. */
export type NivelAprendizagem = 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM'

const NIVEIS = {
  ADEQUADO: {
    rotulo: 'Adequado',
    classe: 'border-nivel-adequado-borda bg-nivel-adequado-fundo text-nivel-adequado',
  },
  INTERMEDIARIO: {
    rotulo: 'Intermediário',
    classe:
      'border-nivel-intermediario-borda bg-nivel-intermediario-fundo text-nivel-intermediario',
  },
  DEFASAGEM: {
    rotulo: 'Defasagem',
    classe: 'border-nivel-defasagem-borda bg-nivel-defasagem-fundo text-nivel-defasagem',
  },
} as const satisfies Record<NivelAprendizagem, { rotulo: string; classe: string }>

const NAO_AVALIADO = {
  rotulo: 'Não avaliado',
  classe:
    'border-dashed border-nivel-ausente-borda bg-nivel-ausente-fundo text-nivel-ausente',
} as const

export type PropsNivelBadge = {
  nivel: NivelAprendizagem | null
  /** `false` quando a criança não foi avaliada. */
  avaliado: boolean
  className?: string
}

/**
 * Nível de aprendizagem **da fonte** — dado intocável (Const. III).
 *
 * O sistema não infere, não recalcula e não sobrescreve este valor: apenas o transcreve.
 * Por isso a forma é a mais neutra possível — retângulo sólido de canto reto, sem marcador —
 * em contraste deliberado com a pílula tracejada de `FaixaBadge`, que carrega o julgamento
 * analítico do sistema. Confundir as duas seria atribuir à fonte uma classificação que ela
 * não fez.
 *
 * Cor jamais responde sozinha (WCAG 1.4.1): o rótulo em texto está sempre presente.
 *
 * Três estados possíveis:
 * - avaliado com nível → etiqueta do nível;
 * - não avaliado → "Não avaliado", neutro. Fica fora de todo denominador de desempenho
 *   e dentro de todo indicador de participação;
 * - avaliado sem nível na fonte → travessão, nunca um nível arbitrado pelo sistema.
 */
export function NivelBadge({ nivel, avaliado, className }: PropsNivelBadge) {
  const base =
    'inline-flex items-center rounded-sm border px-2 py-0.5 text-rotulo font-semibold'

  if (!avaliado) {
    return (
      <span
        className={cn(base, NAO_AVALIADO.classe, className)}
        title="Criança não avaliada — fora do cálculo de desempenho, dentro do indicador de participação"
      >
        {NAO_AVALIADO.rotulo}
      </span>
    )
  }

  if (nivel === null) {
    return (
      <span
        className={cn(base, 'border-transparent bg-transparent font-normal', className)}
        title="Nível de aprendizagem ausente na fonte"
      >
        <span className="ausente" aria-hidden="true">
          —
        </span>
        <span className="apenas-leitor-de-tela">Nível não informado na fonte</span>
      </span>
    )
  }

  const { rotulo, classe } = NIVEIS[nivel]

  return (
    <span
      className={cn(base, classe, className)}
      title={`Nível de aprendizagem informado na fonte: ${rotulo}`}
    >
      {rotulo}
    </span>
  )
}
