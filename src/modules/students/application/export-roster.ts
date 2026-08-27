import type { AuthContext } from '@/server/authorization'
import { registrarAuditoriaAvulsa } from '@/modules/audit/infra/audit-repository'
import { podeVerNomes, rotuloVersaoRelatorio } from '@/server/nominal-data'
import { logger } from '@/server/logger'
import { filtrosNominataSchema } from '@/modules/students/schemas'
import { entradaInvalida } from '@/server/http-errors'
import { listarEstudantes } from './list-students'

/**
 * Exportação da nominata com os códigos únicos — FR-145, FR-174, FR-132.
 *
 * É esta planilha que a rede usa para gerar o arquivo da avaliação seguinte: com o código
 * único em cada linha, a importação seguinte reconhece a criança sem depender do nome
 * (FR-138) — o que resolve, de saída, o caso dos homônimos na mesma turma (FR-176).
 *
 * Formato: separador `;`, quebra `CRLF` e UTF-8 **com BOM**. O Excel em português abre CSV
 * sem BOM interpretando bytes UTF-8 como Latin-1, e "JOÃO" chega como "JOÃO" na tela de quem
 * vai usar o arquivo. O BOM é o que evita isso.
 *
 * Escopo e supressão nominal vêm de `listarEstudantes`: quem não tem a permissão recebe o
 * arquivo com os nomes suprimidos e os códigos intactos — a exportação continua servindo ao
 * propósito, sem revelar o que não pode (FR-007a, FR-145).
 */

const SEPARADOR = ';'
const QUEBRA = '\r\n'
const BOM = '\uFEFF'

const CABECALHOS = [
  'Código Único',
  'Escola',
  'Código da Turma',
  'Turma',
  'Ano Escolar',
  'Estudante',
  'Código Externo',
] as const

/** Limite alto de segurança: a nominata de uma rede inteira cabe, uma consulta infinita não. */
const LIMITE = 5000

/** Aspas em campo com separador, aspa ou quebra — a convenção do RFC 4180. */
function campo(valor: string | null): string {
  const texto = valor ?? ''
  if (!/[;"\r\n]/.test(texto)) return texto
  return `"${texto.replace(/"/g, '""')}"`
}

export type NominataExportada = Readonly<{
  nomeArquivo: string
  conteudo: string
  totalLinhas: number
  nominal: boolean
  rotulo: string
}>

export async function gerarCsvNominata(
  ctx: AuthContext,
  filtros: unknown = {},
): Promise<NominataExportada> {
  const analise = filtrosNominataSchema.safeParse(filtros)
  if (!analise.success) {
    throw entradaInvalida(analise.error.flatten().fieldErrors as Record<string, string[]>)
  }

  const f = analise.data

  const lista = await listarEstudantes(ctx, {
    schoolId: f.schoolId,
    classId: f.classId,
    pagina: 1,
    tamanho: LIMITE,
  })

  const linhas = lista.itens.map((e) =>
    [
      campo(e.uniqueCode),
      campo(e.escolaNome),
      campo(e.turmaCodigo),
      campo(e.turmaNome),
      campo(e.anoEscolar),
      campo(e.nomeOriginal),
      campo(e.codigoExterno),
    ].join(SEPARADOR),
  )

  const conteudo =
    BOM + [CABECALHOS.join(SEPARADOR), ...linhas].join(QUEBRA) + QUEBRA

  // A exportação não altera dado nenhum, mas leva dados de crianças para fora do sistema:
  // fica registrada, por identificador, como qualquer outro acesso relevante (FR-121).
  await registrarAuditoriaAvulsa({
    action: 'REPORT_EXPORT',
    userId: ctx.userId,
    entityType: 'NominataExport',
    entityId: f.classId ?? f.schoolId ?? 'ESCOPO_COMPLETO',
    schoolId: f.schoolId,
    metadata: {
      linhas: lista.itens.length,
      nominal: podeVerNomes(ctx),
      ...(f.classId !== null ? { classId: f.classId } : {}),
    },
  })

  logger.info('nominata exportada', {
    linhas: lista.itens.length,
    nominal: podeVerNomes(ctx),
  })

  return {
    nomeArquivo: `nominata-${new Date().toISOString().slice(0, 10)}.csv`,
    conteudo,
    totalLinhas: lista.itens.length,
    nominal: lista.nominal,
    rotulo: rotuloVersaoRelatorio(ctx),
  }
}
