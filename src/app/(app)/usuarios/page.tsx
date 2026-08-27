import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { formatarData } from '@/lib/format'
import { ROTULO_PERFIL } from '@/modules/users/schemas'
import { listarUsuarios } from '@/modules/users/application/list-users'
import {
  alternarPermissaoNominalAction,
  alternarSituacaoUsuarioAction,
} from '@/modules/users/application/user-actions'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, variantesBotao } from '@/components/ui/button'
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
  title: 'Usuários',
  description: 'Perfis, escolas vinculadas e permissão de dados nominais.',
}

export const dynamic = 'force-dynamic'

/**
 * Gestão de usuários — FR-005, FR-006, FR-007.
 *
 * Os controles de cada linha são `<form>` de verdade, com server action, e não botões com
 * `onClick`: funcionam sem JavaScript no cliente e cada envio é uma requisição que o
 * servidor autoriza do zero. Para um controle que decide quem enxerga nome de criança, essa
 * é a forma certa.
 *
 * A coluna de permissão nominal traz o estado em texto — "Concedida" / "Negada" — e não
 * apenas uma cor ou um ícone. Nenhuma informação desta tela é transmitida só por cor
 * (WCAG 1.4.1).
 */
export default async function PaginaUsuarios() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/avaliacoes')

  const usuarios = await listarUsuarios(ctx)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-texto">Usuários</h1>
          <p className="max-w-prose text-sm text-texto-suave">
            Perfil, escolas vinculadas e permissão de dados nominais. O vínculo com a
            escola é a autorização real: o usuário só enxerga o que está vinculado a ele.
          </p>
        </div>

        <Link href="/usuarios/novo" className={variantesBotao()}>
          Novo usuário
        </Link>
      </header>

      <Alert variante="informativo" titulo="Sobre a permissão de dados nominais">
        Ela é do usuário, não do perfil. Quem não a possui{' '}
        <strong>não é bloqueado</strong>: recebe a versão agregada de toda tela, relatório
        e exportação, sem os nomes das crianças. Cada alteração fica registrada na
        auditoria.
      </Alert>

      <TableContainer rotulo="Usuários do sistema">
        <Table>
          <TableCaption>
            {usuarios.length === 1
              ? '1 usuário cadastrado.'
              : `${usuarios.length} usuários cadastrados.`}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Escolas vinculadas</TableHead>
              <TableHead>Dados nominais</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 ? (
              <EmptyTableRow
                colunas={6}
                titulo="Nenhum usuário cadastrado"
                orientacao="Cadastre o primeiro usuário para liberar o acesso ao painel."
              />
            ) : (
              usuarios.map((usuario) => {
                const ehVoce = usuario.id === ctx.userId

                return (
                  <TableRow key={usuario.id}>
                    <TableRowHeader>
                      {usuario.name}
                      {ehVoce ? (
                        <span className="ml-1.5 text-rotulo font-normal text-texto-suave">
                          (você)
                        </span>
                      ) : null}
                      <span className="block text-rotulo font-normal text-texto-suave">
                        {usuario.email}
                      </span>
                    </TableRowHeader>

                    <TableCell>{ROTULO_PERFIL[usuario.role]}</TableCell>

                    <TableCell>
                      {usuario.role === 'ADMIN' ? (
                        <span className="text-texto-suave">
                          Todas as escolas (perfil Administrador)
                        </span>
                      ) : usuario.escolas.length === 0 ? (
                        <span className="text-texto-suave">
                          Nenhuma — este usuário não enxerga dado algum
                        </span>
                      ) : (
                        <ul className="space-y-0.5">
                          {usuario.escolas.map((escola) => (
                            <li key={escola.id}>{escola.name}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge
                          variante={usuario.canAccessNominalData ? 'destaque' : 'neutro'}
                        >
                          {usuario.canAccessNominalData ? 'Concedida' : 'Negada'}
                        </Badge>

                        <form action={alternarPermissaoNominalAction}>
                          <input type="hidden" name="userId" value={usuario.id} />
                          <input
                            type="hidden"
                            name="conceder"
                            value={usuario.canAccessNominalData ? 'false' : 'true'}
                          />
                          <Button type="submit" variante="secundario" tamanho="pequeno">
                            {usuario.canAccessNominalData ? 'Negar' : 'Conceder'}
                            <span className="apenas-leitor-de-tela">
                              {' '}
                              acesso a dados nominais para {usuario.name}
                            </span>
                          </Button>
                        </form>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge variante={usuario.active ? 'sucesso' : 'neutro'}>
                          {usuario.active ? 'Ativo' : 'Inativo'}
                        </Badge>

                        {/* Desativar a própria conta tiraria o Administrador do sistema na
                            requisição seguinte: o controle nem é oferecido, e a mutação
                            recusa de qualquer forma. */}
                        {ehVoce ? (
                          <span className="text-rotulo text-texto-suave">
                            Não é possível desativar a própria conta
                          </span>
                        ) : (
                          <form action={alternarSituacaoUsuarioAction}>
                            <input type="hidden" name="userId" value={usuario.id} />
                            <input
                              type="hidden"
                              name="ativar"
                              value={usuario.active ? 'false' : 'true'}
                            />
                            <Button type="submit" variante="secundario" tamanho="pequeno">
                              {usuario.active ? 'Desativar' : 'Reativar'}
                              <span className="apenas-leitor-de-tela">
                                {' '}
                                o usuário {usuario.name}
                              </span>
                            </Button>
                          </form>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>{formatarData(usuario.createdAt)}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  )
}
