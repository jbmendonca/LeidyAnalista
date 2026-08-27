import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { listarEscolas } from '@/modules/schools/application/list-schools'
import { EmptyState } from '@/components/data/empty-state'
import { variantesBotao } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from '@/components/ui/table'

export const metadata = { title: 'Escolas' }

/**
 * Listagem de escolas.
 *
 * A consulta já chega recortada por `listarEscolas`, que só conhece o escopo resolvido no
 * servidor. Não há filtro de escola nesta tela porque não haveria o que filtrar: o usuário de
 * escola vê exatamente a sua, e o recorte não é uma preferência de exibição.
 */
export default async function PaginaEscolas() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const escolas = await listarEscolas(ctx)
  const podeCriar = ctx.role === 'ADMIN'

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Escolas</h1>
          <p className="text-sm text-texto-suave">
            {escolas.length === 1
              ? '1 escola no seu escopo de acesso.'
              : `${escolas.length} escolas no seu escopo de acesso.`}
          </p>
        </div>

        {podeCriar ? (
          <Link href="/escolas/nova" className={variantesBotao()}>
            Nova escola
          </Link>
        ) : null}
      </header>

      {escolas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma escola no seu escopo"
          orientacao={
            podeCriar
              ? 'Cadastre a primeira escola para começar a receber importações.'
              : 'Seu usuário ainda não está vinculado a nenhuma escola. Peça a um administrador que faça o vínculo.'
          }
          {...(podeCriar
            ? {
                acao: (
                  <Link href="/escolas/nova" className={variantesBotao()}>
                    Nova escola
                  </Link>
                ),
              }
            : {})}
        />
      ) : (
        <TableContainer rotulo="Escolas cadastradas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Escola</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Rede</TableHead>
                <TableHead>Município</TableHead>
                <TableHead>UF</TableHead>
                <TableHead numerica>Turmas</TableHead>
                <TableHead numerica>Estudantes</TableHead>
                <TableHead>
                  <span className="apenas-leitor-de-tela">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {escolas.map((escola) => (
                <TableRow key={escola.id}>
                  <TableRowHeader>{escola.name}</TableRowHeader>
                  <TableCell>{escola.code}</TableCell>
                  <TableCell>{escola.rede}</TableCell>
                  <TableCell>{escola.municipio}</TableCell>
                  <TableCell>{escola.estado}</TableCell>
                  <TableCell numerica>{escola.totalTurmas}</TableCell>
                  <TableCell numerica>{escola.totalEstudantes}</TableCell>
                  <TableCell>
                    <div className="flex gap-3 whitespace-nowrap">
                      <Link
                        href={`/turmas?escola=${escola.id}`}
                        className="text-primaria underline underline-offset-4"
                      >
                        Turmas
                      </Link>
                      {podeCriar ? (
                        <Link
                          href={`/escolas/${escola.id}/editar`}
                          className="text-primaria underline underline-offset-4"
                        >
                          Editar
                          <span className="apenas-leitor-de-tela"> {escola.name}</span>
                        </Link>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  )
}
