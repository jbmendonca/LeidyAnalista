import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { prisma } from '@/server/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/data/empty-state'
import { FormularioEstudante } from './formulario-estudante'

export const metadata: Metadata = {
  title: 'Cadastrar estudante',
  description: 'Cadastro individual de estudante com atribuição de código único.',
}

export const dynamic = 'force-dynamic'

/**
 * As escolas e turmas oferecidas ao formulário são as do escopo do usuário. Essa restrição é
 * conveniência de interface, não autorização: `criarEstudante` valida escola e turma de novo
 * no servidor, porque um formulário pode ser reenviado com qualquer valor.
 */
export default async function PaginaNovoEstudante() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const escopo = [...ctx.allowedSchoolIds]

  const [escolas, turmas] = await Promise.all([
    prisma.school.findMany({
      where: { id: { in: escopo } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.class.findMany({
      where: { schoolId: { in: escopo } },
      select: { id: true, schoolId: true, name: true, externalCode: true },
      orderBy: [{ name: 'asc' }],
    }),
  ])

  return (
    <main id="conteudo-principal" className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1>Cadastrar estudante</h1>
        <p className="text-sm text-texto-suave">
          O código único é atribuído agora, na criação do cadastro, e não muda mais.
        </p>
      </header>

      {escolas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma escola no seu acesso"
          orientacao="Peça à coordenação da rede o vínculo com a escola antes de cadastrar estudantes."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Dados cadastrais</CardTitle>
            <CardDescription>
              Nome, turma e escola. Nada aqui altera resultado de avaliação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioEstudante
              escolas={escolas.map((e) => ({ id: e.id, nome: e.name }))}
              turmas={turmas.map((t) => ({
                id: t.id,
                schoolId: t.schoolId,
                nome: t.name,
                codigo: t.externalCode,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </main>
  )
}
