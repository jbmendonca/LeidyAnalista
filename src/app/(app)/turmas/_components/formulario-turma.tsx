'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button, variantesBotao } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { EstadoFormulario } from '@/modules/classes/schemas'

/**
 * Formulário de turma, compartilhado por criar e editar.
 *
 * O `<select>` de escolas já vem montado com o escopo do usuário — mas isso é ergonomia, não
 * proteção: a server action revalida a escolha em `assertSchoolInScope`. Uma opção injetada no
 * DOM não vira permissão.
 *
 * O código da turma é opaco e gerado por outro sistema: o campo não força maiúsculas nem
 * remove caracteres. O sistema apenas apara os espaços das extremidades, e o texto de ajuda
 * diz isso — mexer mais arriscaria colidir dois códigos distintos.
 */

export type EscolaSelecionavel = {
  id: string
  name: string
  municipio: string
  estado: string
}

export type ValoresTurma = {
  schoolId: string
  externalCode: string
  name: string
  anoEscolar: string
}

export type PropsFormularioTurma = {
  acao: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>
  escolas: readonly EscolaSelecionavel[]
  valores?: ValoresTurma
  classId?: string
  rotuloEnvio: string
}

const ESTADO_INICIAL: EstadoFormulario = {}

export function FormularioTurma({
  acao,
  escolas,
  valores,
  classId,
  rotuloEnvio,
}: PropsFormularioTurma) {
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

      {classId ? <input type="hidden" name="classId" value={classId} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor="schoolId" obrigatorio>
          Escola
        </Label>
        <Select
          id="schoolId"
          name="schoolId"
          defaultValue={valores?.schoolId ?? ''}
          invalido={Boolean(erroDe('schoolId'))}
          {...(erroDe('schoolId') ? { descritoPor: 'schoolId-erro' } : {})}
        >
          <option value="">Selecione a escola</option>
          {escolas.map((escola) => (
            <option key={escola.id} value={escola.id}>
              {escola.name} — {escola.municipio}/{escola.estado}
            </option>
          ))}
        </Select>
        <MensagemDeErro campo="schoolId" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="externalCode" obrigatorio>
          Código da turma
        </Label>
        <Input
          id="externalCode"
          name="externalCode"
          defaultValue={valores?.externalCode ?? ''}
          maxLength={120}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-mono"
          invalido={Boolean(erroDe('externalCode'))}
          descritoPor={
            erroDe('externalCode')
              ? 'externalCode-erro externalCode-ajuda'
              : 'externalCode-ajuda'
          }
        />
        <p id="externalCode-ajuda" className="text-rotulo text-texto-suave">
          Código do sistema de origem. Só os espaços das extremidades são removidos;
          maiúsculas e minúsculas são preservadas. Precisa ser único dentro da escola.
        </p>
        <MensagemDeErro campo="externalCode" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name" obrigatorio>
            Nome da turma
          </Label>
          <Input
            id="name"
            name="name"
            defaultValue={valores?.name ?? ''}
            maxLength={120}
            placeholder="4º ano A"
            invalido={Boolean(erroDe('name'))}
            {...(erroDe('name') ? { descritoPor: 'name-erro' } : {})}
          />
          <MensagemDeErro campo="name" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="anoEscolar" obrigatorio>
            Ano escolar
          </Label>
          <Input
            id="anoEscolar"
            name="anoEscolar"
            defaultValue={valores?.anoEscolar ?? ''}
            maxLength={40}
            placeholder="4º ano"
            invalido={Boolean(erroDe('anoEscolar'))}
            {...(erroDe('anoEscolar') ? { descritoPor: 'anoEscolar-erro' } : {})}
          />
          <MensagemDeErro campo="anoEscolar" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : rotuloEnvio}
        </Button>
        <Link href="/turmas" className={variantesBotao({ variante: 'secundario' })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
