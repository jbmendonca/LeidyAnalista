import { getAuthContext } from '@/server/auth-context'
import { requireUser } from '@/server/authorization'
import { respostaDeErro } from '@/server/http-errors'
import {
  entradaDeQuery,
  montarRelatorio,
  registrarExportacaoDeRelatorio,
} from '@/modules/reports/application/report-scope'
import {
  gerarXlsxDoRelatorio,
  nomeDoArquivoXlsx,
} from '@/modules/reports/infra/xlsx-writer'

/**
 * Exportação do relatório em XLSX — FR-103, FR-104.
 *
 * Mesmo documento do CSV e da folha de impressão: os três formatos partem de
 * `montarRelatorio`, com o mesmo recorte lido pela mesma função. É essa partilha que faz
 * FR-107 valer entre formatos, e não só entre relatório e tela.
 *
 * `runtime = 'nodejs'` é obrigatório: a escrita da planilha produz um `Buffer`, que não
 * existe no runtime de borda.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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

    await registrarExportacaoDeRelatorio(escopo, 'XLSX', relatorio)

    const conteudo = gerarXlsxDoRelatorio(relatorio)

    return new Response(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        'Content-Type': TIPO_XLSX,
        'Content-Disposition': `attachment; filename="${nomeDoArquivoXlsx(relatorio)}"`,
        'Content-Length': String(conteudo.byteLength),
        // O arquivo carrega dados de crianças: nenhum intermediário deve guardá-lo.
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
