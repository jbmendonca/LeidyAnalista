import { z } from 'zod'

import { prisma } from '@/server/prisma'
import {
  assertSchoolInScope,
  requireUser,
  schoolScopeFilter,
  type AuthContext,
} from '@/server/authorization'
import { entradaInvalida, naoEncontrado } from '@/server/http-errors'
import { logger } from '@/server/logger'
import { registrarAuditoriaAvulsa } from '@/modules/audit/infra/audit-repository'
import type { FiltrosAnalise } from '@/modules/analytics/infra/aggregate-queries'
import type { RankCriterion } from '@/modules/analytics/domain/rank-skills'
import { normalizarCriterio } from '@/modules/analytics/application/assessment-dashboard'
import {
  carregarFaixasAnaliticas,
  type FaixasVigentes,
} from '@/modules/analytics/application/heatmap'
import {
  montarCabecalhoRelatorio,
  nomeDeArquivo,
  normalizarTipoRelatorio,
  type CabecalhoRelatorio,
  type RecorteDeFiltro,
  type RelatorioMontado,
  type TipoRelatorio,
} from '@/modules/reports/domain/report-header'
import {
  listarEstudantesDoRecorte,
  versaoDoRelatorio,
  type EstudanteDoRelatorio,
  type VersaoDoRelatorio,
} from './nominal-authorization'
import { montarRelatorioGeral } from './general-report'
import { montarRelatorioDaEscola } from './school-report'
import { montarRelatorioDaTurma } from './class-report'
import { montarRelatorioDaHabilidade } from './skill-report'
import { montarRelatorioIndividual } from './student-report'

/**
 * ===========================================================================
 *  RECORTE E ESCOPO DOS RELATÓRIOS — FR-101, FR-104, FR-106
 * ===========================================================================
 *
 * Duas ideias que parecem a mesma e não são, e que este arquivo mantém separadas do
 * começo ao fim:
 *
 *  - **Filtro** é o recorte que o usuário pediu — esta escola, esta turma, este ano
 *    escolar. Vem da tela, viaja na barra de endereços e chega aqui como texto.
 *  - **Escopo** é o conjunto de escolas que aquele usuário pode ver. Vem do banco, foi
 *    resolvido no servidor a partir da sessão e não é negociável.
 *
 * O `schoolId` que chega do cliente é sempre a primeira coisa, e ele entra pelo
 * `assertSchoolInScope`: dentro do escopo vira filtro; fora dele responde **404**, nunca
 * uma lista silenciosamente encolhida e nunca 403 — que confirmaria a existência da
 * escola a quem não pode vê-la (FR-006, FR-104).
 *
 * O escopo resolvido aqui é o mesmo objeto `FiltrosAnalise` que a tela usa. É por isso
 * que os números do relatório coincidem com os da tela (FR-107): não existe um segundo
 * recorte, existe o mesmo recorte atravessando as mesmas agregações.
 */

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Campo de formulário vazio significa "sem filtro", não "filtrar por vazio". */
const filtroOpcional = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((valor) => {
    const limpo = (valor ?? '').trim()
    return limpo.length === 0 ? null : limpo
  })

const NIVEIS = ['ADEQUADO', 'INTERMEDIARIO', 'DEFASAGEM'] as const

const nivelOpcional = filtroOpcional.transform((valor) => {
  if (valor === null) return null
  const encontrado = NIVEIS.find((n) => n === valor.toUpperCase())
  return encontrado ?? null
})

export const filtrosRelatorioSchema = z.object({
  assessmentId: z
    .string({ required_error: 'Selecione a avaliação.' })
    .trim()
    .min(1, 'Selecione a avaliação.'),
  schoolId: filtroOpcional,
  classId: filtroOpcional,
  skillId: filtroOpcional,
  studentId: filtroOpcional,
  anoEscolar: filtroOpcional,
  rede: filtroOpcional,
  estado: filtroOpcional,
  municipio: filtroOpcional,
  nivel: nivelOpcional,
  criterio: filtroOpcional,
})

