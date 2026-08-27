import { Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import {
  requireRole,
  schoolScopeFilter,
  type AuthContext,
} from '@/server/authorization'
import { naoEncontrado } from '@/server/http-errors'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { toPercent } from '@/lib/decimal'
import { calculateStudentPerformance } from '@/modules/analytics/domain/student-performance'
import type { MaybeFraction } from '@/modules/imports/domain/types'

/**
 * ===========================================================================
 *  REPROCESSAMENTO DE INDICADORES — FR-119, FR-113, FR-164, Const. I e II
 * ===========================================================================
 *
 * O que esta rotina faz: recalcula `acertosTotais`, `itensTotais` e `percentualGeral` de
 * `AssessmentStudentResult` **a partir dos `StudentSkillResult` já armazenados**. É a
 * reconstrução do agregado sobre o dado que está no banco, para o caso em que um total tenha
 * divergido da soma das suas parcelas.
 *
 * O que esta rotina NÃO faz, e não pode passar a fazer:
 *
 *  - não lê arquivo, não reinterpreta célula, não toca em `valorOriginal`, `acertos` nem
 *    `itensPossiveis` de `StudentSkillResult` (FR-119). O `update` abaixo escreve em três
 *    colunas e só nelas;
 *  - não toca em `nivelOriginal` nem em `nivelNormalizado` (Const. III, FR-113). O nível da
 *    fonte é transcrito, jamais inferido, e reprocessar não é ocasião para inferi-lo;
 *  - não reclassifica faixa analítica, porque não existe faixa armazenada: Fragilidade /
 *    Atenção / Satisfatório são derivadas na leitura por `classifyAnalyticalSkillResult`.
 *    **Alterar os critérios em `AnalyticalSettings` não exige reprocessamento algum** — a
 *    consulta seguinte já responde com os limites novos.
 *
 * E a regra que o banco também cobra: estudante com `avaliado = false` mantém os três campos
 * `NULL`. Zero ali seria a distorção que o produto existe para evitar (Const. I, FR-059), e
 * a CHECK constraint `asr_nao_avaliado_sem_desempenho` recusaria qualquer outra coisa.
 */

export type RelatorioReprocessamento = Readonly<{
  assessmentId: string
  /** Quantos resultados foram examinados, avaliados ou não. */
  examinados: number
  /** Quantos tiveram algum dos três totais corrigido. Zero é o desfecho esperado. */
  atualizados: number
  /** Não avaliados, cujos totais permanecem NULL por definição. */
  naoAvaliados: number
  /** Avaliados sem nenhuma habilidade com resultado — totais também NULL, nunca zero. */
  avaliadosSemResultado: number
}>

type ResultadoParaRecalculo = {
  id: string
  avaliado: boolean
  acertosTotais: number | null
  itensTotais: number | null
  percentualGeral: Prisma.Decimal | null
  skillResults: { acertos: number | null; itensPossiveis: number | null }[]
}

type TotaisRecalculados = {
  acertosTotais: number | null
  itensTotais: number | null
  percentualGeral: Prisma.Decimal | null
}

/** Literal de 4 casas, ou `null`. Serve para comparar sem envolver ponto flutuante. */
function literal(valor: Prisma.Decimal | null): string | null {
  return valor === null ? null : valor.toFixed(4)
}

/**
 * Totais a partir das parcelas já armazenadas.
 *
 * Delega a soma a `calculateStudentPerformance`, a mesma função de domínio usada em toda a
 * leitura: célula ausente é ignorada, jamais somada como zero, e o retorno é a fração — a
 * divisão fica com `toPercent`, na borda. Média de percentuais não acontece em ponto algum
 * (Const. II, FR-058).
 */
export function recalcularTotais(resultado: {
  avaliado: boolean
  skillResults: readonly { acertos: number | null; itensPossiveis: number | null }[]
}): TotaisRecalculados {
  const VAZIO: TotaisRecalculados = {
    acertosTotais: null,
    itensTotais: null,
    percentualGeral: null,
  }

  // FR-059: o não avaliado fica fora de todo denominador de desempenho. Nem sequer
  // olhamos as parcelas dele.
  if (!resultado.avaliado) return VAZIO

  const fracoes: MaybeFraction[] = resultado.skillResults.map((r) =>
    r.acertos === null || r.itensPossiveis === null || r.itensPossiveis <= 0
      ? null
      : { acertos: r.acertos, itens: r.itensPossiveis },
  )

  const total = calculateStudentPerformance(fracoes)
  if (total === null) return VAZIO

  const percentual = toPercent(total)

  return {
    acertosTotais: total.acertos,
    itensTotais: total.itens,
    percentualGeral:
      percentual === null ? null : new Prisma.Decimal(percentual.toFixed(4)),
  }
}

const LOTE = 500

/**
 * Reprocessa os indicadores de uma avaliação.
 *
 * Restrito ao Administrador: é operação de manutenção sobre a base inteira, e o escopo por
 * escola de `schoolScopeFilter` continua aplicado por precaução — nenhuma consulta deste
 * sistema deve ignorar o recorte, ainda que o perfil o torne total.
 */
export async function reprocessarAvaliacao(
  ctx: AuthContext,
  assessmentId: string,
): Promise<RelatorioReprocessamento> {
  const autor = requireRole(ctx, 'ADMIN')
  const escopo = schoolScopeFilter(autor)

  const avaliacao = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true },
  })
  if (!avaliacao) throw naoEncontrado('Avaliação')

  let examinados = 0
  let naoAvaliados = 0
  let avaliadosSemResultado = 0
  const pendentes: { id: string; totais: TotaisRecalculados }[] = []

  let cursor: string | null = null

  // Paginação por cursor: a leitura completa de uma avaliação grande não cabe
  // confortavelmente em memória junto com as parcelas de cada estudante.
  for (;;) {
    const pagina: ResultadoParaRecalculo[] =
      await prisma.assessmentStudentResult.findMany({
        where: { assessmentId, schoolId: { in: [...escopo.in] } },
        orderBy: { id: 'asc' },
        take: LOTE,
        ...(cursor === null ? {} : { skip: 1, cursor: { id: cursor } }),
        select: {
          id: true,
          avaliado: true,
          acertosTotais: true,
          itensTotais: true,
          percentualGeral: true,
          skillResults: { select: { acertos: true, itensPossiveis: true } },
        },
      })

    if (pagina.length === 0) break

    for (const resultado of pagina) {
      examinados += 1
      if (!resultado.avaliado) naoAvaliados += 1

      const totais = recalcularTotais(resultado)

      if (resultado.avaliado && totais.itensTotais === null) avaliadosSemResultado += 1

      const mudou =
        totais.acertosTotais !== resultado.acertosTotais ||
        totais.itensTotais !== resultado.itensTotais ||
        literal(totais.percentualGeral) !== literal(resultado.percentualGeral)

      if (mudou) pendentes.push({ id: resultado.id, totais })
    }

    const ultimo = pagina[pagina.length - 1]
    if (!ultimo || pagina.length < LOTE) break
    cursor = ultimo.id
  }

  // Escrita e auditoria na MESMA transação (Const. IV): auditoria gravada fora dela
  // sobreviveria a um rollback e descreveria um reprocessamento que não aconteceu.
  await prisma.$transaction(
    async (tx) => {
      for (const pendente of pendentes) {
        await tx.assessmentStudentResult.update({
          where: { id: pendente.id },
          // Exatamente três colunas. Nenhum valor importado é alcançável por este `data`.
          data: {
            acertosTotais: pendente.totais.acertosTotais,
            itensTotais: pendente.totais.itensTotais,
            percentualGeral: pendente.totais.percentualGeral,
          },
        })
      }

      await registrarAuditoria(tx, {
        action: 'REPROCESS',
        userId: autor.userId,
        entityType: 'Assessment',
        entityId: assessmentId,
        assessmentId,
        afterValue: {
          examinados,
          atualizados: pendentes.length,
          naoAvaliados,
          avaliadosSemResultado,
        },
        metadata: {
          operacao: 'REPROCESSAR_TOTAIS',
          origem: 'STUDENT_SKILL_RESULT',
          camposEscritos: ['acertosTotais', 'itensTotais', 'percentualGeral'],
          valoresImportadosPreservados: true,
        },
      })
    },
    { maxWait: 15_000, timeout: 120_000 },
  )

  return {
    assessmentId,
    examinados,
    atualizados: pendentes.length,
    naoAvaliados,
    avaliadosSemResultado,
  }
}
