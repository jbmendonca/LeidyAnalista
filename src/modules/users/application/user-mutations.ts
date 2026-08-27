import { Prisma } from '@prisma/client'

import { prisma, type Tx } from '@/server/prisma'
import {
  assertSchoolInScope,
  requireRole,
  type AuthContext,
} from '@/server/authorization'
import { conflito, naoEncontrado } from '@/server/http-errors'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { hashPassword } from '@/modules/auth/domain/password'
import {
  resolverDadosNominais,
  type EntradaAtualizacaoUsuario,
  type EntradaNovoUsuario,
  type Perfil,
} from '@/modules/users/schemas'

/**
 * ===========================================================================
 *  NÚCLEO TRANSACIONAL DA GESTÃO DE USUÁRIOS — FR-005, FR-007, FR-117
 * ===========================================================================
 *
 * Vive fora do arquivo `'use server'` de propósito. Em um módulo de server actions **todo**
 * export vira endpoint alcançável pelo navegador; expor aqui uma função que recebe
 * `AuthContext` por parâmetro permitiria ao cliente declarar o próprio perfil e criar um
 * Administrador. Estas funções recebem `ctx` porque quem as chama já o resolveu no servidor —
 * e por isso não podem morar do outro lado daquela fronteira. Mesmo padrão de
 * `src/modules/schools/application/school-mutations.ts`.
 *
 * Duas regras próprias deste módulo:
 *
 *  1. **A auditoria referencia por identificador** (Const. IV, FR-009). Nome, e-mail e hash
 *     de senha NÃO entram em `beforeValue`, `afterValue` nem `metadata`. O que se audita é a
 *     mudança de poder — perfil, situação, permissão nominal, escolas — e o `entityId` diz
 *     de quem se trata.
 *  2. **Alterar `canAccessNominalData` tem verbo próprio**:
 *     `USER_NOMINAL_PERMISSION_CHANGE`. Ela não é detalhe do cadastro — é a permissão que
 *     decide quem vê nome de criança (FR-007), e precisa ser rastreável sem depender de
 *     comparar dois JSON de um `USER_UPDATE` genérico.
 */

const ENTIDADE = 'User'

export type UsuarioAfetado = Readonly<{ id: string }>

function emailDuplicado(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}

/**
 * Valida cada escola contra o escopo do requisitante.
 *
 * Um Administrador tem todas as escolas em `allowedSchoolIds`, de modo que um id inexistente
 * cai em `naoEncontrado` — 404, e não um vínculo órfão que estouraria na chave estrangeira
 * com mensagem de banco.
 */
function escolasNoEscopo(ctx: AuthContext, schoolIds: readonly string[]): string[] {
  return schoolIds.map((id) => assertSchoolInScope(ctx, id))
}

/** Recorte auditável de um usuário. Sem nome, sem e-mail, sem hash. */
function retrato(v: {
  role: Perfil
  active: boolean
  canAccessNominalData: boolean
  schoolIds: readonly string[]
}): Prisma.InputJsonValue {
  return {
    role: v.role,
    active: v.active,
    canAccessNominalData: v.canAccessNominalData,
    schoolIds: [...v.schoolIds],
  }
}

