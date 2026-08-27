import { notFound, redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { prisma } from '@/server/prisma'
import { getPreview } from '@/modules/imports/application/get-preview'
import { AppError } from '@/server/http-errors'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarNumero } from '@/lib/format'
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
import { AcoesImportacao } from './_components/acoes-importacao'

export const metadata = { title: 'Pré-visualização da importação' }

/**
 * Pré-visualização — FR-049, FR-050.
 *
 * Tudo o que se vê aqui vem do ESTÁGIO. Nenhum resultado de avaliação existe
 * ainda, e é exatamente este conjunto que a confirmação vai persistir: o
 * usuário não aprova uma leitura para o sistema gravar outra.
 */
export default async function PaginaPreVisualizacao({
  params,
}: {
  params: Promise<{ importId: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')

  const { importId } = await params

  let dados
  try {
    dados = await getPreview(ctx, importId, { amostra: 25 })
  } catch (erro) {
    if (erro instanceof AppError && erro.status === 404) notFound()
    throw erro
  }

  const { resumo, amostra, inconsistenciasPorTipo } = dados

  const registro = await prisma.import.findUniqueOrThrow({
    where: { id: importId },
    select: { status: true, fileHash: true, filePurgedAt: true },
  })

  const naoCadastrados =
    inconsistenciasPorTipo.find((i) => i.code === 'STUDENT_NOT_REGISTERED')?.quantidade ?? 0

  const jaConfirmada = registro.status === 'COMPLETED'
  const erros = inconsistenciasPorTipo.filter((i) => i.severity === 'ERROR')
  const alertas = inconsistenciasPorTipo.filter((i) => i.severity === 'WARNING')

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-texto">{resumo.arquivo}</h1>
        <p className="text-sm text-texto-suave">
          {resumo.avaliacao} · {resumo.escola}
        </p>
      </header>

      {jaConfirmada ? (
        <Alert variante="sucesso" titulo="Importação confirmada">
          Os resultados já foram persistidos e estão disponíveis nos painéis de análise.
        </Alert>
      ) : (
        <Alert variante="informativo" titulo="Nada foi gravado ainda">
          Este é o resultado da leitura do arquivo. Nenhum resultado de avaliação é persistido
          antes da sua confirmação.
        </Alert>
      )}

      <section aria-label="Resumo da leitura">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Resumo rotulo="Registros encontrados" valor={resumo.registrosEncontrados} />
          <Resumo rotulo="Avaliados" valor={resumo.registrosAvaliados} />
          <Resumo rotulo="Não avaliados" valor={resumo.registrosNaoAvaliados} />
          <Resumo rotulo="Turmas identificadas" valor={resumo.turmasIdentificadas} />
          <Resumo rotulo="Habilidades identificadas" valor={resumo.habilidadesIdentificadas} />
          <Resumo rotulo="Inconsistências críticas" valor={resumo.inconsistenciasCriticas} />
          <Resumo rotulo="Alertas" valor={resumo.alertas} />
        </dl>
      </section>

      <AcoesImportacao
        importId={importId}
        podeConfirmar={resumo.podeConfirmar}
        jaConfirmada={jaConfirmada}
        naoCadastrados={naoCadastrados}
        ehAdmin={ctx.role === 'ADMIN'}
      />

      {erros.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Inconsistências críticas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-texto-suave">
              Impedem a confirmação. Corrija o arquivo na origem e reenvie.
            </p>
            <ListaInconsistencias itens={erros} severidade="perigo" />
          </CardContent>
        </Card>
      )}

      {alertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-texto-suave">
              Não impedem a confirmação, mas exigem decisão consciente.
            </p>
            <ListaInconsistencias itens={alertas} severidade="aviso" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Amostra do que o sistema entendeu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-texto-suave">
            Valor original do arquivo ao lado do valor interpretado. Célula vazia aparece como
            travessão — ausência de resultado nunca vira zero.
          </p>
          <TableContainer rotulo="Amostra dos registros interpretados">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead numerica>Linha</TableHead>
                  <TableHead>Estudante</TableHead>
                  <TableHead>Turma</TableHead>
                  <TableHead>Avaliado</TableHead>
                  <TableHead>Nível (fonte)</TableHead>
                  <TableHead>H01 original → interpretado</TableHead>
                  <TableHead>H03 original → interpretado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {amostra.map((l) => {
                  const h01 = l.habilidades.find((h) => h.shortCode === 'H01')
                  const h03 = l.habilidades.find((h) => h.shortCode === 'H03')
                  return (
                    <TableRow key={l.rowNumber}>
                      <TableCell numerica>{l.rowNumber}</TableCell>
                      <TableRowHeader>{l.estudante}</TableRowHeader>
                      <TableCell>{l.codigoTurma}</TableCell>
                      <TableCell>{l.avaliado ? 'Sim' : 'Não'}</TableCell>
                      <TableCell>{l.nivelOriginal || '—'}</TableCell>
                      <TableCell>
                        <Celula original={h01?.valorOriginal} interpretado={h01?.interpretado} />
                      </TableCell>
                      <TableCell>
                        <Celula original={h03?.valorOriginal} interpretado={h03?.interpretado} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {resumo.registrosEncontrados > amostra.length && (
            <p className="text-sm text-texto-suave">
              Mostrando {amostra.length} de {formatarNumero(resumo.registrosEncontrados)}{' '}
              registros.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rastreabilidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-texto-suave">
          <p>
            <span className="font-medium text-texto">SHA-256 do arquivo:</span>{' '}
            <code className="break-all font-mono text-xs">{registro.fileHash}</code>
          </p>
          <p>
            {registro.filePurgedAt
              ? 'O arquivo original já foi expurgado pelo prazo de retenção. O hash acima continua provando qual conteúdo foi importado.'
              : 'O arquivo original está retido e será expurgado automaticamente ao fim do prazo de retenção. O hash permanece para sempre.'}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-md border border-borda bg-superficie p-3">
      <dt className="text-rotulo text-texto-suave">{rotulo}</dt>
      <dd className="text-xl font-semibold tabular-nums text-texto">
        {formatarNumero(valor)}
      </dd>
    </div>
  )
}

function Celula({
  original,
  interpretado,
}: {
  original: string | null | undefined
  interpretado: string | undefined
}) {
  if (!interpretado) return <span className="text-texto-suave">—</span>
  return (
    <span className="tabular-nums">
      <code className="font-mono text-xs text-texto-suave">
        {original === null || original === undefined || original.trim() === ''
          ? '(vazio)'
          : original}
      </code>{' '}
      → <span className="font-medium">{interpretado}</span>
    </span>
  )
}

function ListaInconsistencias({
  itens,
  severidade,
}: {
  itens: readonly { code: string; message: string; quantidade: number }[]
  severidade: 'perigo' | 'aviso'
}) {
  return (
    <ul className="space-y-2">
      {itens.map((i) => (
        <li key={`${i.code}-${i.message}`} className="flex items-start gap-3">
          <Badge variante={severidade}>{formatarNumero(i.quantidade)}</Badge>
          <div>
            <p className="text-texto">{i.message}</p>
            <p className="text-rotulo text-texto-suave">
              <code className="font-mono">{i.code}</code>
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
