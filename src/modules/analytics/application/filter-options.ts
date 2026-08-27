import { prisma } from '@/server/prisma'
import type { AuthContext } from '@/server/authorization'
import { escopoVazio, schoolScopeFilter } from '@/server/authorization'
import { aplicarSupressaoNominal } from '@/server/nominal-data'
import {
  NIVEIS,
  PARTICIPACOES,
  ROTULO_NIVEL,
  ROTULO_PARTICIPACAO,
  ROTULO_SITUACAO,
  SITUACOES,
  type FiltrosPainel,
} from '@/modules/analytics/schemas/filters'

/**
 * ===========================================================================
 *  VALORES DISPONÍVEIS PARA CADA FILTRO — FR-098
 * ===========================================================================
 *
 * **Toda** lista deste arquivo nasce do escopo do usuário. Não existe consulta aqui sem
 * `schoolScopeFilter` ou sem `ctx.allowedSchoolIds` (Const. IV, FR-006).
 *
 * A razão é menos óbvia que a das telas: a lista de opções vaza tanto quanto o dado em si.
 * Um `<select>` de municípios montado a partir de todas as escolas do banco revelaria, a
 * quem só administra uma escola, em que municípios a rede tem escolas — informação que
 * aquele usuário não pode ver. O escopo, portanto, precede também a oferta de filtros.
 *
 * As opções são progressivamente refinadas pelo que já está selecionado: escolhida a escola,
 * só as turmas dela aparecem. Isso evita o recorte impossível — o par escola/turma que nunca
 * devolveria nada e que o usuário leria como "não há dados".
 */

export type Opcao = Readonly<{ valor: string; rotulo: string }>

export type OpcoesDeFiltro = Readonly<{
  avaliacoes: readonly Opcao[]
  redes: readonly Opcao[]
  estados: readonly Opcao[]
  municipios: readonly Opcao[]
  escolas: readonly Opcao[]
  anosEscolares: readonly Opcao[]
  componentesCurriculares: readonly Opcao[]
  turmas: readonly Opcao[]
  codigosTurma: readonly Opcao[]
  participacoes: readonly Opcao[]
  niveis: readonly Opcao[]
  habilidades: readonly Opcao[]
  estudantes: readonly Opcao[]
  situacoes: readonly Opcao[]
  /**
   * Tradução de identificador para nome, usada pela barra ao descrever os filtros ativos.
   * Sem ela o usuário veria `clx3f…` em vez de "4º ano A" e não saberia o que remove.
   */
  rotulosPorValor: Readonly<Record<string, string>>
  /**
   * A lista de estudantes só é oferecida depois de escolhida escola ou turma: o universo
   * inteiro do escopo pode ter milhares de nomes, e um `<select>` desse tamanho é inútil.
   */
  estudantesDisponiveis: boolean
  /** A lista de estudantes foi truncada no limite de exibição. */
  estudantesTruncados: boolean
}>

/** Teto da lista de estudantes. Limite de interface, sem efeito sobre qualquer cálculo. */
const LIMITE_ESTUDANTES = 200

const VAZIO: OpcoesDeFiltro = {
  avaliacoes: [],
  redes: [],
  estados: [],
  municipios: [],
  escolas: [],
  anosEscolares: [],
  componentesCurriculares: [],
  turmas: [],
  codigosTurma: [],
  participacoes: [],
  niveis: [],
  habilidades: [],
  estudantes: [],
  situacoes: [],
  rotulosPorValor: {},
  estudantesDisponiveis: false,
  estudantesTruncados: false,
}

function ordenar(valores: Iterable<string>): readonly Opcao[] {
  return [...new Set(valores)]
    .filter((v) => v.trim().length > 0)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((v) => ({ valor: v, rotulo: v }))
}

/**
 * Avaliações visíveis: as que têm ao menos um resultado numa escola do escopo.
 *
 * Uma avaliação sem nenhum resultado no escopo não é escondida por sigilo — é que não há
 * nada a analisar nela para este usuário, e oferecê-la levaria direto a uma tela vazia.
 */
async function avaliacoesVisiveis(ctx: AuthContext) {
  return prisma.assessment.findMany({
    where: { results: { some: { schoolId: { in: [...ctx.allowedSchoolIds] } } } },
    select: { id: true, nome: true, ano: true, componenteCurricular: true },
    orderBy: [{ ano: 'desc' }, { nome: 'asc' }],
  })
}

/**
 * Avaliação do recorte corrente.
 *
 * Sem escolha explícita, adota a mais recente visível — e devolve **qual** adotou, para que
 * a tela exiba a avaliação em uso em vez de deixar o leitor supor. `null` significa que não
 * há avaliação alguma a analisar no escopo, caso em que a tela mostra estado vazio com
 * orientação, nunca indicadores zerados (FR-099).
 */
export async function resolverAvaliacaoDoRecorte(
  ctx: AuthContext,
  filtros: FiltrosPainel,
): Promise<{
  id: string
  nome: string
  ano: number
  componenteCurricular: string
} | null> {
  if (escopoVazio(ctx)) return null

  const avaliacoes = await avaliacoesVisiveis(ctx)
  if (avaliacoes.length === 0) return null

  if (filtros.avaliacao !== undefined) {
    return avaliacoes.find((a) => a.id === filtros.avaliacao) ?? null
  }
  return avaliacoes[0] ?? null
}

