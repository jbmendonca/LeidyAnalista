import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { prisma } from '@/server/prisma'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormularioNominata } from './formulario-nominata'

export const metadata: Metadata = {
  title: 'Importar nominata',
  description: 'Cadastro em lote de estudantes a partir do arquivo de nominata da rede.',
}

export const dynamic = 'force-dynamic'

export default async function PaginaNominata() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const escolas = await prisma.school.findMany({
    where: { id: { in: [...ctx.allowedSchoolIds] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <main
      id="conteudo-principal"
      className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8"
    >
      <header className="space-y-1">
        <h1>Importar nominata</h1>
        <p className="text-sm text-texto-suave">
          O cadastro prévio é o que permite à importação de resultados reconhecer as
          crianças em vez de criá-las. Cada estudante cadastrado aqui recebe seu código
          único.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Arquivo</CardTitle>
          <CardDescription>
            As turmas que ainda não existirem são criadas a partir do arquivo. Se houver
            qualquer erro, nada é gravado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioNominata
            escolas={escolas.map((e) => ({ id: e.id, nome: e.name }))}
          />
        </CardContent>
      </Card>
    </main>
  )
}
