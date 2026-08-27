import type { Tx } from '@/server/prisma'

/**
 * Apura e persiste o denominador de referência de cada habilidade da
 * avaliação — FR-155, FR-160, FR-161.
 *
 * O valor NASCE dos dados: é o denominador mais frequente entre os resultados
 * já importados. Empate adota o maior e marca a ocorrência, para que a escolha
 * nunca seja arbitrária nem silenciosa.
 *
 * Nenhuma quantidade de itens é constante no código (FR-016). Recalcular é
 * obrigatório sempre que uma importação é acrescentada ou excluída.
 */
export async function recalcularDenominadoresDeReferencia(
  tx: Tx,
  assessmentId: string,
): Promise<void> {
  const linhas = await tx.studentSkillResult.groupBy({
    by: ['skillId', 'itensPossiveis'],
    where: {
      result: { assessmentId },
      acertos: { not: null },
      itensPossiveis: { not: null },
    },
    _count: { _all: true },
  })

  const porHabilidade = new Map<string, { itens: number; freq: number }[]>()
  for (const l of linhas) {
    if (l.itensPossiveis === null) continue
    porHabilidade.set(l.skillId, [
      ...(porHabilidade.get(l.skillId) ?? []),
      { itens: l.itensPossiveis, freq: l._count._all },
    ])
  }

  // Habilidades sem nenhum resultado deixam de ter denominador de referência:
  // não há o que apurar, e manter um valor antigo seria inventar dado.
  await tx.assessmentSkill.deleteMany({
    where: { assessmentId, skillId: { notIn: [...porHabilidade.keys()] } },
  })

  for (const [skillId, ocorrencias] of porHabilidade) {
    const maiorFreq = Math.max(...ocorrencias.map((o) => o.freq))
    const empatados = ocorrencias.filter((o) => o.freq === maiorFreq)
    const referenceItems = Math.max(...empatados.map((o) => o.itens))

    await tx.assessmentSkill.upsert({
      where: { assessmentId_skillId: { assessmentId, skillId } },
      update: {
        referenceItems,
        referenceItemsTiebreak: empatados.length > 1,
        recalculatedAt: new Date(),
      },
      create: {
        assessmentId,
        skillId,
        referenceItems,
        referenceItemsTiebreak: empatados.length > 1,
      },
    })
  }
}
