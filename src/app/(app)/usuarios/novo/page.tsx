import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { prisma } from '@/server/prisma'
import { criarUsuarioAction } from '@/modules/users/application/user-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularioUsuario } from '../_components/formulario-usuario'

export const metadata: Metadata = {
  title: 'Novo usuário',
  description: 'Cadastro de usuário, perfil, escolas vinculadas e permissão nominal.',
}

export const dynamic = 'force-dynamic'

/**
 * Cadastro de usuário — restrito ao Administrador.
 *
 * A checagem de perfil aqui existe para não oferecer uma tela que reprovaria no envio: é
 * conveniência, não segurança. A autorização que vale é a de `criarUsuarioAction`, que roda
 * no servidor e não confia em nada que tenha passado pelo navegador.
 *
 * A lista de escolas vem do banco sem recorte porque só o Administrador chega até aqui, e o
 * escopo dele é a rede inteira. `criarUsuario` revalida cada id contra `allowedSchoolIds`
 * mesmo assim — o servidor não confia na lista que ele próprio ofereceu.
 */
export default async function PaginaNovoUsuario() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/avaliacoes')

  const escolas = await prisma.school.findMany({
    where: { id: { in: [...ctx.allowedSchoolIds] } },
    orderBy: [{ estado: 'asc' }, { municipio: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, municipio: true, estado: true },
  })

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/usuarios"
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para usuários
        </Link>
        <h1 className="text-xl font-semibold text-texto">Novo usuário</h1>
      </header>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle as="h2">Dados de acesso</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioUsuario acao={criarUsuarioAction} escolas={escolas} />
        </CardContent>
      </Card>
    </div>
  )
}
