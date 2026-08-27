import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { prisma } from '@/server/prisma'
import { listarEstudantes } from '@/modules/students/application/list-students'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { EmptyTableRow } from '@/components/data/empty-state'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from '@/components/ui/table'

export const metadata: Metadata = {
  title: 'Estudantes',
  description: 'Base cadastral de estudantes e seus códigos únicos.',
}

export const dynamic = 'force-dynamic'

type Parametros = Promise<Record<string, string | string[] | undefined>>

function primeiro(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor ?? null
}

/**
 * Listagem da base cadastral — FR-132, FR-133.
 *
 * A busca aceita nome ou código único, e a coluna do código vem antes do nome: é o código que
 * o operador precisa transcrever para a planilha da avaliação seguinte (FR-174).
 *
 * O nome exibido é sempre o ORIGINAL (FR-034). A forma normalizada existe só para a busca e
 * nunca chega até aqui — não está sequer no objeto devolvido pela consulta.
 */
export default async function PaginaEstudantes({
  searchParams,
}: {
  searchParams: Parametros
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const parametros = await searchParams
  const schoolId = primeiro(parametros['escola'])
  const classId = primeiro(parametros['turma'])
  const busca = primeiro(parametros['busca'])

  const [lista, escolas] = await Promise.all([
    listarEstudantes(ctx, { schoolId, classId, busca }),
    prisma.school.findMany({
      where: { id: { in: [...ctx.allowedSchoolIds] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const consultaExportacao = new URLSearchParams()
  if (schoolId) consultaExportacao.set('schoolId', schoolId)
  if (classId) consultaExportacao.set('classId', classId)
  const consulta = consultaExportacao.toString()
  const urlExportacao = `/api/students/roster${consulta === '' ? '' : `?${consulta}`}`

  return (
    <div
      id="conteudo-principal"
      className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1>Estudantes</h1>
          <p className="text-sm text-texto-suave">
            Base cadastral da rede. O código único é atribuído no cadastro e acompanha a
            criança nas avaliações seguintes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            Links com aparência de botão são links de verdade, não `<button>` com `onClick`:
            navegação precisa funcionar com clique do meio, "abrir em nova aba" e sem
            JavaScript.
          */}
          <Link
            href="/estudantes/nominata"
            className="inline-flex h-9 items-center justify-center rounded border border-borda-forte bg-superficie px-3 text-rotulo font-medium text-texto hover:bg-superficie-tenue"
          >
            Importar nominata
          </Link>
          <Link
            href={urlExportacao}
            prefetch={false}
            className="inline-flex h-9 items-center justify-center rounded border border-borda-forte bg-superficie px-3 text-rotulo font-medium text-texto hover:bg-superficie-tenue"
          >
            Exportar nominata (CSV)
          </Link>
          <Link
            href="/estudantes/novo"
            className="inline-flex h-9 items-center justify-center rounded bg-primaria px-3 text-rotulo font-medium text-primaria-contraste hover:bg-primaria-forte"
          >
            Cadastrar estudante
          </Link>
        </div>
      </header>

      {/*
        FR-007a: sem a permissão de dados nominais o usuário recebe a lista completa com os
        nomes suprimidos — nunca uma negação. O aviso deixa claro que a ausência do nome é
        permissão, e não falta de dado.
      */}
      {!lista.nominal ? (
        <Alert variante="informativo" titulo="Versão sem identificação de estudantes">
          Seu acesso não inclui dados nominais. A lista está completa e os códigos únicos
          são exibidos; apenas os nomes foram suprimidos.
        </Alert>
      ) : null}

      {lista.buscaPorNomeIgnorada ? (
        <Alert variante="aviso" titulo="Busca por nome não aplicada">
          Sem a permissão de dados nominais, a busca funciona apenas por código único.
        </Alert>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <Label htmlFor="busca">Buscar por nome ou código único</Label>
          <Input
            id="busca"
            name="busca"
            defaultValue={busca ?? ''}
            placeholder="Ex.: A7K3M-QX9DF"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="min-w-[14rem] space-y-1.5">
          <Label htmlFor="escola">Escola</Label>
          <Select id="escola" name="escola" defaultValue={schoolId ?? ''}>
            <option value="">Todas as escolas do meu acesso</option>
            {escolas.map((escola) => (
              <option key={escola.id} value={escola.id}>
                {escola.name}
              </option>
            ))}
          </Select>
        </div>

        <Button type="submit" variante="secundario">
          Filtrar
        </Button>
      </form>

      <TableContainer rotulo="Estudantes cadastrados">
        <Table>
          <TableCaption>
            {lista.total} estudante{lista.total === 1 ? '' : 's'} no recorte selecionado
            {lista.total > lista.itens.length
              ? ` — exibindo os ${lista.itens.length} primeiros`
              : ''}
            .
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Código único</TableHead>
              <TableHead>Estudante</TableHead>
              <TableHead>Turma</TableHead>
              <TableHead>Escola</TableHead>
              <TableHead>Código externo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.itens.length === 0 ? (
              <EmptyTableRow
                colunas={5}
                titulo="Nenhum estudante cadastrado neste recorte"
                orientacao={
                  <>
                    Cadastre individualmente ou envie a nominata da rede. Nenhum estudante
                    é criado automaticamente pela importação de resultados.
                  </>
                }
              />
            ) : (
              lista.itens.map((estudante) => (
                <TableRow key={estudante.id}>
                  <TableCell className="font-mono tabular-nums">
                    {estudante.uniqueCode}
                  </TableCell>
                  <TableRowHeader>{estudante.nomeOriginal}</TableRowHeader>
                  <TableCell>
                    {estudante.turmaNome}
                    <span className="block text-rotulo text-texto-suave">
                      {estudante.turmaCodigo}
                    </span>
                  </TableCell>
                  <TableCell>{estudante.escolaNome}</TableCell>
                  <TableCell>{estudante.codigoExterno ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  )
}
