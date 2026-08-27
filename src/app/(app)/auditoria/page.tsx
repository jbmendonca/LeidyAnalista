import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { formatarDataHora } from '@/lib/format'
import {
  ACOES_AUDITORIA,
  ROTULO_ACAO,
  ehAcaoConhecida,
  lerDataDoFiltro,
  listarAuditoria,
  listarAutoresDeAuditoria,
} from '@/modules/audit/application/list-audit'
import { Alert } from '@/components/ui/alert'
import { Button, variantesBotao } from '@/components/ui/button'
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
  title: 'Auditoria',
  description: 'Trilha de auditoria: ação, autor, data/hora e entidade afetada.',
}

export const dynamic = 'force-dynamic'

type Parametros = Promise<Record<string, string | string[] | undefined>>

function primeiro(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  const texto = valor ?? null
  return texto === '' ? null : texto
}

function pagina(valor: string | null): number {
  if (valor === null) return 1
  const numero = Number.parseInt(valor, 10)
  return Number.isFinite(numero) && numero > 0 ? numero : 1
}

/** Preserva os filtros ao trocar de página. */
function comPagina(
  base: Record<string, string | null>,
  numeroDaPagina: number,
): string {
  const consulta = new URLSearchParams()
  for (const [chave, valor] of Object.entries(base)) {
    if (valor) consulta.set(chave, valor)
  }
  consulta.set('pagina', String(numeroDaPagina))
  return `/auditoria?${consulta.toString()}`
}

/**
 * Trilha de auditoria — FR-117, FR-120.
 *
 * Somente leitura, e é isso que a tela precisa comunicar: não há botão de editar, de excluir
 * nem de exportar em massa. Um registro de auditoria que a interface consegue alterar não é
 * auditoria.
 *
 * **Nenhuma coluna carrega nome de estudante.** A auditoria referencia por identificador
 * (Const. IV, FR-009): o que aparece aqui é o tipo e o id da entidade afetada. Os campos
 * `beforeValue` / `afterValue` sequer são consultados — quem precisa do dado da criança vai à
 * tela do estudante, onde a permissão de dados nominais (FR-007) é aplicada.
 */
export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Parametros
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/avaliacoes')

  const parametros = await searchParams
  const acaoBruta = primeiro(parametros['acao'])
  const usuarioBruto = primeiro(parametros['usuario'])
  const deBruto = primeiro(parametros['de'])
  const ateBruto = primeiro(parametros['ate'])

  const acao = acaoBruta !== null && ehAcaoConhecida(acaoBruta) ? acaoBruta : null
  const de = lerDataDoFiltro(deBruto)
  const ate = lerDataDoFiltro(ateBruto)
  const numeroDaPagina = pagina(primeiro(parametros['pagina']))

  const [resultado, autores] = await Promise.all([
    listarAuditoria(ctx, {
      action: acao,
      userId: usuarioBruto,
      de,
      ate,
      pagina: numeroDaPagina,
    }),
    listarAutoresDeAuditoria(ctx),
  ])

  const filtrosAtuais = {
    acao: acao,
    usuario: usuarioBruto,
    de: deBruto,
    ate: ateBruto,
  }
  const temFiltro = Object.values(filtrosAtuais).some((v) => Boolean(v))

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-texto">Auditoria</h1>
        <p className="max-w-prose text-sm text-texto-suave">
          Registro imutável de quem fez o quê e quando. As entidades são identificadas por
          tipo e identificador — nenhum nome de estudante aparece nesta trilha.
        </p>
      </header>

      <Alert variante="informativo" titulo="Trilha somente leitura">
        Registros de auditoria não podem ser alterados nem removidos pela interface. Desativar
        um usuário não apaga o que ele registrou: a autoria dos fatos passados permanece.
      </Alert>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label htmlFor="acao">Ação</Label>
          <Select id="acao" name="acao" defaultValue={acao ?? ''}>
            <option value="">Todas as ações</option>
            {ACOES_AUDITORIA.map((valor) => (
              <option key={valor} value={valor}>
                {ROTULO_ACAO[valor]}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label htmlFor="usuario">Autor</Label>
          <Select id="usuario" name="usuario" defaultValue={usuarioBruto ?? ''}>
            <option value="">Todos os autores</option>
            {autores.map((autor) => (
              <option key={autor.id} value={autor.id}>
                {autor.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="de">De</Label>
          <Input id="de" name="de" type="date" defaultValue={deBruto ?? ''} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ate">Até</Label>
          <Input
            id="ate"
            name="ate"
            type="date"
            defaultValue={ateBruto ?? ''}
            descritoPor="ate-ajuda"
          />
          <p id="ate-ajuda" className="text-rotulo text-texto-suave">
            Inclui o dia inteiro.
          </p>
        </div>

        <div className="flex gap-2">
          <Button type="submit" variante="secundario">
            Filtrar
          </Button>
          {temFiltro ? (
            <Link
              href="/auditoria"
              className={variantesBotao({ variante: 'sutil', tamanho: 'medio' })}
            >
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      <TableContainer rotulo="Registros de auditoria">
        <Table>
          <TableCaption>
            {resultado.total === 0
              ? 'Nenhum registro para o recorte selecionado.'
              : `${resultado.total} registro(s). Página ${resultado.pagina} de ${resultado.totalPaginas}.`}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Ação</TableHead>
              <TableHead>Autor</TableHead>
              <TableHead>Data e hora</TableHead>
              <TableHead>Tipo da entidade</TableHead>
              <TableHead>Identificador da entidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.linhas.length === 0 ? (
              <EmptyTableRow
                colunas={5}
                titulo="Nenhum registro para o recorte selecionado"
                orientacao={
                  temFiltro
                    ? 'Amplie o período ou remova algum filtro para ver os registros anteriores.'
                    : 'A trilha ainda não tem registros. Ela é preenchida conforme as ações do sistema acontecem.'
                }
              />
            ) : (
              resultado.linhas.map((linha) => (
                <TableRow key={linha.id}>
                  <TableRowHeader>{linha.rotuloAcao}</TableRowHeader>
                  <TableCell>{linha.autor.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatarDataHora(linha.occurredAt)}
                  </TableCell>
                  <TableCell>{linha.entityType}</TableCell>
                  <TableCell>
                    <code className="text-rotulo">{linha.entityId}</code>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {resultado.totalPaginas > 1 ? (
        <nav
          aria-label="Paginação da auditoria"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-texto-suave">
            Página {resultado.pagina} de {resultado.totalPaginas}
          </p>
          <div className="flex gap-2">
            {resultado.pagina > 1 ? (
              <Link
                href={comPagina(filtrosAtuais, resultado.pagina - 1)}
                className={variantesBotao({ variante: 'secundario', tamanho: 'pequeno' })}
              >
                Página anterior
              </Link>
            ) : null}
            {resultado.pagina < resultado.totalPaginas ? (
              <Link
                href={comPagina(filtrosAtuais, resultado.pagina + 1)}
                className={variantesBotao({ variante: 'secundario', tamanho: 'pequeno' })}
              >
                Próxima página
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  )
}
