import { describe, expect, it } from 'vitest'

import { detectarSeparador } from '@/modules/imports/infra/delimiter'

const CABECALHO_REAL =
  'Rede;Ano Escolar;Componente Curricular;Estado;Município;Código da Turma;Turma;Estudante;Avaliado;Nível de aprendizagem;H 01;H 02'

describe('detectarSeparador', () => {
  it('reconhece o ponto e vírgula do arquivo real', () => {
    expect(detectarSeparador(CABECALHO_REAL)).toBe(';')
  })

  it('reconhece a vírgula', () => {
    expect(detectarSeparador('Rede,Ano Escolar,Estado,Turma')).toBe(',')
  })

  it('reconhece a tabulação', () => {
    expect(detectarSeparador('Rede\tAno Escolar\tEstado\tTurma')).toBe('\t')
  })

  it('ignora separadores dentro de aspas', () => {
    // Cinco vírgulas dentro de campos, dois pontos e vírgula separando de verdade.
    const linha = '"SOUZA, ANA, MARIA";"A, B, C";Turma'

    expect(detectarSeparador(linha)).toBe(';')
  })

  it('trata aspas duplas escapadas dentro do campo', () => {
    const linha = '"ESCOLA ""A"", B",X,Y'

    expect(detectarSeparador(linha)).toBe(',')
  })

  it('devolve ponto e vírgula quando não há nenhum candidato', () => {
    expect(detectarSeparador('ColunaUnica')).toBe(';')
  })

  it('devolve ponto e vírgula no empate', () => {
    expect(detectarSeparador('a;b,c')).toBe(';')
  })

  it('usa a primeira linha não vazia quando recebe um trecho maior', () => {
    expect(detectarSeparador(`\n   \n${CABECALHO_REAL}\na,b,c,d,e,f`)).toBe(';')
  })
})
