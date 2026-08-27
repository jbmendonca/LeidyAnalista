import { Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { requireRole, type AuthContext } from '@/server/authorization'
import { conflito } from '@/server/http-errors'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import type { EntradaCriterios } from '@/modules/settings/schemas'

/**
 * ===========================================================================
 *  NOVA VERSÃO DE CRITÉRIOS ANALÍTICOS — FR-163, FR-164, FR-113, FR-117
 * ===========================================================================
 *
 * **`AnalyticalSettings` nunca sofre UPDATE.** Não existe neste módulo — nem pode passar a
 * existir — uma chamada a `analyticalSettings.update` ou `.upsert`. Cada alteração INSERE uma
 * versão nova, com `version` incremental, `effectiveFrom` e `createdByUserId`. É isso que faz
 * o histórico de FR-165 ser um fato do banco e não uma cópia mantida à parte: um relatório
 * emitido no ano passado continua explicável porque a versão que o gerou ainda está lá,
 * intacta.
 *
 * **Alterar as faixas não reprocessa nada, e não deveria.** A classificação analítica
 * (Fragilidade / Atenção / Satisfatório) é derivada na LEITURA, por
 * `classifyAnalyticalSkillResult`, a partir de `acertos` e `itensPossiveis` armazenados. Não
 * há coluna de faixa em lugar nenhum do schema. Trocar os limites muda o que a próxima
 * consulta responde — e não toca em `valorOriginal`, `acertos`, `itensPossiveis`,
 * `nivelOriginal` nem `nivelNormalizado` (FR-113, FR-164). Qualquer rotina de
 * "reclassificação em massa" adicionada aqui seria, além de inútil, uma porta de escrita
 * sobre o dado importado.
 *
 * Este arquivo NÃO é `'use server'`: recebe `AuthContext` por parâmetro e por isso não pode
 * morar do outro lado daquela fronteira (ver `settings-actions.ts`).
 */

const ENTIDADE = 'AnalyticalSettings'

export type VersaoCriada = Readonly<{ id: string; version: number }>

/** Recorte da versão que vai para a auditoria. Só valores; nenhum dado de pessoa. */
function paraAuditoria(v: {
  version: number
  fragilidadeMax: string
  atencaoMax: string
  baixoRendimento: readonly string[]
  abaixoDoAdequadoHabilitado: boolean
  effectiveFrom: Date
}): Prisma.InputJsonValue {
  return {
    version: v.version,
    fragilidadeMax: v.fragilidadeMax,
    atencaoMax: v.atencaoMax,
    baixoRendimento: [...v.baixoRendimento],
    abaixoDoAdequadoHabilitado: v.abaixoDoAdequadoHabilitado,
    effectiveFrom: v.effectiveFrom.toISOString(),
  }
}

/**
 * Registra uma nova versão dos critérios analíticos.
 *
 * A configuração é GLOBAL (FR-162, FR-167): não há parâmetro de escola nem de avaliação, e a
 * ausência deles é a garantia de que dois "Fragilidade" do sistema significam a mesma coisa.
 *
 * `effectiveFrom` permite registrar uma vigência futura — a versão fica gravada e só passa a
 * valer na data marcada, porque `lerConfiguracaoVigente` descarta `effectiveFrom` no futuro.
 * A tela grava sempre com o instante da gravação; o parâmetro existe para uso programático.
 */
export async function criarVersaoDeCriterios(
  ctx: AuthContext,
  entrada: EntradaCriterios,
  effectiveFrom: Date = new Date(),
): Promise<VersaoCriada> {
  const autor = requireRole(ctx, 'ADMIN')

  try {
    return await prisma.$transaction(async (tx) => {
      // Última versão pelo número, não pela vigência: `version` é um contador de
      // registros e precisa crescer mesmo quando se agenda uma vigência retroativa.
      const ultima = await tx.analyticalSettings.findFirst({
        orderBy: { version: 'desc' },
        select: {
          version: true,
          fragilidadeMax: true,
          atencaoMax: true,
          baixoRendimento: true,
          abaixoDoAdequadoHabilitado: true,
          effectiveFrom: true,
        },
      })

      const criada = await tx.analyticalSettings.create({
        data: {
          version: (ultima?.version ?? 0) + 1,
          fragilidadeMax: entrada.fragilidadeMax,
          atencaoMax: entrada.atencaoMax,
          baixoRendimento: [...entrada.baixoRendimento],
          abaixoDoAdequadoHabilitado: entrada.abaixoDoAdequadoHabilitado,
          effectiveFrom,
          createdByUserId: autor.userId,
        },
        select: { id: true, version: true },
      })

      await registrarAuditoria(tx, {
        action: 'SETTINGS_CHANGE',
        userId: autor.userId,
        entityType: ENTIDADE,
        entityId: criada.id,
        // Configuração é global: sem escola e sem avaliação, por definição (FR-167).
        schoolId: null,
        assessmentId: null,
        ...(ultima
          ? {
              beforeValue: paraAuditoria({
                version: ultima.version,
                fragilidadeMax: ultima.fragilidadeMax.toFixed(2),
                atencaoMax: ultima.atencaoMax.toFixed(2),
                baixoRendimento: ultima.baixoRendimento,
                abaixoDoAdequadoHabilitado: ultima.abaixoDoAdequadoHabilitado,
                effectiveFrom: ultima.effectiveFrom,
              }),
            }
          : {}),
        afterValue: paraAuditoria({
          version: criada.version,
          fragilidadeMax: entrada.fragilidadeMax,
          atencaoMax: entrada.atencaoMax,
          baixoRendimento: entrada.baixoRendimento,
          abaixoDoAdequadoHabilitado: entrada.abaixoDoAdequadoHabilitado,
          effectiveFrom,
        }),
        metadata: {
          operacao: 'NOVA_VERSAO',
          escopo: 'GLOBAL',
          // Deixa registrado, no próprio fato auditado, que nada foi reescrito.
          reprocessamento: 'NAO_APLICAVEL',
          observacao:
            'Faixas analíticas são derivadas na leitura; nenhum valor importado foi alterado.',
        },
      })

      return criada
    })
  } catch (erro) {
    // `version` é único. Duas gravações simultâneas disputam o mesmo número: a perdedora
    // precisa falhar visivelmente, e não sobrescrever a vencedora.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw conflito(
        'Outra alteração de critérios foi gravada ao mesmo tempo. Recarregue a página e revise antes de gravar de novo.',
      )
    }
    throw erro
  }
}
