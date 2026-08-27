import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { formatarDataHora } from '@/lib/format'
import { formatarLimite } from '@/modules/settings/schemas'
import {
  listarVersoesDeCriterios,
  type SituacaoDeVigencia,
} from '@/modules/settings/application/list-versions'
import { Badge } from '@/components/ui/badge'
import { NivelBadge } from '@/components/ui/nivel-badge'
import { EmptyState } from '@/components/data/empty-state'
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
  title: 'Histórico de critérios analíticos',
  description: 'Todas as versões das faixas, com valores, autor e período de vigência.',
}

export const dynamic = 'force-dynamic'

/**
 * Histórico de versões dos critérios analíticos — FR-163, FR-165.
 *
 * Cada linha é um registro imutável: `AnalyticalSettings` nunca sofre UPDATE, de modo que o
 * que se lê aqui é exatamente o que valia naquele período. É isto que torna um relatório
 * antigo explicável — sem o histórico, um número emitido no ano passado ficaria sem o
 * critério que o produziu.
 *
 * A tela é somente leitura. Não há botão de editar nem de excluir versão, e não pode haver:
 * alterar o passado da configuração equivaleria a reescrever a régua depois da medição.
 */

const SITUACAO = {
  VIGENTE: { rotulo: 'Vigente', variante: 'destaque' },
  AGENDADA: { rotulo: 'Agendada', variante: 'informativo' },
  ENCERRADA: { rotulo: 'Encerrada', variante: 'neutro' },
} as const satisfies Record<
  SituacaoDeVigencia,
  { rotulo: string; variante: 'destaque' | 'informativo' | 'neutro' }
>

export default async function PaginaHistoricoDeCriterios() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/avaliacoes')

  const versoes = await listarVersoesDeCriterios(ctx)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/configuracoes"
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para critérios analíticos
        </Link>
        <h1 className="text-xl font-semibold text-texto">
          Histórico de critérios analíticos
        </h1>
        <p className="max-w-prose text-sm text-texto-suave">
          Cada alteração registra uma versão nova; nenhuma versão é sobrescrita. O período
          de vigência de uma versão termina quando a seguinte começa.
        </p>
      </header>

      {versoes.length === 0 ? (
        <EmptyState
          titulo="Nenhuma versão registrada"
          orientacao={
            <>
              As faixas analíticas ainda não foram configuradas. Registre a primeira
              versão em <strong>Critérios analíticos</strong>.
            </>
          }
        />
      ) : (
        <TableContainer rotulo="Versões dos critérios analíticos">
          <Table>
            <TableCaption>
              {versoes.length === 1
                ? '1 versão registrada.'
                : `${versoes.length} versões registradas, da mais recente para a mais antiga.`}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Versão</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Fragilidade</TableHead>
                <TableHead>Atenção</TableHead>
                <TableHead>Satisfatório</TableHead>
                <TableHead>Baixo rendimento</TableHead>
                <TableHead>Abaixo do adequado</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Autor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versoes.map((versao) => {
                const situacao = SITUACAO[versao.situacao]

                return (
                  <TableRow key={versao.id}>
                    <TableRowHeader>Versão {versao.version}</TableRowHeader>
                    <TableCell>
                      {/* Rótulo textual sempre presente: a cor da etiqueta nunca responde
                          sozinha (WCAG 1.4.1). */}
                      <Badge variante={situacao.variante}>{situacao.rotulo}</Badge>
                    </TableCell>
                    <TableCell>
                      abaixo de {formatarLimite(versao.fragilidadeMax)}
                    </TableCell>
                    <TableCell>
                      {formatarLimite(versao.fragilidadeMax)} a{' '}
                      {formatarLimite(versao.atencaoMax)}
                    </TableCell>
                    <TableCell>{formatarLimite(versao.atencaoMax)} ou mais</TableCell>
                    <TableCell>
                      {versao.baixoRendimento.length === 0 ? (
                        <span className="text-texto-suave">Nenhum nível</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {versao.baixoRendimento.map((nivel) => (
                            <NivelBadge key={nivel} nivel={nivel} avaliado />
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {versao.abaixoDoAdequadoHabilitado ? 'Habilitada' : 'Desabilitada'}
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap">
                        de {formatarDataHora(versao.effectiveFrom)}
                      </span>
                      <br />
                      <span className="whitespace-nowrap text-texto-suave">
                        {versao.vigenteAte === null
                          ? 'sem término'
                          : `até ${formatarDataHora(versao.vigenteAte)}`}
                      </span>
                    </TableCell>
                    <TableCell>{versao.autor.name}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  )
}