export type EntradaRelatorio = z.input<typeof filtrosRelatorioSchema>

const CHAVES_DE_ENTRADA = [
  'assessmentId',
  'schoolId',
  'classId',
  'skillId',
  'studentId',
  'anoEscolar',
  'rede',
  'estado',
  'municipio',
  'nivel',
  'criterio',
] as const

/**
 * Converte a query string em entrada do relatório.
 *
 * Ponto único de leitura da URL — usado pelas duas rotas de exportação e pela folha de
 * impressão, para que os três caminhos partam literalmente do mesmo recorte. Se cada um
 * lesse os seus parâmetros, bastaria um esquecer `anoEscolar` para que o PDF e o CSV da
 * mesma tela divergissem (FR-101).
 */
export function entradaDeQuery(parametros: URLSearchParams): EntradaRelatorio {
  const entrada: Record<string, string | null> = {}
  for (const chave of CHAVES_DE_ENTRADA) {
    entrada[chave] = parametros.get(chave)
  }
  return entrada as EntradaRelatorio
}

/** Mesma leitura, a partir dos `searchParams` de uma página do App Router. */
export function entradaDeSearchParams(
  parametros: Record<string, string | string[] | undefined>,
): EntradaRelatorio {
  const primeiro = (valor: string | string[] | undefined): string | null => {
    if (Array.isArray(valor)) return valor[0] ?? null
    return valor ?? null
  }

  const entrada: Record<string, string | null> = {}
  for (const chave of CHAVES_DE_ENTRADA) {
    entrada[chave] = primeiro(parametros[chave])
  }
  return entrada as EntradaRelatorio
}

/** Devolve o recorte como query string, para montar os links de exportação da tela. */
export function queryDoRecorte(entrada: EntradaRelatorio): string {
  const parametros = new URLSearchParams()
  for (const chave of CHAVES_DE_ENTRADA) {
    const valor = entrada[chave]
    if (typeof valor === 'string' && valor.trim() !== '') {
      parametros.set(chave, valor.trim())
    }
  }
  return parametros.toString()
}

// ---------------------------------------------------------------------------
// Escopo resolvido
// ---------------------------------------------------------------------------

export type AvaliacaoDoRelatorio = Readonly<{
  id: string
  nome: string
  ano: number
  ciclo: string
  componenteCurricular: string
  dataAplicacao: Date | null
}>

export type EscolaDoRelatorio = Readonly<{
  id: string
  code: string
  name: string
  rede: string
  municipio: string
  estado: string
  totalTurmas: number
  totalEstudantes: number
}>

export type TurmaDoRelatorio = Readonly<{
  id: string
  name: string
  externalCode: string
  anoEscolar: string
  schoolId: string
  escolaNome: string
  escolaCodigo: string
}>

export type HabilidadeDoRelatorio = Readonly<{
  id: string
  shortCode: string
  referenceCode: string
  descricao: string
  /**
   * Denominador de referência apurado sobre os dados importados (FR-015, FR-016).
   * `null` quando a avaliação ainda não tem resultado para a habilidade — jamais uma
   * constante de código.
   */
  referenceItems: number | null
  referenceItemsTiebreak: boolean
}>

export type EscopoRelatorio = Readonly<{
  ctx: AuthContext
  tipo: TipoRelatorio
  filtros: FiltrosAnalise
  avaliacao: AvaliacaoDoRelatorio
  escola: EscolaDoRelatorio | null
  turma: TurmaDoRelatorio | null
  habilidade: HabilidadeDoRelatorio | null
  /** Já com a supressão nominal aplicada na consulta (FR-007a). */
  estudante: EstudanteDoRelatorio | null
  faixas: FaixasVigentes
  criterio: RankCriterion
  recorte: readonly RecorteDeFiltro[]
  cabecalho: CabecalhoRelatorio
  versao: VersaoDoRelatorio
  geradoEm: Date
}>

const PARAMETRO_OBRIGATORIO: Partial<Record<TipoRelatorio, keyof EntradaRelatorio>> = {
  escola: 'schoolId',
  turma: 'classId',
  habilidade: 'skillId',
  individual: 'studentId',
}

