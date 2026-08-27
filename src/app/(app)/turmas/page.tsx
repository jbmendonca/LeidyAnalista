import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { listarTurmas } from '@/modules/classes/application/list-class'
import { listarEscolasParaSelecao } from '@/modules/schools/application/list-schools'
import { EmptyState } from '@/components/data/empty-state'
import { Button, variantesBotao } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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

export const metadata = { title: 'Turmas' }

/**
 * Listagem de turmas, com filtro por escola.
 *
 * O parâmetro `?escola=` é **filtro de exibição**, não autorização. Ele atravessa
 * `listarTurmas` → `schoolScopeFilter`, que só o aceita se a escola já estiver no escopo do
 * usuário; fora dele, a resposta é 404 — e não uma lista silenciosamente reduzida. O ajuste
 * mudo seria pior que o erro: esconderia do usuário que ele pediu algo que não pode ver.
 *
 * O `<select>` também é montado a partir do escopo, de modo que a escola alheia nem aparece
 * como opção. As duas defesas são independentes; a que vale é a do servidor.
 */
export default async function PaginaTurmas({
  searchParams,
}: {
  searchParams: Promise<{ escola?: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const { escola: escolaSelecionada } = await searchParams
  const escolas = await listarEscolasParaSelecao(ctx)
  const turmas = await listarTurmas(ctx, escolaSelecionada ?? null)

  const podeCriar = ctx.role === 'ADMIN' || ctx.role === 'ANALISTA'
  const filtrando = Boolean(escolaSelecionada)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Turmas</h1>
          <p className="text-sm text-texto-suave">
            {turmas.length === 1
              ? '1 turma listada.'
              : `${turmas.length} turmas listadas.`}
          </p>
        </div>

        {podeCriar ? (
          <Link href="/turmas/nova" className={variantesBotao()}>
            Nova turma
          </Link>
        ) : null}
      </header>

      {escolas.length > 1 ? (
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 space-y-1.5">
            <Label htmlFor="escola">Filtrar por escola</Label>
            <Select id="escola" name="escola" defaultValue={escolaSelecionada ?? ''}>
              <option value="">Todas as escolas do meu acesso</option>
              {escolas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.municipio}/{e.estado}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variante="secundario">
            Aplicar filtro
          </Button>
          {filtrando ? (
            <Link
              href="/turmas"
              className={variantesBotao({ variante: 'vinculo', tamanho: 'medio' })}
            >
              Limpar filtro
            </Link>
          ) : null}
        </form>
      ) : null}

      {turmas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma turma para este recorte"
          orientacao={
            filtrando
              ? 'Nenhuma turma cadastrada nesta escola. Limpe o filtro para ver as demais escolas do seu acesso.'
              : podeCriar
                ? 'Cadastre as turmas antes de importar os resultados — o código da turma do arquivo precisa encontrar uma turma existente.'
                : 'Nenhuma turma cadastrada nas escolas do seu acesso.'
          }
          {...(filtrando
            ? {
                acao: (
                  <Link
                    href="/turmas"
                    className={variantesBotao({ variante: 'secundario' })}
                  >
                    Limpar filtro
                  </Link>
                ),
              }
            : podeCriar
              ? {
                  acao: (
                    <Link href="/turmas/nova" className={variantesBotao()}>
                      Nova turma
                    </Link>
                  ),
                }
              : {})}
        />
      ) : (
        <TableContainer rotulo="Turmas cadastradas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Turma</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Ano escolar</TableHead>
                <TableHead>Escola</TableHead>
                <TableHead numerica>Estudantes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {turmas.map((turma) => (
                <TableRow key={turma.id}>
                  <TableRowHeader>{turma.name}</TableRowHeader>
                  <TableCell className="font-mono text-rotulo">
                    {turma.externalCode}
                  </TableCell>
                  <TableCell>{turma.anoEscolar}</TableCell>
                  <TableCell>{turma.escolaNome}</TableCell>
                  <TableCell numerica>{turma.totalEstudantes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  )
}
