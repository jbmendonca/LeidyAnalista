'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button, variantesBotao } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EstadoFormulario } from '@/modules/assessments/schemas'

/**
 * Formulário de avaliação, compartilhado por criar e editar.
 *
 * `dataAplicacao` é o único campo opcional da tela, e é rotulado como opcional em texto — não
 * apenas pela ausência do asterisco. Deixá-lo vazio grava `NULL`, nunca a data de hoje:
 * ausência é ausência (Const. I).
 */

export type ValoresAvaliacao = {
  nome: string
  ano: string
  ciclo: string
  componenteCurricular: string
  /** `yyyy-mm-dd` para o `<input type="date">`; vazio quando não houver data. */
  dataAplicacao: string
}

export type PropsFormularioAvaliacao = {
  acao: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>
  valores?: ValoresAvaliacao
  assessmentId?: string
  rotuloEnvio: string
}

const ESTADO_INICIAL: EstadoFormulario = {}

export function FormularioAvaliacao({
  acao,
  valores,
  assessmentId,
  rotuloEnvio,
}: PropsFormularioAvaliacao) {
  const [estado, enviar, enviando] = useActionState(acao, ESTADO_INICIAL)

  const erroDe = (campo: string): string | undefined => estado.camposComErro?.[campo]?.[0]

  const MensagemDeErro = ({ campo }: { campo: string }) => {
    const erro = erroDe(campo)
    if (!erro) return null
    return (
      <p id={`${campo}-erro`} className="text-rotulo text-perigo">
        {erro}
      </p>
    )
  }

  return (
    <form action={enviar} className="space-y-5">
      {estado.erro ? <Alert variante="erro">{estado.erro}</Alert> : null}

      {assessmentId ? (
        <input type="hidden" name="assessmentId" value={assessmentId} />
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="nome" obrigatorio>
          Nome da avaliação
        </Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={valores?.nome ?? ''}
          maxLength={200}
          invalido={Boolean(erroDe('nome'))}
          {...(erroDe('nome') ? { descritoPor: 'nome-erro' } : {})}
        />
        <MensagemDeErro campo="nome" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ano" obrigatorio>
            Ano
          </Label>
          <Input
            id="ano"
            name="ano"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            step={1}
            defaultValue={valores?.ano ?? ''}
            className="w-32"
            invalido={Boolean(erroDe('ano'))}
            {...(erroDe('ano') ? { descritoPor: 'ano-erro' } : {})}
          />
          <MensagemDeErro campo="ano" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ciclo" obrigatorio>
            Ciclo
          </Label>
          <Input
            id="ciclo"
            name="ciclo"
            defaultValue={valores?.ciclo ?? ''}
            maxLength={80}
            placeholder="II Ciclo"
            invalido={Boolean(erroDe('ciclo'))}
            {...(erroDe('ciclo') ? { descritoPor: 'ciclo-erro' } : {})}
          />
          <MensagemDeErro campo="ciclo" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="componenteCurricular" obrigatorio>
          Componente curricular
        </Label>
        <Input
          id="componenteCurricular"
          name="componenteCurricular"
          defaultValue={valores?.componenteCurricular ?? ''}
          maxLength={120}
          placeholder="Leitura"
          invalido={Boolean(erroDe('componenteCurricular'))}
          {...(erroDe('componenteCurricular')
            ? { descritoPor: 'componenteCurricular-erro' }
            : {})}
        />
        <MensagemDeErro campo="componenteCurricular" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dataAplicacao">Data de aplicação</Label>
        <Input
          id="dataAplicacao"
          name="dataAplicacao"
          type="date"
          defaultValue={valores?.dataAplicacao ?? ''}
          className="w-52"
          invalido={Boolean(erroDe('dataAplicacao'))}
          descritoPor={
            erroDe('dataAplicacao')
              ? 'dataAplicacao-erro dataAplicacao-ajuda'
              : 'dataAplicacao-ajuda'
          }
        />
        <p id="dataAplicacao-ajuda" className="text-rotulo text-texto-suave">
          Opcional. Em branco, a avaliação fica sem data registrada — não recebe a data de
          hoje.
        </p>
        <MensagemDeErro campo="dataAplicacao" />
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : rotuloEnvio}
        </Button>
        <Link href="/avaliacoes" className={variantesBotao({ variante: 'secundario' })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
