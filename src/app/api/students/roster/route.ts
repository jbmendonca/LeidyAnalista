import { getAuthContext } from '@/server/auth-context'
import { requireUser } from '@/server/authorization'
import { respostaDeErro } from '@/server/http-errors'
import { gerarCsvNominata } from '@/modules/students/application/export-roster'

/**
 * Download da nominata com os códigos únicos — FR-145, FR-174.
 *
 * É um Route Handler, e não uma Server Action, porque o navegador precisa receber um arquivo:
 * a resposta de uma action é serializada para o React, não para o gerenciador de downloads.
 *
 * O escopo e a supressão nominal são resolvidos em `gerarCsvNominata` a partir do contexto de
 * sessão; `schoolId` e `classId` da query string entram como filtro e nunca como autorização.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = requireUser(await getAuthContext())
    const parametros = new URL(request.url).searchParams

    const { conteudo, nomeArquivo } = await gerarCsvNominata(ctx, {
      schoolId: parametros.get('schoolId'),
      classId: parametros.get('classId'),
    })

    return new Response(conteudo, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        // O arquivo carrega dados de crianças: nenhum intermediário deve guardá-lo.
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
