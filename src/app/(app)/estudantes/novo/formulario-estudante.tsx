'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'

import {
  criarEstudanteAction,
  type EstadoEstudante,
} from '@/modules/students/application/actions'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export type OpcaoEscola = Readonly<{ id: string; nome: string }>
export type OpcaoTurma = Readonly<{
  id: string
  schoolId: string
  nome: string
  codigo: string
}>

const ESTADO_INICIAL: EstadoEstudante = {}

function BotaoSalvar() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Cadastrando…' : 'Cadastrar estudante'}
    </Button>
  )
}

/**
 * Cadastro individual — FR-168.
 *
 * O formulário não tem campo de código único: ele é gerado pelo sistema na criação (FR-169) e
 * é permanente (FR-129). Também não avisa sobre nome repetido: dois homônimos na mesma turma
 * são cadastro legítimo (FR-175), e o código único é justamente o que os distingue depois.
 */
export function FormularioEstudante({
  escolas,
  turmas,
}: {
  escolas: readonly OpcaoEscola[]
  turmas: readonly OpcaoTurma[]
}) {
  const [estado, acao] = useActionState<EstadoEstudante, FormData>(
    criarEstudanteAction,
    ESTADO_INICIAL,
  )

  const [escolaSelecionada, setEscolaSelecionada] = useState(escolas[0]?.id ?? '')

  const turmasDaEscola = useMemo(
    () => turmas.filter((t) => t.schoolId === escolaSelecionada),
    [turmas, escolaSelecionada],
  )

  const detalhes = estado.detalhes ?? {}

  return (
    <form action={acao} className="space-y-4" noValidate>
      {estado.erro ? <Alert variante="erro">{estado.erro}</Alert> : null}

      {estado.criado ? (
        <Alert variante="sucesso" titulo="Estudante cadastrado">
          Código único atribuído:{' '}
          <span className="font-mono font-semibold">{estado.criado.uniqueCode}</span>. Ele é
          permanente e deve acompanhar a criança nas próximas avaliações.
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="schoolId" obrigatorio>
          Escola
        </Label>
        <Select
          id="schoolId"
          name="schoolId"
          required
          value={escolaSelecionada}
          onChange={(evento) => setEscolaSelecionada(evento.target.value)}
          invalido={Boolean(detalhes['schoolId'])}
        >
          {escolas.map((escola) => (
            <option key={escola.id} value={escola.id}>
              {escola.nome}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="classId" obrigatorio>
          Turma
        </Label>
        <Select
          id="classId"
          name="classId"
          required
          invalido={Boolean(detalhes['classId'])}
          descritoPor="ajuda-turma"
        >
          {turmasDaEscola.map((turma) => (
            <option key={turma.id} value={turma.id}>
              {turma.nome} ({turma.codigo})
            </option>
          ))}
        </Select>
        <p id="ajuda-turma" className="text-rotulo text-texto-suave">
          {turmasDaEscola.length === 0
            ? 'Esta escola ainda não tem turmas. Envie a nominata para criá-las.'
            : 'A turma pertence à escola selecionada.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nomeOriginal" obrigatorio>
          Nome do estudante
        </Label>
        <Input
          id="nomeOriginal"
          name="nomeOriginal"
          required
          autoComplete="off"
          spellCheck={false}
          invalido={Boolean(detalhes['nomeOriginal'])}
          descritoPor="ajuda-nome"
        />
        <p id="ajuda-nome" className="text-rotulo text-texto-suave">
          Digite o nome como consta no documento da rede. Ele é guardado exatamente assim.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="codigoExterno">Código externo da rede (opcional)</Label>
        <Input
          id="codigoExterno"
          name="codigoExterno"
          autoComplete="off"
          spellCheck={false}
          invalido={Boolean(detalhes['codigoExterno'])}
          descritoPor="ajuda-codigo-externo"
        />
        <p id="ajuda-codigo-externo" className="text-rotulo text-texto-suave">
          Preencha apenas se a rede fornecer um identificador oficial. Ele é separado do código
          único gerado pelo sistema.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <BotaoSalvar />
        <Link href="/estudantes" className="text-sm text-primaria underline">
          Voltar para a lista
        </Link>
      </div>
    </form>
  )
}