export async function criarUsuario(
  ctx: AuthContext,
  entrada: EntradaNovoUsuario,
): Promise<UsuarioAfetado> {
  const autor = requireRole(ctx, 'ADMIN')
  const schoolIds = escolasNoEscopo(autor, entrada.schoolIds)

  // FR-007: o perfil define o valor INICIAL da permissão; o Administrador pode sobrepô-lo
  // já na criação. Depois disso ela é atributo do usuário, não do papel.
  const canAccessNominalData = resolverDadosNominais(entrada.dadosNominais, entrada.role)

  const passwordHash = await hashPassword(entrada.senha)

  try {
    return await prisma.$transaction(async (tx) => {
      const usuario = await tx.user.create({
        data: {
          name: entrada.name,
          email: entrada.email,
          passwordHash,
          role: entrada.role,
          canAccessNominalData,
          active: true,
          ...(schoolIds.length > 0
            ? {
                schools: {
                  createMany: { data: schoolIds.map((schoolId) => ({ schoolId })) },
                },
              }
            : {}),
        },
        select: { id: true },
      })

      await registrarAuditoria(tx, {
        action: 'USER_CREATE',
        userId: autor.userId,
        entityType: ENTIDADE,
        entityId: usuario.id,
        afterValue: retrato({
          role: entrada.role,
          active: true,
          canAccessNominalData,
          schoolIds,
        }),
        metadata: {
          operacao: 'CRIAR',
          entidade: ENTIDADE,
          // Registra se a permissão nasceu do padrão do perfil ou de decisão explícita.
          origemPermissaoNominal: entrada.dadosNominais,
        },
      })

      return { id: usuario.id }
    })
  } catch (erro) {
    if (emailDuplicado(erro)) {
      throw conflito('Já existe usuário cadastrado com este e-mail.')
    }
    throw erro
  }
}

/**
 * Atualiza cadastro, perfil, situação, vínculos e — quando muda — a permissão nominal.
 *
 * A permissão gera um segundo registro de auditoria com verbo próprio. Os dois convivem: o
 * `USER_UPDATE` conta o que foi editado, o `USER_NOMINAL_PERMISSION_CHANGE` conta quem
 * ganhou ou perdeu acesso a nome de criança.
 */
export async function atualizarUsuario(
  ctx: AuthContext,
  userId: string,
  entrada: EntradaAtualizacaoUsuario,
): Promise<UsuarioAfetado> {
  const autor = requireRole(ctx, 'ADMIN')
  const schoolIds = escolasNoEscopo(autor, entrada.schoolIds)

  // Um Administrador que se desativa ou se rebaixa perde o acesso na próxima requisição, e
  // sendo o único do sistema deixa a instalação sem quem administre. É recusado.
  if (userId === autor.userId && !entrada.active) {
    throw conflito('Você não pode desativar a própria conta.')
  }
  if (userId === autor.userId && entrada.role !== 'ADMIN') {
    throw conflito('Você não pode remover o próprio perfil de Administrador.')
  }

  const passwordHash =
    entrada.senha === undefined ? undefined : await hashPassword(entrada.senha)

  try {
    return await prisma.$transaction(async (tx) => {
      const anterior = await tx.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          active: true,
          canAccessNominalData: true,
          schools: { select: { schoolId: true } },
        },
      })
      if (!anterior) throw naoEncontrado('Usuário')

      const schoolIdsAnteriores = anterior.schools.map((v) => v.schoolId)

      await tx.user.update({
        where: { id: userId },
        data: {
          name: entrada.name,
          email: entrada.email,
          role: entrada.role,
          active: entrada.active,
          canAccessNominalData: entrada.canAccessNominalData,
          ...(passwordHash === undefined ? {} : { passwordHash }),
        },
      })

      // Vínculos são substituídos por inteiro: `UserSchool` é a autorização, e uma
      // reconciliação parcial deixaria escopo residual de uma escola já removida da tela.
      await tx.userSchool.deleteMany({ where: { userId } })
      if (schoolIds.length > 0) {
        await tx.userSchool.createMany({
          data: schoolIds.map((schoolId) => ({ userId, schoolId })),
        })
      }

      await registrarAuditoria(tx, {
        action: 'USER_UPDATE',
        userId: autor.userId,
        entityType: ENTIDADE,
        entityId: userId,
        beforeValue: retrato({
          role: anterior.role,
          active: anterior.active,
          canAccessNominalData: anterior.canAccessNominalData,
          schoolIds: schoolIdsAnteriores,
        }),
        afterValue: retrato({
          role: entrada.role,
          active: entrada.active,
          canAccessNominalData: entrada.canAccessNominalData,
          schoolIds,
        }),
        metadata: {
          operacao: 'ATUALIZAR',
          entidade: ENTIDADE,
          senhaRedefinida: passwordHash !== undefined,
        },
      })

      if (anterior.canAccessNominalData !== entrada.canAccessNominalData) {
        await registrarPermissaoNominal(
          tx,
          autor.userId,
          userId,
          anterior.canAccessNominalData,
          entrada.canAccessNominalData,
          'ATUALIZACAO_DE_CADASTRO',
        )
      }

      return { id: userId }
    })
  } catch (erro) {
    if (emailDuplicado(erro)) {
      throw conflito('Já existe usuário cadastrado com este e-mail.')
    }
    throw erro
  }
}

