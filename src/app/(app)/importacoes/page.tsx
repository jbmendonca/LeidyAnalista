import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { prisma } from '@/server/prisma'
import { EmptyState } from '@/components/data/empty-state'
import { variantesBotao } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatarDataHora, formatarNumero } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const metadata = { title: 'Importações' }

const ROTULO_STATUS: Record<string, string> = {
  UPLOADED: 'Arquivo recebido',
  VALIDATING: 'Validando',
  READY: 'Pronta para confirmar',
  PROCESSING: 'Processando',
  COMPLETED: 'Confirmada',
  FAILED: 'Falhou',
}

/**
 * Histórico de importações — FR-115, FR-116.
 *
 * O histórico sobrevive à exclusão da importação: o registro de o que
 * aconteceu não desaparece junto com o dado (premissa 13).
 */
export default async function PaginaImportacoes() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const importacoes = await prisma.import.findMany({
    where: { schoolId: { in: [...ctx.allowedSchoolIds] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      confirmedAt: true,
      totalRows: true,
      evaluatedRows: true,
      notEvaluatedRows: true,
      classCount: true,
      errorCount: true,
      warningCount: true,
      filePurgedAt: true,
      school: { select: { name: true } },
      assessment: { select: { nome: true } },
      user: { select: { name: true } },
    },
  })

  const podeImportar = ctx.role === 'ADMIN' || ctx.role === 'ANALISTA'

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Importações</h1>
          <p className="text-sm text-texto-suave">
            Histórico das cargas de resultados. O registro permanece mesmo depois de a
            importação ser excluída.
          </p>
        </div>
        {podeImportar && (
          <Link
            href="/importacoes/nova"
            className={variantesBotao({ variante: 'primario' })}
          >
            Nova importação
          </Link>
        )}
      </header>

      {importacoes.length === 0 ? (
        <EmptyState
          titulo="Nenhuma importação registrada"
          orientacao="Envie o arquivo de resultados da avaliação para começar a análise."
          {...(podeImportar
            ? {
                acao: (
                  <Link
                    href="/importacoes/nova"
                    className={variantesBotao({ variante: 'primario' })}
                  >
                    Nova importação
                  </Link>
                ),
              }
            : {})}
        />
      ) : (
        <TableContainer rotulo="Histórico de importações">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Avaliação</TableHead>
                <TableHead>Escola</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead numerica>Registros</TableHead>
                <TableHead numerica>Avaliados</TableHead>
                <TableHead numerica>Não avaliados</TableHead>
                <TableHead numerica>Turmas</TableHead>
                <TableHead numerica>Erros</TableHead>
                <TableHead numerica>Alertas</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Responsável</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importacoes.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link
                      href={`/importacoes/${i.id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {i.fileName}
                    </Link>
                    {i.filePurgedAt && (
                      <span className="ml-2 text-xs text-texto-suave">
                        (arquivo expurgado)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{i.assessment.nome}</TableCell>
                  <TableCell>{i.school.name}</TableCell>
                  <TableCell>
                    <Badge
                      variante={
                        i.status === 'COMPLETED'
                          ? 'sucesso'
                          : i.status === 'FAILED'
                            ? 'perigo'
                            : 'neutro'
                      }
                    >
                      {ROTULO_STATUS[i.status] ?? i.status}
                    </Badge>
                  </TableCell>
                  <TableCell numerica>
                    {formatarNumero(i.totalRows)}
                  </TableCell>
                  <TableCell numerica>
                    {formatarNumero(i.evaluatedRows)}
                  </TableCell>
                  <TableCell numerica>
                    {formatarNumero(i.notEvaluatedRows)}
                  </TableCell>
                  <TableCell numerica>
                    {formatarNumero(i.classCount)}
                  </TableCell>
                  <TableCell numerica>
                    {formatarNumero(i.errorCount)}
                  </TableCell>
                  <TableCell numerica>
                    {formatarNumero(i.warningCount)}
                  </TableCell>
                  <TableCell>{formatarDataHora(i.confirmedAt ?? i.createdAt)}</TableCell>
                  <TableCell>{i.user.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </main>
  )
}