export async function carregarOpcoesDeFiltro(
  ctx: AuthContext,
  filtros: FiltrosPainel,
): Promise<OpcoesDeFiltro> {
  if (escopoVazio(ctx)) return VAZIO

  // `filtros.escola` atravessa `schoolScopeFilter`: fora do escopo, 404 — jamais uma lista
  // silenciosamente reduzida.
  const escopoEscolas = schoolScopeFilter(ctx, filtros.escola ?? null)

  const [avaliacoes, escolas, turmas, habilidades] = await Promise.all([
    avaliacoesVisiveis(ctx),
    prisma.school.findMany({
      where: { id: { in: [...ctx.allowedSchoolIds] } },
      select: { id: true, name: true, rede: true, estado: true, municipio: true },
      orderBy: { name: 'asc' },
    }),
    prisma.class.findMany({
      where: { schoolId: escopoEscolas },
      select: { id: true, name: true, externalCode: true, anoEscolar: true },
      orderBy: [{ anoEscolar: 'asc' }, { name: 'asc' }],
    }),
    filtros.avaliacao === undefined
      ? prisma.skill.findMany({
          select: { id: true, shortCode: true, referenceCode: true, descricao: true },
          orderBy: { ordem: 'asc' },
        })
      : prisma.assessmentSkill
          .findMany({
            where: { assessmentId: filtros.avaliacao },
            select: {
              skill: {
                select: {
                  id: true,
                  shortCode: true,
                  referenceCode: true,
                  descricao: true,
                  ordem: true,
                },
              },
            },
          })
          .then((v) =>
            v.map((x) => x.skill).sort((a, b) => a.ordem - b.ordem),
          ),
  ])

  const escolasDoRecorte = filtros.escola
    ? escolas.filter((e) => e.id === filtros.escola)
    : escolas

  const estudantes = await carregarEstudantes(ctx, filtros, escopoEscolas)

  const rotulosPorValor: Record<string, string> = {}
  for (const a of avaliacoes) rotulosPorValor[a.id] = `${a.nome} (${a.ano})`
  for (const e of escolas) rotulosPorValor[e.id] = e.name
  for (const t of turmas) rotulosPorValor[t.id] = `${t.name} — ${t.externalCode}`
  for (const h of habilidades) rotulosPorValor[h.id] = `${h.shortCode} — ${h.referenceCode}`
  for (const e of estudantes.lista) rotulosPorValor[e.valor] = e.rotulo

  return {
    avaliacoes: avaliacoes.map((a) => ({
      valor: a.id,
      rotulo: `${a.nome} (${a.ano}) — ${a.componenteCurricular}`,
    })),
    redes: ordenar(escolasDoRecorte.map((e) => e.rede)),
    estados: ordenar(escolasDoRecorte.map((e) => e.estado)),
    municipios: ordenar(escolasDoRecorte.map((e) => e.municipio)),
    escolas: escolas.map((e) => ({
      valor: e.id,
      rotulo: `${e.name} — ${e.municipio}/${e.estado}`,
    })),
    anosEscolares: ordenar(turmas.map((t) => t.anoEscolar)),
    componentesCurriculares: ordenar(avaliacoes.map((a) => a.componenteCurricular)),
    turmas: turmas.map((t) => ({
      valor: t.id,
      rotulo: `${t.name} — ${t.externalCode}`,
    })),
    codigosTurma: ordenar(turmas.map((t) => t.externalCode)),
    participacoes: PARTICIPACOES.map((p) => ({
      valor: p,
      rotulo: ROTULO_PARTICIPACAO[p],
    })),
    niveis: NIVEIS.map((n) => ({ valor: n, rotulo: ROTULO_NIVEL[n] })),
    habilidades: habilidades.map((h) => ({
      valor: h.id,
      rotulo: `${h.shortCode} — ${h.referenceCode}`,
    })),
    estudantes: estudantes.lista,
    situacoes: SITUACOES.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s] })),
    rotulosPorValor,
    estudantesDisponiveis: estudantes.disponivel,
    estudantesTruncados: estudantes.truncado,
  }
}

/**
 * Estudantes ofertáveis como filtro.
 *
 * O nome passa por `aplicarSupressaoNominal` **aqui**, antes de sair da consulta: uma opção
 * de `<select>` é conteúdo enviado ao navegador como qualquer outro, e esconder o rótulo na
 * renderização deixaria o nome trafegar mesmo assim (FR-007).
 */
async function carregarEstudantes(
  ctx: AuthContext,
  filtros: FiltrosPainel,
  escopoEscolas: { in: string[] },
): Promise<{ lista: readonly Opcao[]; disponivel: boolean; truncado: boolean }> {
  const recorteEstreito = Boolean(filtros.escola ?? filtros.turma)
  if (!recorteEstreito) return { lista: [], disponivel: false, truncado: false }

  const registros = await prisma.student.findMany({
    where: {
      schoolId: escopoEscolas,
      active: true,
      ...(filtros.turma ? { classId: filtros.turma } : {}),
    },
    select: {
      id: true,
      uniqueCode: true,
      nomeOriginal: true,
      class: { select: { externalCode: true } },
    },
    orderBy: { nomeNormalizado: 'asc' },
    take: LIMITE_ESTUDANTES + 1,
  })

  const truncado = registros.length > LIMITE_ESTUDANTES
  const visiveis = aplicarSupressaoNominal(ctx, registros.slice(0, LIMITE_ESTUDANTES))

  return {
    lista: visiveis.map((e) => ({
      valor: e.id,
      rotulo: `${e.nomeOriginal} — ${e.uniqueCode} (${e.class.externalCode})`,
    })),
    disponivel: true,
    truncado,
  }
}
