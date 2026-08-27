import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { listarAvaliacoes } from '@/modules/assessments/application/list-assessment'
import { AUSENTE, formatarData, formatarNumero } from '@/lib/format'
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

export const metadata = { title: 'Avaliações' }

/**
 * Listagem de avaliações, com acesso ao painel de cada uma.
 *
 * A coluna de resultados mostra apenas o que existe **no escopo do requisitante** — quem vê
 * uma escola vê o volume daquela escola, não o da rede. A avaliação sem resultado importado
 * exibe travessão, não `0`: zero afirmaria que ninguém acertou nada, quando o fato é que nada
 * foi importado ainda (Const. I).
 */
export default async function PaginaAvaliacoes() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const avaliacoes = await listarAvaliacoes(ctx)
  const podeCriar = ctx.role === 'ADMIN'

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Avaliações</h1>
          <p className="text-sm text-texto-suave">
            Abra o painel de uma avaliação para ver desempenho, participação e
            habilidades.
          </p>
        </div>

        {podeCriar ? (
          <Link href="/avaliacoes/nova" className={variantesBotao()}>
            Nova avaliação
          </Link>
        ) : null}
      </header>

      {avaliacoes.length === 0 ? (
        <EmptyState
          titulo="Nenhuma avaliação cadastrada"
          orientacao={
            podeCriar
              ? 'Cadastre a avaliação antes de importar os resultados: é ela que dá contexto ao arquivo.'
              : 'Nenhuma avaliação foi cadastrada ainda. Fale com um administrador da rede.'
          }
          {...(podeCriar
            ? {
                acao: (
                  <Link href="/avaliacoes/nova" className={variantesBotao()}>
                    Nova avaliação
                  </Link>
                ),
              }
            : {})}
        />
      ) : (
        <TableContainer rotulo="Avaliações cadastradas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avaliação</TableHead>
                <TableHead numerica>Ano</TableHead>
                <TableHead>Ciclo</TableHead>
                <TableHead>Componente</TableHead>
                <TableHead>Aplicação</TableHead>
                <TableHead numerica>Resultados no seu escopo</TableHead>
                <TableHead>
                  <span className="apenas-leitor-de-tela">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avaliacoes.map((avaliacao) => (
                <TableRow key={avaliacao.id}>
                  <TableRowHeader>
                    <Link
                      href={`/avaliacoes/${avaliacao.id}`}
                      className="text-primaria underline underline-offset-4"
                    >
                      {avaliacao.nome}
                    </Link>
                  </TableRowHeader>
                  <TableCell numerica>{avaliacao.ano}</TableCell>
                  <TableCell>{avaliacao.ciclo}</TableCell>
                  <TableCell>{avaliacao.componenteCurricular}</TableCell>
                  <TableCell>{formatarData(avaliacao.dataAplicacao)}</TableCell>
                  <TableCell numerica>
                    {avaliacao.resultadosNoEscopo > 0
                      ? formatarNumero(avaliacao.resultadosNoEscopo)
                      : AUSENTE}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/avaliacoes/${avaliacao.id}`}
                      className="whitespace-nowrap text-primaria underline underline-offset-4"
                    >
                      Abrir painel
                      <span className="apenas-leitor-de-tela"> de {avaliacao.nome}</span>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </main>
  )
}
