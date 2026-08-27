import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { AUSENTE, formatarNumero } from '@/lib/format'
import { NivelBadge } from '@/components/ui/nivel-badge'
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
import type { EstudanteDaTurma } from '@/modules/analytics/application/class-dashboard'

/**
 * Lista de estudantes da turma — FR-081, FR-082, FR-093.
 *
 * **Duas tabelas, nunca uma.** Os avaliados vêm ordenados por prioridade pedagógica
 * (Defasagem → Intermediário → Adequado, do menor percentual para o maior, por
 * `sortStudentsByPriority`); os não avaliados vêm depois, em tabela própria, com legenda
 * própria. Misturá-los numa coluna só, ainda que ao fim da lista, faria a criança que não
 * fez a prova aparecer no mesmo bloco visual das que foram mal — que é exatamente a leitura
 * que a Constituição V proíbe.
 *
 * **Nenhum zero de ausência.** Todo campo de desempenho do não avaliado chega `null` da
 * camada de dados e sai daqui como travessão. O componente não converte, não arredonda e não
 * completa: se um `0` aparecer nesta tela, o defeito está antes, e o `null` é o que garante
 * que ele apareça como defeito e não como dado.
 *
 * O componente é puro: recebe listas já ordenadas e já com supressão nominal aplicada. Não
 * reordena — a ordem é decisão de domínio, e recalculá-la aqui abriria espaço para as duas
 * telas discordarem entre si.
 */

/** Célula numérica que nunca inventa zero. */
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

/** Texto já formatado pela camada de dados. Travessão vira ausência anunciada. */
function Texto({ valor }: { valor: string }) {
  if (valor === AUSENTE) {
    return (
      <>
        <span className="ausente" aria-hidden="true">
          {AUSENTE}
        </span>
        <span className="apenas-leitor-de-tela">Sem dado</span>
      </>
    )
  }
  return <>{valor}</>
}

function IdentificacaoEstudante({ estudante }: { estudante: EstudanteDaTurma }) {
  return (
    <TableRowHeader>
      <Link
        href={`/estudantes/${estudante.studentId}`}
        className="text-primaria underline underline-offset-4 hover:text-primaria-forte"
      >
        {estudante.nomeOriginal}
      </Link>
      <span className="block font-mono text-rotulo font-normal text-texto-suave">
        {estudante.uniqueCode}
      </span>
    </TableRowHeader>
  )
}

function LinhaAvaliado({ estudante }: { estudante: EstudanteDaTurma }) {
  return (
    <TableRow>
      <IdentificacaoEstudante estudante={estudante} />
      <TableCell>
        <NivelBadge nivel={estudante.nivelNormalizado} avaliado />
        {/* O texto bruto da fonte fica visível: a etiqueta é normalização para consulta,
            e o que a rede escreveu não pode desaparecer da tela (Const. III). */}
        <span className="block text-rotulo text-texto-suave">
          na fonte:{' '}
          {estudante.nivelOriginal.trim() === '' ? AUSENTE : estudante.nivelOriginal}
        </span>
      </TableCell>
      <TableCell numerica>
        <Numero valor={estudante.acertos} />
      </TableCell>
      <TableCell numerica>
        <Numero valor={estudante.itens} />
      </TableCell>
      {/* FR-127: o resultado original acompanha o percentual, sempre. */}
      <TableCell numerica>
        <span className="block font-medium">
          <Texto valor={estudante.percentualTexto} />
        </span>
        <span className="block text-rotulo text-texto-suave">
          <Texto valor={estudante.fracaoTexto} />
        </span>
      </TableCell>
      <TableCell numerica>
        <Numero valor={estudante.habilidadesEmFragilidade} />
      </TableCell>
      <TableCell numerica>
        <Numero valor={estudante.habilidadesEmAtencao} />
      </TableCell>
    </TableRow>
  )
}

function LinhaNaoAvaliado({ estudante }: { estudante: EstudanteDaTurma }) {
  return (
    <TableRow data-nao-avaliado="">
      <IdentificacaoEstudante estudante={estudante} />
      <TableCell>
        <NivelBadge nivel={null} avaliado={false} />
      </TableCell>
      {/* Cinco travessões, nenhum zero: acertos, itens, percentual, fragilidades, atenções.
          Os valores chegam `null` da camada de dados justamente para que não exista
          caminho em que um `0` seja renderizado (FR-093). */}
      <TableCell numerica>
        <Numero valor={estudante.acertos} />
      </TableCell>
      <TableCell numerica>
        <Numero valor={estudante.itens} />
      </TableCell>
      <TableCell numerica>
        <Texto valor={estudante.percentualTexto} />
      </TableCell>
      <TableCell numerica>
        <Numero valor={estudante.habilidadesEmFragilidade} />
      </TableCell>
      <TableCell numerica>
        <Numero valor={estudante.habilidadesEmAtencao} />
      </TableCell>
    </TableRow>
  )
}

