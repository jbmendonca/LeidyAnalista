'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { signIn, type EstadoLogin } from '@/modules/auth/application/sign-in'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ESTADO_INICIAL: EstadoLogin = {}

/**
 * Botão de envio.
 *
 * Vive separado porque `useFormStatus` só enxerga o formulário quando lido de dentro de um
 * filho dele. `disabled` durante o envio evita a autenticação duplicada de quem clica duas
 * vezes por impaciência — comportamento comum sob conexão lenta.
 */
function BotaoEntrar() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      largura="total"
      tamanho="grande"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </Button>
  )
}

export function FormularioLogin() {
  const [estado, acao] = useActionState<EstadoLogin, FormData>(signIn, ESTADO_INICIAL)

  return (
    <form action={acao} className="space-y-4" noValidate>
      {/*
        O erro precede os campos na ordem de leitura para que o leitor de tela o encontre
        antes de o usuário recomeçar a digitar. A mensagem é sempre a mesma, por decisão da
        camada de autenticação: distinguir "e-mail não existe" de "senha errada" permitiria
        descobrir quem tem conta no sistema.
      */}
      {estado.erro ? <Alert variante="erro">{estado.erro}</Alert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="email" obrigatorio>
          E-mail
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          invalido={Boolean(estado.erro)}
          placeholder="nome@rede.municipio.gov.br"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senha" obrigatorio>
          Senha
        </Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          invalido={Boolean(estado.erro)}
        />
      </div>

      <BotaoEntrar />
    </form>
  )
}
