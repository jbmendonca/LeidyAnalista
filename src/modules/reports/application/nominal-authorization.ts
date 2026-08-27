import type { LearningLevel, Prisma } from '@prisma/client'

import { prisma } from '@/server/prisma'
import { schoolScopeFilter, type AuthContext } from '@/server/authorization'
import {
  NOME_SUPRIMIDO,
  aplicarSupressaoNominal,
  podeVerNomes,
  rotuloVersaoRelatorio,
} from '@/server/nominal-data'
import type { MaybeFraction } from '@/modules/imports/domain/types'
import type { FiltrosAnalise } from '@/modules/analytics/infra/aggregate-queries'
import { sortStudentsByPriority } from '@/modules/analytics/domain/student-priority'

/**
 * ===========================================================================
 *  AUTORIZAÇÃO NOMINAL DOS RELATÓRIOS — FR-007a, FR-105
 * ===========================================================================
 *
 * A regra de FR-105 é sutil e fácil de implementar errado: quem não tem
 * `canAccessNominalData` **não recebe uma negação**. Recebe o relatório inteiro, com
 * todos os números, com os códigos únicos, e com o nome substituído. Negar seria
 * impedir trabalho legítimo de análise sem proteger nada — o agregado já atende ao
 * propósito.
 *
 * E a supressão acontece **aqui, na consulta**, não na renderização. Um relatório que
 * trafega o nome até o navegador e o esconde com CSS não está suprimido: está exibindo
 * o nome para quem abrir o inspetor, o JSON da resposta ou o CSV. Por isso toda leitura
 * nominal dos relatórios passa por `listarEstudantesDoRecorte`, e `assegurarSupressao`
 * verifica o resultado antes de ele sair do servidor.
 *
 * Escopo de escola é assunto **separado e independente**: `schoolScopeFilter` já resolve
 * quais escolas o requisitante alcança, e escola fora do escopo responde 404 — nunca uma
 * lista silenciosamente reduzida (FR-006).
 */

export type VersaoDoRelatorio = Readonly<{
  nominal: boolean
  rotulo: string
}>

/** Diz ao leitor qual versão ele tem em mãos, e por quê (FR-007a). */
export function versaoDoRelatorio(ctx: AuthContext): VersaoDoRelatorio {
  return { nominal: podeVerNomes(ctx), rotulo: rotuloVersaoRelatorio(ctx) }
}

export type HabilidadeDoEstudante = Readonly<{
  skillId: string
  /** Texto exato da fonte, ex. `"2 / 3"`. `null` quando a célula estava vazia. */
  valorOriginal: string | null
  acertos: number | null
  itensPossiveis: number | null
}>

/**
 * Um estudante no recorte do relatório.
 *
 * `nomeOriginal` já saiu da supressão: quando o requisitante não pode ver nomes, ele
 * vale `NOME_SUPRIMIDO` desde este ponto, e o nome real nunca chega a existir no objeto
 * que os relatórios montam.
 */
export type EstudanteDoRelatorio = Readonly<{
  studentId: string
  uniqueCode: string
  nomeOriginal: string
  classId: string
  turmaNome: string
  turmaCodigo: string
  schoolId: string
  escolaNome: string
  avaliado: boolean
  /** Valor bruto da fonte, intocado (Const. III). */
  nivelOriginal: string
  nivelNormalizado: LearningLevel | null
  /** `null` para não avaliado — jamais `0` (Const. I). */
  acertos: number | null
  itens: number | null
  performance: MaybeFraction
  habilidades: readonly HabilidadeDoEstudante[]
}>

/** Forma da linha lida do banco, antes de virar `EstudanteDoRelatorio`. */
type LinhaSemHabilidades = {
  studentId: string
  classId: string
  schoolId: string
  avaliado: boolean
  nivelOriginal: string
  nivelNormalizado: LearningLevel | null
  acertosTotais: number | null
  itensTotais: number | null
  student: { uniqueCode: string; nomeOriginal: string }
  class: { name: string; externalCode: string }
  school: { name: string }
}

type LinhaDeHabilidade = {
  skillId: string
  valorOriginal: string | null
  acertos: number | null
  itensPossiveis: number | null
}

export type OpcoesListagem = Readonly<{
  /** `true` restringe a avaliados, `false` aos não avaliados, `null` traz os dois. */
  avaliado?: boolean | null
  incluirHabilidades?: boolean
  /** Ordena por prioridade pedagógica (Defasagem → Intermediário → Adequado → ausentes). */
  ordenarPorPrioridade?: boolean
}>

/**
 * Cláusula de escopo e recorte.
 *
 * Espelha `whereBase` de `aggregate-queries` — que é privado — e por isso repete a mesma
 * ordem de decisões, com uma diferença deliberada: `avaliado` **não** entra aqui. Quem
 * chama decide, conscientemente, se quer avaliados, não avaliados ou os dois; um padrão
 * silencioso neste ponto é o defeito que rebaixa turmas inteiras sem erro visível.
 */
function whereDoRecorte(
  ctx: AuthContext,
  f: FiltrosAnalise,
): Prisma.AssessmentStudentResultWhereInput {
  const where: Prisma.AssessmentStudentResultWhereInput = {
    assessmentId: f.assessmentId,
    // O `schoolId` recebido do cliente entra por aqui como FILTRO validado contra o
    // escopo do servidor. Fora dele, esta função lança 404 (FR-006).
    schoolId: schoolScopeFilter(ctx, f.schoolId),
  }

  if (f.classId) where.classId = f.classId
  if (f.studentId) where.studentId = f.studentId
  if (f.nivel) where.nivelNormalizado = f.nivel

  const turma: Prisma.ClassWhereInput = {}
  if (f.anoEscolar) turma.anoEscolar = f.anoEscolar
  if (Object.keys(turma).length > 0) where.class = turma

  const escola: Prisma.SchoolWhereInput = {}
  if (f.rede) escola.rede = f.rede
  if (f.estado) escola.estado = f.estado
  if (f.municipio) escola.municipio = f.municipio
  if (Object.keys(escola).length > 0) where.school = escola

  return where
}

