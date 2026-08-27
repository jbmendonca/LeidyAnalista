'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button, variantesBotao } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { EstadoUsuario } from '@/modules/users/schemas'

/**
 * Formulário de criação de usuário.
 *
 * O componente não decide nada sobre permissão: quem confere o perfil e valida a entrada é a
 * server action, no servidor. O que ele faz é tornar a consequência de cada escolha legível
 * antes do envio — em especial a de dados nominais, que decide quem enxerga nome de criança.
 *
 * A permissão de dados nominais é um `<select>` de três opções e não uma caixa de seleção. O
 * motivo é técnico e vira acerto de produto: caixa desmarcada não é enviada pelo navegador,
 * e o servidor não conseguiria distinguir "o Administrador negou" de "o campo não veio" — a
 * diferença exata entre negar a permissão e aplicar o padrão do perfil (FR-007).
 */

const PERFIS = [
  {
    valor: 'ADMIN',
    rotulo: 'Administrador',
    descricao:
      'Acesso a todas as escolas, à configuração dos critérios analíticos, à auditoria e à gestão de usuários.',
    padraoNominal: 'concedida',
  },
  {
    valor: 'ANALISTA',
    rotulo: 'Gestor / Analista',
    descricao:
      'Análise sobre as escolas vinculadas. Opera sobre agregados na maior parte do trabalho.',
    padraoNominal: 'negada',
  },
  {
    valor: 'ESCOLA',
    rotulo: 'Escola',
    descricao:
      'Enxerga apenas as escolas vinculadas. Precisa dos nomes para agir pedagogicamente sobre as próprias crianças.',
    padraoNominal: 'concedida',
  },
] as const

type ValorPerfil = (typeof PERFIS)[number]['valor']

export type EscolaSelecionavel = {
  id: string
  name: string
  municipio: string
  estado: string
}

export type PropsFormularioUsuario = {
  acao: (estado: EstadoUsuario, formData: FormData) => Promise<EstadoUsuario>
  escolas: readonly EscolaSelecionavel[]
}

const ESTADO_INICIAL: EstadoUsuario = {}

function ErroDeCampo({ id, mensagem }: { id: string; mensagem: string | undefined }) {
  if (!mensagem) return null
  return (
    <p id={id} className="text-rotulo text-perigo">
      {mensagem}
    </p>
  )
}

export function FormularioUsuario({ acao, escolas }: PropsFormularioUsuario) {
  const [estado, enviar, enviando] = useActionState(acao, ESTADO_INICIAL)
  const [perfil, setPerfil] = useState<ValorPerfil>('ANALISTA')

  const selecionado = PERFIS.find((p) => p.valor === perfil) ?? PERFIS[1]

  const erroNome = estado.camposComErro?.['name']?.[0]
  const erroEmail = estado.camposComErro?.['email']?.[0]
  const erroSenha = estado.camposComErro?.['senha']?.[0]
  const erroPerfil = estado.camposComErro?.['role']?.[0]
  const erroEscolas = estado.camposComErro?.['schoolIds']?.[0]

  return (
    <form action={enviar} className="space-y-6">
      {estado.erro ? <Alert variante="erro">{estado.erro}</Alert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="name" obrigatorio>
          Nome
        </Label>
        <Input
          id="name"
          name="name"
          maxLength={200}
          autoComplete="name"
          invalido={Boolean(erroNome)}
          {...(erroNome ? { descritoPor: 'name-erro' } : {})}
        />
        <ErroDeCampo id="name-erro" mensagem={erroNome} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" obrigatorio>
          E-mail
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          maxLength={200}
          autoComplete="email"
          invalido={Boolean(erroEmail)}
          descritoPor={erroEmail ? 'email-erro email-ajuda' : 'email-ajuda'}
        />
        <p id="email-ajuda" className="text-rotulo text-texto-suave">
          É com ele que a pessoa entra no sistema.
        </p>
        <ErroDeCampo id="email-erro" mensagem={erroEmail} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senha" obrigatorio>
          Senha inicial
        </Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          invalido={Boolean(erroSenha)}
          descritoPor={erroSenha ? 'senha-erro senha-ajuda' : 'senha-ajuda'}
        />
        <p id="senha-ajuda" className="text-rotulo text-texto-suave">
          Ao menos 12 caracteres. Combine a senha por um canal separado do e-mail de
          convite.
        </p>
        <ErroDeCampo id="senha-erro" mensagem={erroSenha} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role" obrigatorio>
          Perfil
        </Label>
        <Select
          id="role"
          name="role"
          value={perfil}
          onChange={(evento) => setPerfil(evento.target.value as ValorPerfil)}
          invalido={Boolean(erroPerfil)}
          descritoPor={erroPerfil ? 'role-erro role-ajuda' : 'role-ajuda'}
        >
          {PERFIS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.rotulo}
            </option>
          ))}
        </Select>
        <p id="role-ajuda" className="text-rotulo text-texto-suave">
          {selecionado.descricao}
        </p>
        <ErroDeCampo id="role-erro" mensagem={erroPerfil} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-rotulo font-medium text-texto">
          Permissão de dados nominais
        </legend>
        <Select id="dadosNominais" name="dadosNominais" descritoPor="dadosNominais-ajuda">
          <option value="PADRAO">Padrão do perfil ({selecionado.padraoNominal})</option>
          <option value="CONCEDER">Conceder — verá os nomes das crianças</option>
          <option value="NEGAR">Negar — verá as telas sem os nomes</option>
        </Select>
        <p id="dadosNominais-ajuda" className="max-w-prose text-rotulo text-texto-suave">
          Esta permissão é do usuário, não do perfil, e o Administrador pode alterá-la a
          qualquer momento. Sem ela a pessoa <strong>não é bloqueada</strong>: continua
          vendo todas as telas, listas e relatórios, apenas sem os nomes das crianças.
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-rotulo font-medium text-texto">Escolas vinculadas</legend>
        <p id="schoolIds-ajuda" className="max-w-prose text-rotulo text-texto-suave">
          O vínculo é a autorização real: o usuário só enxerga o que está marcado aqui.
          Administrador acessa todas as escolas independentemente desta seleção.
        </p>

        {escolas.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhuma escola cadastrada ainda. Cadastre a primeira em Escolas para poder
            vincular usuários a ela.
          </p>
        ) : (
          <div
            role="group"
            aria-describedby="schoolIds-ajuda"
            className="max-h-64 space-y-2 overflow-y-auto rounded border border-borda p-3"
          >
            {escolas.map((escola) => (
              <label
                key={escola.id}
                htmlFor={`escola-${escola.id}`}
                className="flex items-start gap-2.5 text-sm text-texto"
              >
                <input
                  type="checkbox"
                  id={`escola-${escola.id}`}
                  name="schoolIds"
                  value={escola.id}
                  className="mt-0.5 size-4 rounded border-borda-forte text-primaria focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2"
                />
                <span>
                  {escola.name}
                  <span className="block text-rotulo text-texto-suave">
                    {escola.municipio} · {escola.estado}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        <ErroDeCampo id="schoolIds-erro" mensagem={erroEscolas} />
      </fieldset>

      <div className="flex flex-wrap gap-2 border-t border-borda pt-4">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar usuário'}
        </Button>
        <Link href="/usuarios" className={variantesBotao({ variante: 'secundario' })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
