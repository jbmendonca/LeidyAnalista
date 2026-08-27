'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'

import {
  importarNominataAction,
  type EstadoNominata,
} from '@/modules/students/application/actions'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
} from '@/components/ui/table'

export type OpcaoEscola = Readonly<{ id: string; nome: string }>

const ESTADO_INICIAL: EstadoNominata = {}

function BotaoEnviar() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Processando…' : 'Enviar nominata'}
    </Button>
  )
}

/**
 * Envio da nominata — FR-170.
 *
 * O relatório é a peça central desta tela: importação em lote sem prestação de contas do que
 * entrou, do que já existia e do que ficou de fora é exatamente o "dado perdido em silêncio"
 * que a constituição proíbe. Quando há erro, nada é gravado e cada linha problemática aparece
 * com o número que o operador vê na planilha.
 */
export function FormularioNominata({ escolas }: { escolas: readonly OpcaoEscola[] }) {
  const [estado, acao] = useActionState<EstadoNominata, FormData>(
    importarNominataAction,
    ESTADO_INICIAL,
  )

  const relatorio = estado.relatorio

  return (
    <div className="space-y-6">
      <form action={acao} className="space-y-4" noValidate>
        {estado.erro ? <Alert variante="erro">{estado.erro}</Alert> : null}

        <div className="space-y-1.5">
          <Label htmlFor="schoolId">Escola (opcional)</Label>
          <Select id="schoolId" name="schoolId" descritoPor="ajuda-escola">
            <option value="">Usar a coluna Escola do arquivo</option>
            {escolas.map((escola) => (
              <option key={escola.id} value={escola.id}>
                {escola.nome}
              </option>
            ))}
          </Select>
          <p id="ajuda-escola" className="text-rotulo text-texto-suave">
            Ao selecionar uma escola, linhas de outra escola são recusadas em vez de importadas
            no lugar errado.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="arquivo" obrigatorio>
            Arquivo da nominata
          </Label>
          <Input
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".csv,.xlsx,.xls"
            required
            descritoPor="ajuda-arquivo"
          />
          <p id="ajuda-arquivo" className="text-rotulo text-texto-suave">
            CSV, XLSX ou XLS com as colunas Escola, Código da Turma, Turma, Ano Escolar e
            Estudante.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <BotaoEnviar />
          <Link href="/estudantes" className="text-sm text-primaria underline">
            Voltar para a lista
          </Link>
        </div>
      </form>

      {relatorio ? (
        <section aria-labelledby="titulo-relatorio" className="space-y-4">
          <h2 id="titulo-relatorio">Relatório da importação</h2>

          {relatorio.aplicado ? (
            <Alert variante="sucesso" titulo="Nominata importada">
              {relatorio.criados} estudante{relatorio.criados === 1 ? '' : 's'} cadastrado
              {relatorio.criados === 1 ? '' : 's'} com código único, {relatorio.jaExistentes}{' '}
              já constava{relatorio.jaExistentes === 1 ? '' : 'm'} da base e{' '}
              {relatorio.turmasCriadas} turma{relatorio.turmasCriadas === 1 ? '' : 's'} criada
              {relatorio.turmasCriadas === 1 ? '' : 's'}.
            </Alert>
          ) : (
            <Alert variante="erro" titulo="Nada foi gravado">
              O arquivo tem ocorrências que impedem a importação. Nenhum estudante foi criado —
              corrija as linhas abaixo e envie novamente. Seriam cadastrados{' '}
              {relatorio.criaveis} estudante{relatorio.criaveis === 1 ? '' : 's'}.
            </Alert>
          )}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Linhas no arquivo', relatorio.totalLinhas],
              ['Cadastrados', relatorio.criados],
              ['Já existentes', relatorio.jaExistentes],
              ['Ocorrências', relatorio.problemas.length],
            ].map(([rotulo, valor]) => (
              <div key={String(rotulo)} className="rounded border border-borda p-3">
                <dt className="text-rotulo text-texto-suave">{rotulo}</dt>
                <dd className="text-lg font-semibold tabular-nums text-texto">{valor}</dd>
              </div>
            ))}
          </dl>

          {relatorio.problemas.length > 0 ? (
            <TableContainer rotulo="Ocorrências da nominata">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead numerica>Linha</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Coluna</TableHead>
                    <TableHead>Ocorrência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatorio.problemas.map((problema, indice) => (
                    <TableRow key={`${problema.codigo}-${problema.linha ?? 'geral'}-${indice}`}>
                      <TableCell numerica>{problema.linha ?? '—'}</TableCell>
                      <TableCell>{problema.severidade}</TableCell>
                      <TableCell>{problema.coluna ?? '—'}</TableCell>
                      <TableCell>{problema.mensagem}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
