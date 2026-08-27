import * as React from 'react'

import { cn } from '@/lib/utils'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { formatPercent } from '@/lib/decimal'
import { Alert } from '@/components/ui/alert'
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
import type { RegistroDivergente } from '@/modules/analytics/application/skill-detail'

/**
 * Registros com denominador divergente do de referência — FR-158, FR-159.
 *
 * Estes registros **não** compõem a distribuição `0/n … n/n`: um `2/2` e um `2/3` não são o
 * mesmo desempenho, e somá-los na mesma faixa produziria um gráfico que descreve uma
 * realidade que não existe.
 *
 * Duas coisas que esta lista precisa deixar explícitas, e por isso o texto de abertura não é
 * opcional:
 *
 * 1. **quantos** ficaram de fora e **por quê** (FR-159) — o leitor tem de poder conferir que
 *    a distribuição não perdeu ninguém em silêncio;
 * 2. que a exclusão é **só da distribuição**: o percentual consolidado da habilidade continua
 *    `Σ acertos ÷ Σ itens` incluindo estes registros (FR-157). O denominador de referência é
 *    recurso de apresentação e não altera nenhum cálculo.
 *
 * Cada linha traz estudante, turma, denominador encontrado e o resultado exatamente como
 * veio da fonte (FR-030) — é o que permite rastrear a divergência até a célula da planilha.
 *
 * Os nomes já chegam suprimidos quando falta a permissão nominal: a supressão acontece na
 * consulta, não aqui (FR-007).
 */

export type PropsListaDivergentes = {
  divergentes: readonly RegistroDivergente[]
  denominadorReferencia: number
  /** FR-160 — o denominador de referência foi definido por desempate de frequência. */
  denominadorPorEmpate?: boolean
  className?: string
}

export function ListaDivergentes({
  divergentes,
  denominadorReferencia,
  denominadorPorEmpate = false,
  className,
}: PropsListaDivergentes) {
  if (divergentes.length === 0) return null

  const total = divergentes.length

  return (
    <section aria-labelledby="divergentes-titulo" className={cn('space-y-3', className)}>
      <h2 id="divergentes-titulo" className="text-base font-semibold text-texto">
        Registros fora da distribuição
      </h2>

      <Alert
        variante="aviso"
        titulo={`${formatarNumero(total)} ${total === 1 ? 'registro ficou' : 'registros ficaram'} fora da distribuição`}
      >
        <p>
          O denominador de referência desta habilidade é{' '}
          <strong className="font-semibold">
            {formatarNumero(denominadorReferencia)}{' '}
            {denominadorReferencia === 1 ? 'item' : 'itens'}
          </strong>
          , apurado a partir dos próprios dados importados
          {denominadorPorEmpate
            ? ' (houve empate de frequência e adotou-se o maior denominador)'
            : ''}
          . {total === 1 ? 'O registro abaixo usa' : 'Os registros abaixo usam'} outro
          denominador e por isso não {total === 1 ? 'entra' : 'entram'} nas faixas{' '}
          <span className="whitespace-nowrap">0/{denominadorReferencia}</span> a{' '}
          <span className="whitespace-nowrap">
            {denominadorReferencia}/{denominadorReferencia}
          </span>
          .
        </p>
        <p>
          A exclusão vale apenas para a distribuição:{' '}
          {total === 1
            ? 'este registro continua somando'
            : 'estes registros continuam somando'}{' '}
          no percentual consolidado da habilidade, que permanece Σ acertos ÷ Σ itens
          possíveis.
        </p>
      </Alert>

      <TableContainer rotulo="Registros com denominador divergente">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estudante</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Turma</TableHead>
              <TableHead numerica>Denominador encontrado</TableHead>
              <TableHead>Resultado original</TableHead>
              <TableHead numerica>Percentual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {divergentes.map((registro) => (
              <TableRow key={registro.studentId}>
                <TableRowHeader>{registro.nomeOriginal}</TableRowHeader>
                <TableCell className="font-mono text-rotulo">
                  {registro.uniqueCode}
                </TableCell>
                <TableCell>
                  {registro.turma}{' '}
                  <span className="font-mono text-rotulo text-texto-suave">
                    ({registro.codigoTurma})
                  </span>
                </TableCell>
                <TableCell numerica>
                  {formatarNumero(registro.itensEncontrados)}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {registro.resultadoOriginal ?? (
                    <>
                      <span className="ausente" aria-hidden="true">
                        {AUSENTE}
                      </span>
                      <span className="apenas-leitor-de-tela">Sem valor de origem</span>
                    </>
                  )}
                </TableCell>
                <TableCell numerica>{formatPercent(registro.percentual)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </section>
  )
}
