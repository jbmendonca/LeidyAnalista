import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { criarTurmaAction } from '@/modules/classes/application/create-class'
import { listarEscolasParaSelecao } from '@/modules/schools/application/list-schools'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularioTurma } from '../_components/formulario-turma'

export const metadata = { title: 'Nova turma' }

/**
 * Cadastro de nova turma. Escrevem ADMIN e ANALISTA.
 *
 * A lista de escolas do `<select>` vem de `listarEscolasParaSelecao`, já recortada pelo escopo
 * do servidor. Sem escola no escopo não há formulário a oferecer — e o aviso diz o que fazer,
 * em vez de mostrar um seletor vazio.
 */
export default async function PaginaNovaTurma() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN' && ctx.role !== 'ANALISTA') redirect('/turmas')

  const escolas = await listarEscolasParaSelecao(ctx)

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/turmas"
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para turmas
        </Link>
        <h1 className="text-xl font-semibold text-texto">Nova turma</h1>
      </header>

      {escolas.length === 0 ? (
        <Alert variante="aviso" titulo="Nenhuma escola disponível">
          Não há escola no seu escopo de acesso para receber uma turma. Cadastre uma
          escola ou peça a um administrador o vínculo do seu usuário.
        </Alert>
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle as="h2">Dados da turma</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioTurma
              acao={criarTurmaAction}
              escolas={escolas}
              rotuloEnvio="Cadastrar turma"
            />
          </CardContent>
        </Card>
      )}
    </main>
  )
}
