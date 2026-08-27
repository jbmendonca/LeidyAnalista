import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { prisma } from '@/server/prisma'
import { env } from '@/lib/env'
import { Alert } from '@/components/ui/alert'
import { FormularioImportacao } from './_components/formulario-importacao'

export const metadata = { title: 'Nova importação' }

/**
 * Passos 1 a 3 do pipeline: avaliação, escola e arquivo.
 *
 * A lista de escolas já chega recortada pelo escopo do usuário — o `select`
 * não oferece o que ele não pode importar, e o servidor rejeita de qualquer
 * forma se o valor for adulterado.
 */
export default async function PaginaNovaImportacao() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN' && ctx.role !== 'ANALISTA') redirect('/importacoes')

  const [avaliacoes, escolas] = await Promise.all([
    prisma.assessment.findMany({
      orderBy: [{ ano: 'desc' }, { nome: 'asc' }],
      select: { id: true, nome: true, ano: true, ciclo: true },
    }),
    prisma.school.findMany({
      where: { id: { in: [...ctx.allowedSchoolIds] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, municipio: true },
    }),
  ])

  const faltaCadastro = avaliacoes.length === 0 || escolas.length === 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-texto">Nova importação</h1>
        <p className="text-sm text-texto-suave">
          Avaliação, escola e arquivo. A confirmação vem depois da conferência.
        </p>
      </header>

      {faltaCadastro ? (
        <Alert variante="aviso" titulo="Cadastros necessários">
          {avaliacoes.length === 0 && <p>Cadastre uma avaliação antes de importar.</p>}
          {escolas.length === 0 && (
            <p>Nenhuma escola disponível no seu escopo de acesso.</p>
          )}
        </Alert>
      ) : (
        <FormularioImportacao
          avaliacoes={avaliacoes.map((a) => ({
            id: a.id,
            rotulo: `${a.nome} — ${a.ciclo} (${a.ano})`,
          }))}
          escolas={escolas.map((e) => ({
            id: e.id,
            rotulo: `${e.name} — ${e.municipio}`,
          }))}
          limiteMb={env.IMPORT_MAX_FILE_SIZE_MB}
        />
      )}
    </div>
  )
}
