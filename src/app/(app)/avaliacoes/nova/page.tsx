import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { criarAvaliacaoAction } from '@/modules/assessments/application/create-assessment'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularioAvaliacao } from '../_components/formulario-avaliacao'

export const metadata = { title: 'Nova avaliação' }

/**
 * Cadastro de nova avaliação.
 *
 * O desvio de perfil aqui é conveniência: evita mostrar um formulário que a server action
 * recusaria. A autorização de verdade está em `criarAvaliacaoAction`, no servidor.
 */
export default async function PaginaNovaAvaliacao() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/avaliacoes')

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/avaliacoes"
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para avaliações
        </Link>
        <h1 className="text-xl font-semibold text-texto">Nova avaliação</h1>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle as="h2">Dados da avaliação</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioAvaliacao
            acao={criarAvaliacaoAction}
            rotuloEnvio="Cadastrar avaliação"
          />
        </CardContent>
      </Card>
    </div>
  )
}