/**
 * Estudantes do recorte, já com escopo aplicado e nomes suprimidos quando for o caso.
 *
 * É o **único** caminho pelo qual os relatórios leem dado nominal. Concentrar aqui é o
 * que permite afirmar, com uma leitura só, que nenhum relatório monta uma consulta
 * própria e esquece a supressão.
 */
export async function listarEstudantesDoRecorte(
  ctx: AuthContext,
  filtros: FiltrosAnalise,
  opcoes: OpcoesListagem = {},
): Promise<readonly EstudanteDoRelatorio[]> {
  const where = whereDoRecorte(ctx, filtros)

  const avaliado = opcoes.avaliado ?? filtros.avaliado ?? null
  if (avaliado !== null) where.avaliado = avaliado

  const orderBy = [
    { class: { name: 'asc' } },
    { student: { nomeNormalizado: 'asc' } },
  ] as const

  const selecao = {
    studentId: true,
    classId: true,
    schoolId: true,
    avaliado: true,
    nivelOriginal: true,
    nivelNormalizado: true,
    acertosTotais: true,
    itensTotais: true,
    student: { select: { uniqueCode: true, nomeOriginal: true } },
    class: { select: { name: true, externalCode: true } },
    school: { select: { name: true } },
  } as const

  // Duas consultas explícitas em vez de um `select` montado por condição: o tipo de
  // retorno do Prisma nasce da forma literal do `select`, e um espalhamento condicional
  // apagaria a garantia de que `skillResults` existe quando foi pedido.
  const linhas: readonly (LinhaSemHabilidades & {
    skillResults: readonly LinhaDeHabilidade[]
  })[] = opcoes.incluirHabilidades
    ? await prisma.assessmentStudentResult.findMany({
        where,
        orderBy: [...orderBy],
        select: {
          ...selecao,
          skillResults: {
            select: {
              skillId: true,
              valorOriginal: true,
              acertos: true,
              itensPossiveis: true,
            },
          },
        },
      })
    : (
        await prisma.assessmentStudentResult.findMany({
          where,
          orderBy: [...orderBy],
          select: selecao,
        })
      ).map((linha) => ({ ...linha, skillResults: [] }))

  const estudantes = linhas.map((linha) => {
    // Guarda dupla: mesmo que a importação tivesse gravado totais para um não avaliado,
    // eles não sairiam daqui como número (Const. I, Const. V).
    const performance: MaybeFraction =
      linha.avaliado &&
      linha.acertosTotais !== null &&
      linha.itensTotais !== null &&
      linha.itensTotais > 0
        ? { acertos: linha.acertosTotais, itens: linha.itensTotais }
        : null

    const habilidades: HabilidadeDoEstudante[] = linha.skillResults.map((r) => ({
      skillId: r.skillId,
      valorOriginal: r.valorOriginal,
      acertos: r.acertos,
      itensPossiveis: r.itensPossiveis,
    }))

    return {
      studentId: linha.studentId,
      uniqueCode: linha.student.uniqueCode,
      nomeOriginal: linha.student.nomeOriginal,
      classId: linha.classId,
      turmaNome: linha.class.name,
      turmaCodigo: linha.class.externalCode,
      schoolId: linha.schoolId,
      escolaNome: linha.school.name,
      avaliado: linha.avaliado,
      nivelOriginal: linha.nivelOriginal,
      nivelNormalizado: linha.avaliado ? linha.nivelNormalizado : null,
      acertos: performance === null ? null : performance.acertos,
      itens: performance === null ? null : performance.itens,
      performance,
      habilidades,
    } satisfies EstudanteDoRelatorio
  })

  // A supressão acontece na fronteira da consulta, antes de qualquer montagem de linha
  // de relatório. Depois deste ponto o nome real não existe mais no processo.
  const suprimidos = aplicarSupressaoNominal(ctx, estudantes)

  return opcoes.ordenarPorPrioridade === true
    ? sortStudentsByPriority(suprimidos)
    : suprimidos
}

/**
 * Trava de saída: nenhum nome de estudante escapa para quem não pode vê-los.
 *
 * Percorre a estrutura pronta procurando chaves `nomeOriginal` cujo valor não seja o
 * marcador de supressão. É barata, roda uma vez por relatório e transforma um eventual
 * caminho de leitura esquecido em falha alta, aqui, em vez de vazamento silencioso no
 * CSV que alguém vai enviar por e-mail.
 */
export function assegurarSupressao(ctx: AuthContext, valor: unknown): void {
  if (podeVerNomes(ctx)) return

  const pendentes: unknown[] = [valor]
  const vistos = new Set<unknown>()

  while (pendentes.length > 0) {
    const atual = pendentes.pop()
    if (atual === null || typeof atual !== 'object') continue
    if (vistos.has(atual)) continue
    vistos.add(atual)

    if (Array.isArray(atual)) {
      pendentes.push(...atual)
      continue
    }

    for (const [chave, conteudo] of Object.entries(atual)) {
      if (chave === 'nomeOriginal' && conteudo !== NOME_SUPRIMIDO) {
        throw new Error(
          'Supressão nominal violada: o relatório carregava nome de estudante para ' +
            'requisitante sem a permissão de dados nominais (FR-007a).',
        )
      }
      pendentes.push(conteudo)
    }
  }
}

export { NOME_SUPRIMIDO }