const COLUNAS = [
  'Estudante',
  'Nível de aprendizagem (fonte)',
  'Acertos',
  'Itens',
  'Percentual geral',
  'Habilidades em Fragilidade',
  'Habilidades em Atenção',
] as const

function Cabecalho() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{COLUNAS[0]}</TableHead>
        <TableHead>{COLUNAS[1]}</TableHead>
        <TableHead numerica>{COLUNAS[2]}</TableHead>
        <TableHead numerica>{COLUNAS[3]}</TableHead>
        <TableHead numerica ordenacao="crescente">
          {COLUNAS[4]}
        </TableHead>
        <TableHead numerica>{COLUNAS[5]}</TableHead>
        <TableHead numerica>{COLUNAS[6]}</TableHead>
      </TableRow>
    </TableHeader>
  )
}

export type PropsTabelaEstudantes = {
  /** Já ordenados por `sortStudentsByPriority`. O componente não reordena. */
  avaliados: readonly EstudanteDaTurma[]
  /** Lista própria e separada — nunca concatenada à de cima (FR-082). */
  naoAvaliados: readonly EstudanteDaTurma[]
  className?: string
}

export function TabelaEstudantes({
  avaliados,
  naoAvaliados,
  className,
}: PropsTabelaEstudantes) {
  const nenhum = avaliados.length === 0 && naoAvaliados.length === 0

  if (nenhum) {
    return (
      <EmptyState
        titulo="Nenhum estudante nesta turma para a avaliação selecionada"
        orientacao="Confirme a importação desta avaliação e o vínculo dos estudantes com a turma. Nenhum indicador é exibido enquanto não houver registro — ausência de dado não é desempenho zero."
        className={className}
      />
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      <section className="space-y-2" aria-labelledby="titulo-estudantes-avaliados">
        <h3
          id="titulo-estudantes-avaliados"
          className="text-base font-semibold text-texto"
        >
          Estudantes avaliados
        </h3>

        {avaliados.length === 0 ? (
          <EmptyState
            titulo="Nenhum estudante avaliado nesta turma"
            orientacao="Todos os registros importados para esta turma estão marcados como não avaliados. Eles aparecem abaixo, em lista própria, e ficam fora de todo cálculo de desempenho."
          />
        ) : (
          <TableContainer rotulo="Estudantes avaliados, ordenados por prioridade pedagógica">
            <Table>
              <TableCaption>
                Ordem padrão: Defasagem, Intermediário e Adequado; dentro de cada grupo,
                do menor para o maior percentual geral. Percentual é{' '}
                <strong className="font-medium text-texto">Σ acertos ÷ Σ itens</strong>,
                nunca a média dos percentuais.
              </TableCaption>
              <Cabecalho />
              <TableBody>
                {avaliados.map((estudante) => (
                  <LinhaAvaliado key={estudante.studentId} estudante={estudante} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </section>

      {naoAvaliados.length > 0 ? (
        <section className="space-y-2" aria-labelledby="titulo-estudantes-nao-avaliados">
          <h3
            id="titulo-estudantes-nao-avaliados"
            className="text-base font-semibold text-texto"
          >
            Não avaliados{' '}
            <span className="font-normal text-texto-suave">
              ({formatarNumero(naoAvaliados.length)})
            </span>
          </h3>

          <TableContainer
            rotulo="Estudantes não avaliados, em lista própria"
            className="border-dashed border-nivel-ausente-borda"
          >
            <Table>
              <TableCaption>
                Lista própria. Estes estudantes ficam{' '}
                <strong className="font-medium text-texto">
                  fora de todo denominador de desempenho
                </strong>{' '}
                e dentro do indicador de participação. A ausência de resultado aparece
                como travessão — não é desempenho zero e não é Defasagem.
              </TableCaption>
              <Cabecalho />
              <TableBody>
                {naoAvaliados.map((estudante) => (
                  <LinhaNaoAvaliado key={estudante.studentId} estudante={estudante} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </section>
      ) : null}
    </div>
  )
}
