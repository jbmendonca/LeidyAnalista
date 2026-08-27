'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button, variantesBotao } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EstadoFormulario } from '@/modules/schools/schemas'

/**
 * Formulário de escola, compartilhado por criar e editar.
 *
 * O componente não decide nada sobre permissão: ele apenas envia. Quem valida a entrada e
 * confere o perfil é a server action recebida em `acao`, no servidor. Esconder o botão seria
 * cortesia visual, jamais autorização.
 *
 * Cada erro de campo é ligado ao seu controle por `aria-describedby` e `aria-invalid` — uma
 * borda vermelha sozinha não chega a quem usa leitor de tela nem a quem não percebe cor.
 */

export type ValoresEscola = {
  code: string
  name: string
  rede: string
  municipio: string
  estado: string
}

export type PropsFormularioEscola = {
  acao: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>
  /** Preenchimento inicial na edição. Ausente na criação. */
  valores?: ValoresEscola
  /** Enviado como campo oculto na edição; é filtro, não autorização. */
  schoolId?: string
  rotuloEnvio: string
}

const ESTADO_INICIAL: EstadoFormulario = {}

type Campo = {
  nome: keyof ValoresEscola
  rotulo: string
  ajuda: string
  maxLength: number
  className?: string
}

const CAMPOS: readonly Campo[] = [
  {
    nome: 'code',
    rotulo: 'Código da escola',
    ajuda: 'Código do INEP ou da rede. Preservado exatamente como informado.',
    maxLength: 40,
  },
  { nome: 'name', rotulo: 'Nome da escola', ajuda: '', maxLength: 200 },
  {
    nome: 'rede',
    rotulo: 'Rede de ensino',
    ajuda: 'Municipal, estadual, federal.',
    maxLength: 120,
  },
  { nome: 'municipio', rotulo: 'Município', ajuda: '', maxLength: 120 },
  {
    nome: 'estado',
    rotulo: 'UF',
    ajuda: 'Duas letras, como CE.',
    maxLength: 2,
    className: 'w-24 uppercase',
  },
]

export function FormularioEscola({
  acao,
  valores,
  schoolId,
  rotuloEnvio,
}: PropsFormularioEscola) {
  const [estado, enviar, enviando] = useActionState(acao, ESTADO_INICIAL)

  return (
    <form action={enviar} className="space-y-5">
      {estado.erro ? <Alert variante="erro">{estado.erro}</Alert> : null}

      {schoolId ? <input type="hidden" name="schoolId" value={schoolId} /> : null}

      {CAMPOS.map((campo) => {
        const erro = estado.camposComErro?.[campo.nome]?.[0]
        const idAjuda = `${campo.nome}-ajuda`
        const idErro = `${campo.nome}-erro`
        const descritoPor = [erro ? idErro : '', campo.ajuda ? idAjuda : '']
          .filter((p) => p !== '')
          .join(' ')

        return (
          <div key={campo.nome} className="space-y-1.5">
            <Label htmlFor={campo.nome} obrigatorio>
              {campo.rotulo}
            </Label>
            <Input
              id={campo.nome}
              name={campo.nome}
              defaultValue={valores?.[campo.nome] ?? ''}
              maxLength={campo.maxLength}
              invalido={Boolean(erro)}
              {...(campo.className ? { className: campo.className } : {})}
              {...(descritoPor !== '' ? { descritoPor } : {})}
            />
            {campo.ajuda ? (
              <p id={idAjuda} className="text-rotulo text-texto-suave">
                {campo.ajuda}
              </p>
            ) : null}
            {erro ? (
              <p id={idErro} className="text-rotulo text-perigo">
                {erro}
              </p>
            ) : null}
          </div>
        )
      })}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : rotuloEnvio}
        </Button>
        <Link href="/escolas" className={variantesBotao({ variante: 'secundario' })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
