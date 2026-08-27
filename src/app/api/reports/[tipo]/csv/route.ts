import { getAuthContext } from '@/server/auth-context'
import { requireUser } from '@/server/authorization'
import { respostaDeErro } from '@/server/http-errors'
import {
  entradaDeQuery,
  montarRelatorio,
  registrarExportacaoDeRelatorio,
} from '@/modules/reports/application/report-scope'
import { gerarCsvDoRelatorio, nomeDoArquivoCsv } from '@/modules/reports/infra/csv-writer'

/**
 * Exportação do relatório em CSV — FR-103, FR-104.
 *
 * É um Route Handler, e não uma Server Action, porque o navegador precisa receber um
 * arquivo: a resposta de uma action é serializada para o React, não para o gerenciador
 * de downloads.
 *
 * A autorização vem inteira do cookie de sessão. Os parâmetros da query string são
 * **filtro**: `schoolId`, `classId`, `skillId` e `studentId` atravessam
 * `resolverEscopoRelatorio`, que os valida contra o escopo resolvido no servidor e
 * responde 404 para o que estiver fora dele — jamais um recorte silenciosamente reduzido
 * (FR-006, FR-104).
 *
 * Quem não tem a permissão de dados nominais recebe **este mesmo arquivo**, com os nomes
 * já substituídos na consulta e o código único intacto (FR-007a).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tipo: string }> },
): Promise<Response> {
  try {
    const ctx = requireUser(await getAuthContext())
    const { tipo } = await params

    const { escopo, relatorio } = await montarRelatorio(
      ctx,
      tipo,
      entradaDeQuery(new URL(request.url).searchParams),
    )

    await registrarExportacaoDeRelatorio(escopo, 'CSV', relatorio)

    return new Response(gerarCsvDoRelatorio(relatorio), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeDoArquivoCsv(relatorio)}"`,
        // O arquivo carrega dados de crianças: nenhum intermediário deve guardá-lo.
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