const MENSAGEM_OBRIGATORIO: Readonly<Record<string, string>> = {
  schoolId: 'Selecione a escola do relatório.',
  classId: 'Selecione a turma do relatório.',
  skillId: 'Selecione a habilidade do relatório.',
  studentId: 'Selecione o estudante do relatório.',
}

/**
 * Resolve avaliação, escopo de escola e recorte de filtros de um relatório.
 *
 * A ordem das checagens é deliberada: a autorização de escola acontece **antes** de
 * qualquer leitura de resultado. Uma turma de outra rede nunca chega à memória do
 * processo — não é lida e depois descartada, é filtrada na cláusula da consulta.
 */
export async function resolverEscopoRelatorio(
  ctx: AuthContext,
  tipo: TipoRelatorio,
  entrada: unknown,
): Promise<EscopoRelatorio> {
  requireUser(ctx)

  const analise = filtrosRelatorioSchema.safeParse(entrada)
  if (!analise.success) {
    throw entradaInvalida(analise.error.flatten().fieldErrors as Record<string, string[]>)
  }
  const f = analise.data

  const exigido = PARAMETRO_OBRIGATORIO[tipo]
  if (exigido && f[exigido] === null) {
    throw entradaInvalida({
      [exigido]: [MENSAGEM_OBRIGATORIO[exigido] ?? 'Parâmetro obrigatório ausente.'],
    })
  }

  const avaliacao = await prisma.assessment.findUnique({
    where: { id: f.assessmentId },
    select: {
      id: true,
      nome: true,
      ano: true,
      ciclo: true,
      componenteCurricular: true,
      dataAplicacao: true,
    },
  })
  if (!avaliacao) throw naoEncontrado('Avaliação')

  const escopo = schoolScopeFilter(ctx)
  const recorte: RecorteDeFiltro[] = []

  // ---- Turma: a escola do relatório passa a ser a da turma ------------------
  let turma: TurmaDoRelatorio | null = null
  if (f.classId) {
    const registro = await prisma.class.findFirst({
      where: { id: f.classId, schoolId: { in: [...escopo.in] } },
      select: {
        id: true,
        name: true,
        externalCode: true,
        anoEscolar: true,
        schoolId: true,
        school: { select: { name: true, code: true } },
      },
    })
    if (!registro) throw naoEncontrado('Turma')
    turma = {
      id: registro.id,
      name: registro.name,
      externalCode: registro.externalCode,
      anoEscolar: registro.anoEscolar,
      schoolId: registro.schoolId,
      escolaNome: registro.school.name,
      escolaCodigo: registro.school.code,
    }
  }

  // ---- Estudante: idem, a escola do relatório é a dele ---------------------
  let estudanteBruto: { id: string; schoolId: string; classId: string } | null = null
  if (f.studentId) {
    const registro = await prisma.student.findFirst({
      where: { id: f.studentId, schoolId: { in: [...escopo.in] } },
      select: { id: true, schoolId: true, classId: true },
    })
    if (!registro) throw naoEncontrado('Estudante')
    estudanteBruto = registro
  }

  // O `schoolId` explícito ainda é validado, mesmo quando turma ou estudante já
  // definiram a escola: recusar o pedido incoerente é melhor que atendê-lo em silêncio.
  const schoolIdSolicitado = f.schoolId
  if (schoolIdSolicitado) assertSchoolInScope(ctx, schoolIdSolicitado)

  const schoolIdEfetivo =
    turma?.schoolId ?? estudanteBruto?.schoolId ?? schoolIdSolicitado ?? null

  let escola: EscolaDoRelatorio | null = null
  if (schoolIdEfetivo) {
    const registro = await prisma.school.findFirst({
      where: { id: assertSchoolInScope(ctx, schoolIdEfetivo) },
      select: {
        id: true,
        code: true,
        name: true,
        rede: true,
        municipio: true,
        estado: true,
        _count: { select: { classes: true, students: true } },
      },
    })
    if (!registro) throw naoEncontrado('Escola')
    escola = {
      id: registro.id,
      code: registro.code,
      name: registro.name,
      rede: registro.rede,
      municipio: registro.municipio,
      estado: registro.estado,
      totalTurmas: registro._count.classes,
      totalEstudantes: registro._count.students,
    }
  }

  // ---- Habilidade: o denominador vem de AssessmentSkill, nunca do código ---
  let habilidade: HabilidadeDoRelatorio | null = null
  if (f.skillId) {
    const registro = await prisma.skill.findUnique({
      where: { id: f.skillId },
      select: { id: true, shortCode: true, referenceCode: true, descricao: true },
    })
    if (!registro) throw naoEncontrado('Habilidade')

    const daAvaliacao = await prisma.assessmentSkill.findUnique({
      where: {
        assessmentId_skillId: { assessmentId: avaliacao.id, skillId: registro.id },
      },
      select: { referenceItems: true, referenceItemsTiebreak: true },
    })

    habilidade = {
      ...registro,
      referenceItems: daAvaliacao?.referenceItems ?? null,
      referenceItemsTiebreak: daAvaliacao?.referenceItemsTiebreak ?? false,
    }
  }

  const filtros: FiltrosAnalise = {
    assessmentId: avaliacao.id,
    schoolId: schoolIdEfetivo,
    classId: turma?.id ?? null,
    studentId: estudanteBruto?.id ?? null,
    anoEscolar: f.anoEscolar,
    rede: f.rede,
    estado: f.estado,
    municipio: f.municipio,
    nivel: f.nivel,
  }

  // ---- Estudante identificado, já suprimido na consulta -------------------
  let estudante: EstudanteDoRelatorio | null = null
  if (estudanteBruto) {
    const encontrados = await listarEstudantesDoRecorte(ctx, filtros, {
      incluirHabilidades: true,
    })
    estudante = encontrados[0] ?? null
    if (!estudante) throw naoEncontrado('Resultado do estudante')
  }

  // ---- Recorte legível, para o cabeçalho (FR-100, FR-106) ------------------
  if (escola) recorte.push({ rotulo: 'Escola', valor: escola.name })
  if (turma) {
    recorte.push({ rotulo: 'Turma', valor: `${turma.name} (${turma.externalCode})` })
  }
  if (habilidade) {
    recorte.push({
      rotulo: 'Habilidade',
      valor: `${habilidade.shortCode} — ${habilidade.referenceCode}`,
    })
  }
  if (estudante) {
    // Identificado pelo código único, jamais pelo nome: o cabeçalho circula em CSV e em
    // papel, e o código identifica sem revelar (FR-131).
    recorte.push({ rotulo: 'Estudante', valor: `código ${estudante.uniqueCode}` })
  }
  if (f.anoEscolar) recorte.push({ rotulo: 'Ano escolar', valor: f.anoEscolar })
  if (f.rede) recorte.push({ rotulo: 'Rede', valor: f.rede })
  if (f.estado) recorte.push({ rotulo: 'Estado', valor: f.estado })
  if (f.municipio) recorte.push({ rotulo: 'Município', valor: f.municipio })
  if (f.nivel) recorte.push({ rotulo: 'Nível de aprendizagem', valor: f.nivel })

  const faixas = await carregarFaixasAnaliticas()
  const versao = versaoDoRelatorio(ctx)
  const geradoEm = new Date()

  const cabecalho = montarCabecalhoRelatorio({
    tipo,
    avaliacao,
    escola: escola
      ? {
          nome: escola.name,
          codigo: escola.code,
          municipio: escola.municipio,
          estado: escola.estado,
        }
      : null,
    recorte,
    configuracao: {
      versao: faixas.version,
      fragilidadeMaxTexto: faixas.fragilidadeMaxTexto,
      atencaoMaxTexto: faixas.atencaoMaxTexto,
    },
    geradoEm,
    solicitante: { userId: ctx.userId, papel: ctx.role },
    versaoNominal: versao.nominal,
    rotuloVersao: versao.rotulo,
  })

  return {
    ctx,
    tipo,
    filtros,
    avaliacao,
    escola,
    turma,
    habilidade,
    estudante,
    faixas,
    criterio: normalizarCriterio(f.criterio),
    recorte,
    cabecalho,
    versao,
    geradoEm,
  }
}

