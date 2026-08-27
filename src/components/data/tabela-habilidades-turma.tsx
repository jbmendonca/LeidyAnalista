import * as React from 'react'

import { cn } from '@/lib/utils'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { FaixaBadge, LegendaFaixaAnalitica } from '@/components/ui/faixa-badge'
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
import { EmptyState } from '@/components/data/empty-state'
import type { HabilidadeDaTurma } from '@/modules/analytics/application/class-dashboard'

/**
 * Tabela de habilidades da turma — FR-080.
 *
 * A ordem é a de `rankSkillsByFragility`, da maior fragilidade para o melhor desempenho, e
 * chega pronta: o componente não reordena, para que a posição exibida seja a mesma que
 * qualquer exportação da mesma tela produziria.
 *
 * Duas classificações convivem em colunas diferentes e **não podem se confundir**: a coluna
 * de faixa analítica é do sistema, configurável, marcada com pílula tracejada e ◆; o nível
 * de aprendizagem da fonte não aparece aqui — ele é atributo do estudante, não da
 * habilidade. A legenda abaixo da tabela é obrigatória sempre que houver `FaixaBadge`.
 *
 * FR-127: o percentual nunca aparece sozinho. Acertos e itens ficam em colunas próprias e a
 * fração é repetida sob o percentual, para que o leitor distinga 100% de 2/2 de 100% de
 * 300/300 — casos que pedem decisões pedagógicas opostas.
 */

function Numero({ valor }: { valor: number | null }) {
  if (valor === null) {
    return (
      <>
        <span className="ausente" aria-hidden="true">
          {AUSENTE}
        </span>
        <span className="apenas-leitor-de-tela">Sem dado</span>
      </>
    )
  }
  return <>{formatarNumero(valor)}</>
}

export type PropsTabelaHabilidadesTurma = {
  habilidades: readonly HabilidadeDaTurma[]
  /** Limites vigentes, exibidos na legenda para que a faixa não pareça absoluta. */
  fragilidadeMaxTexto: string
  atencaoMaxTexto: string
  className?: string
}

export function TabelaHabilidadesTurma({
  habilidades,
  fragilidadeMaxTexto,
  atencaoMaxTexto,
  className,
}: PropsTabelaHabilidadesTurma) {
  if (habilidades.length === 0) {
    return (
      <EmptyState
        titulo="Nenhuma habilidade apurada para esta turma"
        orientacao="O denominador de referência de cada habilidade nasce da apuração sobre os dados importados. Sem importação confirmada não há habilidade a exibir."
        className={className}
      />
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <TableContainer rotulo="Habilidades da turma, da maior fragilidade ao melhor desempenho">
        <Table>
          <TableCaption>
            Ordenada da maior fragilidade para o melhor desempenho. Desempenho é{' '}
            <strong className="font-medium text-texto">Σ acertos ÷ Σ itens</strong> entre os
            estudantes avaliados — os não avaliados ficam fora do numerador e do denominador.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead numerica>Posição</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Habilidade</TableHead>
              <TableHead numerica>Acertos</TableHead>
              <TableHead numerica>Itens possíveis</TableHead>
              <TableHead numerica ordenacao="crescente">
                Percentual
              </TableHead>
              <TableHead>Faixa analítica</TableHead>
              <TableHead numerica>Estudantes em Fragilidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {habilidades.map((habilidade) => (
              <TableRow key={habilidade.skillId}>
                <TableCell numerica>{formatarNumero(habilidade.posicao)}º</TableCell>
                <TableRowHeader className="whitespace-nowrap font-mono">
                  {habilidade.shortCode}
                  <span className="block text-rotulo font-normal text-texto-suave">
                    {habilidade.referenceCode}
                  </span>
                </TableRowHeader>
                <TableCell className="max-w-prose text-rotulo text-texto-suave">
                  {habilidade.descricao}
                </TableCell>
                <TableCell numerica>
                  <Numero valor={habilidade.acertos} />
                </TableCell>
                <TableCell numerica>
                  <Numero valor={habilidade.itens} />
                </TableCell>
                <TableCell numerica>
                  <span className="block font-medium">{habilidade.percentualTexto}</span>
                  <span className="block text-rotulo text-texto-suave">
                    {habilidade.fracaoTexto}
                  </span>
                </TableCell>
                <TableCell>
                  <FaixaBadge faixa={habilidade.faixa} />
                </TableCell>
                <TableCell numerica>
                  {formatarNumero(habilidade.estudantesEmFragilidade)}
                  <span className="block text-rotulo text-texto-suave">
                    de {formatarNumero(habilidade.estudantesComResultado)} com resultado
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <LegendaFaixaAnalitica />
      <p className="text-rotulo text-texto-suave">
        Limites em vigor: Fragilidade abaixo de {fragilidadeMaxTexto}%, Atenção de{' '}
        {fragilidadeMaxTexto}% a menos de {atencaoMaxTexto}%, Satisfatório a partir de{' '}
        {atencaoMaxTexto}%. São configuráveis e versionados.
      </p>
    </div>
  )
}