async function registrarPermissaoNominal(
  tx: Tx,
  autorId: string,
  usuarioAlvoId: string,
  antes: boolean,
  depois: boolean,
  origem: string,
): Promise<void> {
  await registrarAuditoria(tx, {
    action: 'USER_NOMINAL_PERMISSION_CHANGE',
    userId: autorId,
    entityType: ENTIDADE,
    entityId: usuarioAlvoId,
    beforeValue: { canAccessNominalData: antes },
    afterValue: { canAccessNominalData: depois },
    metadata: { operacao: 'PERMISSAO_DADOS_NOMINAIS', origem },
  })
}

/**
 * Concede ou revoga a permissão de dados nominais — FR-007.
 *
 * Caminho dedicado, usado pelo controle de uma linha da listagem. Não escreve `USER_UPDATE`:
 * nada além da permissão mudou, e um segundo registro genérico só tornaria a trilha mais
 * difícil de ler.
 *
 * Alteração sem efeito não gera auditoria — registrar "de verdadeiro para verdadeiro"
 * encheria a trilha de ruído e esconderia as mudanças reais.
 */
export async function definirPermissaoDadosNominais(
  ctx: AuthContext,
  userId: string,
  conceder: boolean,
): Promise<UsuarioAfetado> {
  const autor = requireRole(ctx, 'ADMIN')

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.user.findUnique({
      where: { id: userId },
      select: { canAccessNominalData: true },
    })
    if (!anterior) throw naoEncontrado('Usuário')

    if (anterior.canAccessNominalData === conceder) return { id: userId }

    await tx.user.update({
      where: { id: userId },
      data: { canAccessNominalData: conceder },
    })

    await registrarPermissaoNominal(
      tx,
      autor.userId,
      userId,
      anterior.canAccessNominalData,
      conceder,
      'CONTROLE_DA_LISTAGEM',
    )

    return { id: userId }
  })
}

/**
 * Ativa ou desativa a conta — FR-005.
 *
 * Desativar não apaga: sessões deixam de ser válidas em `getAuthContext`, e o histórico de
 * auditoria continua apontando para um usuário que existe. Remover a linha quebraria a
 * chave estrangeira de `AuditLog` e apagaria a autoria de fatos passados.
 */
export async function definirSituacaoDoUsuario(
  ctx: AuthContext,
  userId: string,
  ativo: boolean,
): Promise<UsuarioAfetado> {
  const autor = requireRole(ctx, 'ADMIN')

  if (userId === autor.userId && !ativo) {
    throw conflito('Você não pode desativar a própria conta.')
  }

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, active: true, canAccessNominalData: true },
    })
    if (!anterior) throw naoEncontrado('Usuário')

    if (anterior.active === ativo) return { id: userId }

    await tx.user.update({ where: { id: userId }, data: { active: ativo } })

    await registrarAuditoria(tx, {
      action: 'USER_UPDATE',
      userId: autor.userId,
      entityType: ENTIDADE,
      entityId: userId,
      beforeValue: { active: anterior.active },
      afterValue: { active: ativo },
      metadata: {
        operacao: ativo ? 'REATIVAR' : 'DESATIVAR',
        entidade: ENTIDADE,
      },
    })

    return { id: userId }
  })
}