// ---------------------------------------------------------------------------
// Despacho
// ---------------------------------------------------------------------------

/**
 * Monta o relatório do tipo pedido.
 *
 * O despacho vive aqui, e não em cada rota, porque CSV, XLSX e a folha de impressão
 * precisam produzir **o mesmo documento** — é a condição de FR-107 continuar valendo
 * entre formatos, não só entre relatório e tela.
 */
export type RelatorioComEscopo = Readonly<{
  escopo: EscopoRelatorio
  relatorio: RelatorioMontado
}>

export async function montarRelatorio(
  ctx: AuthContext,
  tipoBruto: string,
  entrada: unknown,
): Promise<RelatorioComEscopo> {
  const tipo = normalizarTipoRelatorio(tipoBruto)
  if (!tipo) throw naoEncontrado('Relatório')

  const escopo = await resolverEscopoRelatorio(ctx, tipo, entrada)

  return { escopo, relatorio: await montarPorTipo(escopo) }
}

async function montarPorTipo(escopo: EscopoRelatorio): Promise<RelatorioMontado> {
  switch (escopo.tipo) {
    case 'geral':
      return montarRelatorioGeral(escopo)
    case 'escola':
      return montarRelatorioDaEscola(escopo)
    case 'turma':
      return montarRelatorioDaTurma(escopo)
    case 'habilidade':
      return montarRelatorioDaHabilidade(escopo)
    case 'individual':
      return montarRelatorioIndividual(escopo)
  }
}

