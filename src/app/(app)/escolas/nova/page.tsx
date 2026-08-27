import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { criarEscolaAction } from '@/modules/schools/application/create-school'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularioEscola } from '../_components/formulario-escola'

export const metadata = { title: 'Nova escola' }

/**
 * Cadastro de nova escola.
 *
 * A checagem de perfil aqui existe para não oferecer uma tela que reprovaria no envio — é
 * conveniência, não segurança. A autorização que vale é a de `criarEscolaAction`, que roda no
 * servidor e não confia em nada que tenha passado pelo navegador.
 */
export default async function PaginaNovaEscola() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/escolas')

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link href="/escolas" className="text-rotulo text-primaria underline underline-offset-4">
          Voltar para escolas
        </Link>
        <h1 className="text-xl font-semibold text-texto">Nova escola</h1>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle as="h2">Dados da escola</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioEscola acao={criarEscolaAction} rotuloEnvio="Cadastrar escola" />
        </CardContent>
      </Card>
    </main>
  )
}
