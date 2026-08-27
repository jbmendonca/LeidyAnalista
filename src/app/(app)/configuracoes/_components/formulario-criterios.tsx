'use client'

import { useActionState } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { NivelAprendizagem } from '@/components/ui/nivel-badge'
import type { EstadoCriterios } from '@/modules/settings/schemas'

/**
 * Formulário dos critérios analíticos.
 *
 * O componente não decide nada sobre permissão: ele apenas envia. Quem valida a entrada e
 * confere o perfil é a server action, no servidor. Esconder o botão seria cortesia visual,
 * jamais autorização.
 *
 * Cada erro de campo é ligado ao seu controle por `aria-describedby` e `aria-invalid` — uma
 * borda vermelha sozinha não chega a quem usa leitor de tela nem a quem não percebe cor.
 *
 * A lista de níveis é local, com rótulos: o tipo vem de `NivelBadge`, que é o componente da
 * classificação **da fonte**. Importá-lo aqui é proposital — deixa evidente, no próprio
 * código, que este formulário apenas *seleciona* níveis existentes e não cria nenhum.
 */

const NIVEIS = [
  { valor: 'ADEQUADO', rotulo: 'Adequado' },
  { valor: 'INTERMEDIARIO', rotulo: 'Intermediário' },
  { valor: 'DEFASAGEM', rotulo: 'Defasagem' },
] as const satisfies readonly { valor: NivelAprendizagem; rotulo: string }[]

export type ValoresCriterios = {
  fragilidadeMax: string
  atencaoMax: string
  baixoRendimento: readonly string[]
  abaixoDoAdequadoHabilitado: boolean
}

export type PropsFormularioCriterios = {
  acao: (estado: EstadoCriterios, formData: FormData) => Promise<EstadoCriterios>
  /** Preenchimento inicial: os valores da versão vigente. Ausente quando não há nenhuma. */
  valores?: ValoresCriterios
}

const ESTADO_INICIAL: EstadoCriterios = {}

/** `"60.00"` no formulário aparece como `"60,00"` — vírgula é o separador de pt-BR. */
function paraCampo(literal: string | undefined): string {
  return literal === undefined ? '' : literal.replace('.', ',')
}

function ErroDeCampo({ id, mensagem }: { id: string; mensagem: string | undefined }) {
  if (!mensagem) return null
  return (
    <p id={id} className="text-rotulo text-perigo">
      {mensagem}
    </p>
  )
}