/** Nome de arquivo do documento, sem extensão. */
export function nomeDoArquivoDoRelatorio(escopo: EscopoRelatorio): string {
  return nomeDeArquivo(escopo.tipo, escopo.geradoEm)
}

// ---------------------------------------------------------------------------
// Auditoria da exportação — FR-121, Const. IV
// ---------------------------------------------------------------------------

export type FormatoExportacao = 'CSV' | 'XLSX' | 'IMPRESSAO'

/**
 * Registra a saída de dados do sistema.
 *
 * A exportação não altera nada, mas leva números de crianças para fora — e é por isso
 * que fica registrada como qualquer outro acesso relevante. O `metadata` referencia
 * **apenas identificadores**: nenhum nome de estudante, nenhum e-mail, nem sequer o do
 * solicitante, que já está em `userId` (Const. IV, FR-009).
 */
export async function registrarExportacaoDeRelatorio(
  escopo: EscopoRelatorio,
  formato: FormatoExportacao,
  relatorio: RelatorioMontado,
): Promise<void> {
  const linhas = relatorio.secoes.reduce((total, s) => total + s.linhas.length, 0)

  await registrarAuditoriaAvulsa({
    action: 'REPORT_EXPORT',
    userId: escopo.ctx.userId,
    entityType: 'Report',
    entityId: `${escopo.tipo}:${escopo.avaliacao.id}`,
    schoolId: escopo.escola?.id ?? null,
    assessmentId: escopo.avaliacao.id,
    metadata: {
      tipo: escopo.tipo,
      formato,
      nominal: escopo.versao.nominal,
      versaoFaixas: escopo.faixas.version,
      secoes: relatorio.secoes.length,
      linhas,
      ...(escopo.turma ? { classId: escopo.turma.id } : {}),
      ...(escopo.habilidade ? { skillId: escopo.habilidade.id } : {}),
      ...(escopo.estudante ? { studentId: escopo.estudante.studentId } : {}),
      ...(escopo.filtros.anoEscolar ? { anoEscolar: escopo.filtros.anoEscolar } : {}),
      ...(escopo.filtros.nivel ? { nivel: escopo.filtros.nivel } : {}),
    },
  })

  logger.info('relatório exportado', {
    tipo: escopo.tipo,
    formato,
    nominal: escopo.versao.nominal,
    linhas,
  })
}
