import Decimal from 'decimal.js'

import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * Grupo de prioridade pedagógica de um estudante na lista da turma (FR-082).
 *
 * Os três primeiros valores espelham o `Nível de aprendizagem` **recebido da fonte** — a
 * ordenação lê o nível, jamais o produz ou infere (Const. III, FR-112). `NAO_AVALIADO` não
 * é nível: é a ausência de avaliação, e por isso vai sempre para o fim.
 */
export type PriorityLevel = 'DEFASAGEM' | 'INTERMEDIARIO' | 'ADEQUADO' | 'NAO_AVALIADO'

export type PrioritizableStudent = {
  avaliado: boolean
  nivelNormalizado: 'ADEQUADO' | 'INTERMEDIARIO' | 'DEFASAGEM' | null
  performance: MaybeFraction
}

const GROUP_ORDER: Readonly<Record<PriorityLevel, number>> = {
  DEFASAGEM: 0,
  INTERMEDIARIO: 1,
  ADEQUADO: 2,
  NAO_AVALIADO: 4,
}

/**
 * Avaliado, porém sem nível informado pela fonte. Fica depois de ADEQUADO e antes dos não
 * avaliados: foi avaliado, então não pode ser confundido com quem não foi, e o sistema não
 * inventa um nível para encaixá-lo em um dos três grupos oficiais.
 */
const SEM_NIVEL_INFORMADO = 3

function groupRank(student: PrioritizableStudent): number {
  if (!student.avaliado) return GROUP_ORDER.NAO_AVALIADO
  if (student.nivelNormalizado === null) return SEM_NIVEL_INFORMADO
  return GROUP_ORDER[student.nivelNormalizado]
}

/**
 * Ordena estudantes por prioridade pedagógica (FR-082).
 *
 * Ordem dos grupos: DEFASAGEM → INTERMEDIARIO → ADEQUADO → não avaliados, que ficam
 * **sempre por último** independentemente de qualquer outro campo (Const. V; a tela os
 * exibe em lista própria, com travessão e nunca com `0`, FR-093).
 *
 * Dentro de cada grupo, menor percentual geral primeiro. A comparação usa multiplicação
 * cruzada com `Decimal` — `a₁/b₁ < a₂/b₂` ⇔ `a₁·b₂ < a₂·b₁` — exata e sem arredondamento
 * intermediário. Estudante sem desempenho apurado fica no fim do seu grupo: ausência não
 * é o pior desempenho, apenas não é desempenho (Const. I).
 *
 * A função é pura: ordena uma cópia e nunca muta o array recebido. Empates preservam a
 * ordem de entrada, pela estabilidade garantida de `Array.prototype.sort`.
 */
export function sortStudentsByPriority<T extends PrioritizableStudent>(
  students: readonly T[],
): readonly T[] {
  return [...students].sort((a, b) => {
    const porGrupo = groupRank(a) - groupRank(b)
    if (porGrupo !== 0) return porGrupo

    const aPerf = a.performance
    const bPerf = b.performance

    if (aPerf === null || bPerf === null) {
      if (aPerf !== bPerf) return aPerf === null ? 1 : -1
      return 0
    }

    const esquerda = new Decimal(aPerf.acertos).times(bPerf.itens)
    const direita = new Decimal(bPerf.acertos).times(aPerf.itens)
    return esquerda.comparedTo(direita)
  })
}