export function FormularioCriterios({ acao, valores }: PropsFormularioCriterios) {
  const [estado, enviar, enviando] = useActionState(acao, ESTADO_INICIAL)

  const erroFragilidade = estado.camposComErro?.['fragilidadeMax']?.[0]
  const erroAtencao = estado.camposComErro?.['atencaoMax']?.[0]
  const erroNiveis = estado.camposComErro?.['baixoRendimento']?.[0]

  const selecionados = new Set(valores?.baixoRendimento ?? [])

  return (
    <form action={enviar} className="space-y-7">
      {estado.erro ? <Alert variante="erro">{estado.erro}</Alert> : null}

      {estado.versaoCriada !== undefined ? (
        <Alert variante="sucesso" titulo={`Versão ${estado.versaoCriada} registrada`}>
          A versão anterior permanece gravada e continua explicando os relatórios emitidos
          enquanto ela vigorou. Nenhum valor importado foi alterado.
        </Alert>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-texto">
          Faixas de situação analítica
        </legend>
        <p className="max-w-prose text-sm text-texto-suave">
          Os dois valores são <strong>limites superiores exclusivos</strong>, em pontos
          percentuais. Com 60 e 80: abaixo de 60% é Fragilidade, de 60% a 79,99% é Atenção,
          e 80% ou mais é Satisfatório.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fragilidadeMax" obrigatorio>
              Limite da faixa Fragilidade
            </Label>
            <Input
              id="fragilidadeMax"
              name="fragilidadeMax"
              defaultValue={paraCampo(valores?.fragilidadeMax)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={6}
              placeholder="60"
              invalido={Boolean(erroFragilidade)}
              descritoPor={
                erroFragilidade ? 'fragilidadeMax-erro fragilidadeMax-ajuda' : 'fragilidadeMax-ajuda'
              }
            />
            <p id="fragilidadeMax-ajuda" className="text-rotulo text-texto-suave">
              Resultado abaixo deste percentual entra em Fragilidade.
            </p>
            <ErroDeCampo id="fragilidadeMax-erro" mensagem={erroFragilidade} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="atencaoMax" obrigatorio>
              Limite da faixa Atenção
            </Label>
            <Input
              id="atencaoMax"
              name="atencaoMax"
              defaultValue={paraCampo(valores?.atencaoMax)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={6}
              placeholder="80"
              invalido={Boolean(erroAtencao)}
              descritoPor={erroAtencao ? 'atencaoMax-erro atencaoMax-ajuda' : 'atencaoMax-ajuda'}
            />
            <p id="atencaoMax-ajuda" className="text-rotulo text-texto-suave">
              A partir deste percentual o resultado é Satisfatório.
            </p>
            <ErroDeCampo id="atencaoMax-erro" mensagem={erroAtencao} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-texto">
          Níveis que compõem a visão de baixo rendimento
        </legend>
        <p className="max-w-prose text-sm text-texto-suave">
          Seleção de agrupamento para consulta. Os níveis continuam exatamente como vieram
          da fonte — marcar um nível aqui não altera o dado de nenhuma criança.
        </p>

        <div className="space-y-2" role="group" aria-describedby="baixoRendimento-ajuda">
          {NIVEIS.map((nivel) => (
            <label
              key={nivel.valor}
              htmlFor={`baixoRendimento-${nivel.valor}`}
              className="flex items-center gap-2.5 text-sm text-texto"
            >
              <input
                type="checkbox"
                id={`baixoRendimento-${nivel.valor}`}
                name="baixoRendimento"
                value={nivel.valor}
                defaultChecked={selecionados.has(nivel.valor)}
                className="size-4 rounded border-borda-forte text-primaria focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2"
              />
              {nivel.rotulo}
            </label>
          ))}
        </div>
        <p id="baixoRendimento-ajuda" className="text-rotulo text-texto-suave">
          Nenhum nível marcado desliga a visão de baixo rendimento.
        </p>
        <ErroDeCampo id="baixoRendimento-erro" mensagem={erroNiveis} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-texto">
          Visão &ldquo;Abaixo do adequado&rdquo;
        </legend>

        <label
          htmlFor="abaixoDoAdequadoHabilitado"
          className="flex items-start gap-2.5 text-sm text-texto"
        >
          <input
            type="checkbox"
            id="abaixoDoAdequadoHabilitado"
            name="abaixoDoAdequadoHabilitado"
            defaultChecked={valores?.abaixoDoAdequadoHabilitado ?? false}
            aria-describedby="abaixoDoAdequado-ajuda"
            className="mt-0.5 size-4 rounded border-borda-forte text-primaria focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2"
          />
          <span>
            Exibir o agrupamento opcional &ldquo;Abaixo do adequado&rdquo;
            <span id="abaixoDoAdequado-ajuda" className="block text-rotulo text-texto-suave">
              Agrupamento complementar de leitura. É apresentado ao lado dos níveis da fonte,
              nunca no lugar deles.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-2 border-t border-borda pt-4">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Gravando…' : 'Gravar nova versão'}
        </Button>
      </div>

      <p className="max-w-prose text-rotulo text-texto-suave">
        Gravar cria uma <strong>nova versão</strong>. A versão atual não é sobrescrita: ela
        continua no histórico, com autor e período de vigência.
      </p>
    </form>
  )
}
