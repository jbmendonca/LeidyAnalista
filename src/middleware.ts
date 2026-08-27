import { NextResponse, type NextRequest } from 'next/server'

const COOKIE_SESSAO = 'painel_sessao'

/**
 * Primeira barreira: quem não traz cookie de sessão nem chega às rotas
 * autenticadas.
 *
 * ATENÇÃO — esta camada NÃO É a autorização.
 *
 * O middleware roda no runtime Edge e não tem acesso ao banco: ele só sabe que
 * existe um cookie, não se a sessão é válida, quem é o usuário nem a quais
 * escolas ele tem direito. Um cookie forjado passa por aqui.
 *
 * A autorização real acontece no servidor, em `resolveAllowedSchoolIds`
 * (src/server/authorization.ts), que toda leitura e toda escrita atravessam.
 * Este arquivo é conveniência de navegação — nada mais. Tratar o middleware
 * como controle de acesso seria exatamente a "permissão implementada só na
 * interface" que o Princípio IV proíbe.
 */

const ROTAS_PUBLICAS = ['/entrar']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const temCookie = Boolean(request.cookies.get(COOKIE_SESSAO)?.value)
  const ehPublica = ROTAS_PUBLICAS.some((r) => pathname.startsWith(r))

  if (!temCookie && !ehPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/entrar'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (temCookie && ehPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/avaliacoes'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'],
}
