import '@testing-library/jest-dom/vitest'

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { TabelaEstudantes } from '@/components/data/tabela-estudantes'
import type { EstudanteDaTurma } from '@/modules/analytics/application/class-dashboard'
import { AUSENTE } from '@/lib/format'

/**
 * A tabela de estudantes é o último ponto entre o dado e o leitor. Este arquivo trava a
 * regra que mais custa caro quando escapa: **o não avaliado não pode aparecer com zero, e
 * não pode aparecer como Defasagem**.
 *
 * A verificação é feita no texto renderizado, e não nas props: um componente que recebesse
 * `null` e imprimisse `0` passaria em qualquer teste de dados e falharia aqui — que é
 * exatamente o defeito que este arquivo existe para pegar.
 *
 * Os identificadores das fixtures são propositalmente **sem dígitos**. Um código como
 * `EST-0007` faria a busca por "0" casar com a matrícula e transformar a asserção mais
 * importante do arquivo num falso positivo silencioso.
 */

const AVALIADO_DEFASAGEM: EstudanteDaTurma = {
  studentId: 'est-defasagem',
  uniqueCode: 'ZZ-DEF',
  nomeOriginal: 'Bruno Defasagem',
  avaliado: true,
  nivelOriginal: 'Defasagem',
  nivelNormalizado: 'DEFASAGEM',
  acertos: 2,
  itens: 12,
  fracaoTexto: '2 / 12',
  percentualTexto: '16,67%',
  performance: { acertos: 2, itens: 12 },
  habilidadesEmFragilidade: 4,
  habilidadesEmAtencao: 0,
}

const NAO_AVALIADO: EstudanteDaTurma = {
  studentId: 'est-ausente',
  uniqueCode: 'ZZ-AUS',
  nomeOriginal: 'Davi Ausente',
  avaliado: false,
  nivelOriginal: '',
  nivelNormalizado: null,
  // Const. I — a camada de dados entrega ausência, e é assim que a tela precisa recebê-la.
  acertos: null,
  itens: null,
  fracaoTexto: AUSENTE,
  percentualTexto: AUSENTE,
  performance: null,
  habilidadesEmFragilidade: null,
  habilidadesEmAtencao: null,
}

function renderizar() {
  render(
    <TabelaEstudantes avaliados={[AVALIADO_DEFASAGEM]} naoAvaliados={[NAO_AVALIADO]} />,
  )
}

/** Localiza a linha do estudante pelo nome, que é o cabeçalho de linha. */
function linhaDe(nome: string): HTMLElement {
  const celula = screen.getByText(nome).closest('tr')
  if (!celula) throw new Error(`Linha não encontrada para ${nome}`)
  return celula
}

describe('TabelaEstudantes — estudante não avaliado', () => {
  it('renderiza travessão nos campos de desempenho', () => {
    renderizar()
    const linha = linhaDe('Davi Ausente')

    // Acertos, itens, percentual, fragilidades e atenções: cinco ausências.
    const travessoes = within(linha).getAllByText(AUSENTE)
    expect(travessoes.length).toBeGreaterThanOrEqual(5)
  })

  it('não renderiza zero em campo algum da linha', () => {
    renderizar()
    const linha = linhaDe('Davi Ausente')

    expect(within(linha).queryByText('0')).toBeNull()
    expect(within(linha).queryByText('0,00%')).toBeNull()
    expect(within(linha).queryByText('0%')).toBeNull()
    expect(within(linha).queryByText('0 / 0')).toBeNull()

    // A rede de segurança final: nenhum dígito zero isolado sobrou no texto da linha.
    expect(linha.textContent ?? '').not.toMatch(/(^|[^\d])0([^\d]|$)/)
  })

  it('não recebe o rótulo de Defasagem', () => {
    renderizar()
    const linha = linhaDe('Davi Ausente')

    expect(within(linha).queryByText('Defasagem')).toBeNull()
    expect(within(linha).queryByText('Intermediário')).toBeNull()
    expect(within(linha).queryByText('Adequado')).toBeNull()
    expect(within(linha).getByText('Não avaliado')).toBeInTheDocument()
  })

  it('fica em tabela própria, separada da dos avaliados', () => {
    renderizar()

    const tabelaAusentes = linhaDe('Davi Ausente').closest('table')
    const tabelaAvaliados = linhaDe('Bruno Defasagem').closest('table')

    expect(tabelaAusentes).not.toBeNull()
    expect(tabelaAvaliados).not.toBeNull()
    expect(tabelaAusentes).not.toBe(tabelaAvaliados)

    expect(
      screen.getByRole('heading', { name: /Não avaliados/i }),
    ).toBeInTheDocument()
  })
})

describe('TabelaEstudantes — estudante avaliado', () => {
  it('mantém o resultado original ao lado do percentual (FR-127)', () => {
    renderizar()
    const linha = linhaDe('Bruno Defasagem')

    expect(within(linha).getByText('16,67%')).toBeInTheDocument()
    expect(within(linha).getByText('2 / 12')).toBeInTheDocument()
  })

  it('exibe o nível de aprendizagem recebido da fonte', () => {
    renderizar()
    const linha = linhaDe('Bruno Defasagem')

    expect(within(linha).getByText('Defasagem')).toBeInTheDocument()
    expect(within(linha).getByText(/na fonte: Defasagem/)).toBeInTheDocument()
  })

  it('mostra zero legítimo quando o valor é realmente zero', () => {
    // O contraponto necessário: a regra é "ausência não vira zero", e não "zero não
    // aparece". Sem este caso, um componente que escondesse todo `0` passaria nos demais.
    renderizar()
    const linha = linhaDe('Bruno Defasagem')

    expect(within(linha).getByText('0')).toBeInTheDocument()
  })
})
