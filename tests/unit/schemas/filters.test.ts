import { describe, expect, it } from 'vitest'

import {
  CHAVES_FILTRO,
  DIMENSOES_FILTRO,
  avaliadoParaBooleano,
  algumFiltroAtivo,
  descreverFiltrosAtivos,
  filtrosParaQuery,
  filtrosSchema,
  lerFiltros,
  removerFiltros,
  type FiltrosPainel,
} from '@/modules/analytics/schemas/filters'

/**
 * Filtros combinados — FR-098 a FR-101.
 *
 * O que estes testes protegem não é a sintaxe do Zod: é a diferença entre "não filtrei" e
 * "filtrei por vazio". A segunda leitura devolveria zero registros e o usuário concluiria que
 * não há dados quando na verdade não pediu recorte nenhum — a leitura equivocada mais cara
 * que este painel pode induzir.
 */

const RECORTE_COMPLETO = {
  avaliacao: 'aval-1',
  rede: 'MUNICIPAL',
  estado: 'RORAIMA',
  municipio: 'BOA VISTA',
  escola: 'esc-1',
  anoEscolar: '4º ano',
  componenteCurricular: 'Leitura',
  turma: 'turma-1',
  codigoTurma: 'T-401',
  avaliado: 'SIM',
  nivel: 'DEFASAGEM',
  habilidade: 'hab-1',
  estudante: 'est-1',
  percentualMin: '20',
  percentualMax: '80',
  situacao: 'FRAGILIDADE',
} as const

describe('as quinze dimensões de FR-098', () => {
  it('declara exatamente quinze dimensões', () => {
    expect(DIMENSOES_FILTRO).toHaveLength(15)
  })

  it('cobre cada dimensão exigida pelo requisito, sem faltar nem sobrar', () => {
    expect(DIMENSOES_FILTRO.map((d) => d.id)).toEqual([
      'avaliacao',
      'rede',
      'estado',
      'municipio',
      'escola',
      'anoEscolar',
      'componenteCurricular',
      'turma',
      'codigoTurma',
      'avaliado',
      'nivel',
      'habilidade',
      'estudante',
      'percentual',
      'situacao',
    ])
  })

  it('a faixa de percentual é a única dimensão com dois limites', () => {
    const comDuasChaves = DIMENSOES_FILTRO.filter((d) => d.chaves.length === 2)
    expect(comDuasChaves.map((d) => d.id)).toEqual(['percentual'])
    expect(CHAVES_FILTRO).toHaveLength(16)
  })

  it('interpreta as quinze dimensões preenchidas ao mesmo tempo', () => {
    const filtros = filtrosSchema.parse(RECORTE_COMPLETO)

    expect(filtros).toEqual({
      avaliacao: 'aval-1',
      rede: 'MUNICIPAL',
      estado: 'RORAIMA',
      municipio: 'BOA VISTA',
      escola: 'esc-1',
      anoEscolar: '4º ano',
      componenteCurricular: 'Leitura',
      turma: 'turma-1',
      codigoTurma: 'T-401',
      avaliado: 'SIM',
      nivel: 'DEFASAGEM',
      habilidade: 'hab-1',
      estudante: 'est-1',
      percentualMin: 20,
      percentualMax: 80,
      situacao: 'FRAGILIDADE',
    })
  })
})

describe('ausência de filtro', () => {
  it('string vazia vira ausência de chave, nunca filtro por vazio', () => {
    const vazias = Object.fromEntries(CHAVES_FILTRO.map((c) => [c, '']))
    const filtros = filtrosSchema.parse(vazias)

    expect(filtros).toEqual({})
    for (const chave of CHAVES_FILTRO) {
      expect(filtros[chave]).toBeUndefined()
    }
    expect(algumFiltroAtivo(filtros)).toBe(false)
  })

  it('string só de espaços também é ausência, e o texto válido é aparado', () => {
    const filtros = filtrosSchema.parse({ rede: '   ', municipio: '  BOA VISTA  ' })

    expect(filtros.rede).toBeUndefined()
    expect(filtros.municipio).toBe('BOA VISTA')
  })

  it('entrada sem nenhuma chave produz recorte vazio', () => {
    expect(filtrosSchema.parse({})).toEqual({})
  })
})

describe('valores inválidos são recusados, jamais corrigidos em silêncio', () => {
  it('recusa situação de participação fora do domínio', () => {
    const analise = filtrosSchema.safeParse({ avaliado: 'TALVEZ' })
    expect(analise.success).toBe(false)
  })

  it('recusa nível de aprendizagem inventado', () => {
    expect(filtrosSchema.safeParse({ nivel: 'OTIMO' }).success).toBe(false)
  })

  it('recusa situação analítica fora das três faixas', () => {
    expect(filtrosSchema.safeParse({ situacao: 'CRITICO' }).success).toBe(false)
  })

  it('recusa percentual que não é número', () => {
    const analise = filtrosSchema.safeParse({ percentualMin: 'muito' })
    expect(analise.success).toBe(false)
  })

  it('recusa percentual fora de 0 a 100', () => {
    expect(filtrosSchema.safeParse({ percentualMin: '-1' }).success).toBe(false)
    expect(filtrosSchema.safeParse({ percentualMax: '101' }).success).toBe(false)
  })

  it('recusa texto acima do limite de tamanho', () => {
    expect(filtrosSchema.safeParse({ rede: 'x'.repeat(201) }).success).toBe(false)
  })

  it('aceita percentual em grafia pt-BR', () => {
    expect(filtrosSchema.parse({ percentualMin: '72,5' }).percentualMin).toBe(72.5)
  })
})

describe('faixa de percentual', () => {
  it('recusa mínimo maior que o máximo', () => {
    const analise = filtrosSchema.safeParse({ percentualMin: '80', percentualMax: '20' })

    expect(analise.success).toBe(false)
    if (analise.success) return
    expect(analise.error.issues[0]?.message).toBe(
      'O percentual mínimo não pode ser maior que o máximo.',
    )
  })

  it('aceita mínimo igual ao máximo — é um recorte pontual, não um erro', () => {
    expect(filtrosSchema.safeParse({ percentualMin: '50', percentualMax: '50' }).success).toBe(
      true,
    )
  })

  it('aceita apenas um dos limites', () => {
    expect(filtrosSchema.parse({ percentualMin: '60' })).toEqual({ percentualMin: 60 })
    expect(filtrosSchema.parse({ percentualMax: '60' })).toEqual({ percentualMax: 60 })
  })
})

describe('leitura da query string', () => {
  it('lê o recorte de um Record de searchParams', () => {
    const { filtros, erros } = lerFiltros(RECORTE_COMPLETO)

    expect(erros).toEqual([])
    expect(filtros.escola).toBe('esc-1')
    expect(filtros.percentualMax).toBe(80)
  })

  it('lê o recorte de um URLSearchParams', () => {
    const query = new URLSearchParams({ rede: 'MUNICIPAL', avaliado: 'NAO' })
    const { filtros } = lerFiltros(query)

    expect(filtros).toEqual({ rede: 'MUNICIPAL', avaliado: 'NAO' })
  })

  it('ignora parâmetros que não são filtros', () => {
    const { filtros } = lerFiltros({ pagina: '3', ordenar: 'nome' })
    expect(filtros).toEqual({})
  })

  it('recorte inválido não é aplicado pela metade: devolve vazio e as mensagens', () => {
    const { filtros, erros } = lerFiltros({ rede: 'MUNICIPAL', avaliado: 'TALVEZ' })

    expect(filtros).toEqual({})
    expect(erros.length).toBeGreaterThan(0)
  })

  it('sobrevive à ida e volta pela query string', () => {
    const original = filtrosSchema.parse(RECORTE_COMPLETO)
    const { filtros } = lerFiltros(filtrosParaQuery(original))

    expect(filtros).toEqual(original)
  })

  it('a query string não carrega chave de filtro ausente', () => {
    const query = filtrosParaQuery({ rede: 'MUNICIPAL' })
    expect([...query.keys()]).toEqual(['rede'])
  })
})

describe('filtros ativos legíveis e removíveis — FR-100', () => {
  const filtros: FiltrosPainel = filtrosSchema.parse(RECORTE_COMPLETO)

  it('descreve cada dimensão ativa em português', () => {
    const ativos = descreverFiltrosAtivos(filtros, {
      'esc-1': 'Escola Municipal de Demonstração',
      'turma-1': '4º ano A — T-401',
    })

    expect(ativos).toHaveLength(15)
    expect(ativos.find((a) => a.id === 'escola')?.valor).toBe(
      'Escola Municipal de Demonstração',
    )
    expect(ativos.find((a) => a.id === 'avaliado')?.valor).toBe('Avaliados')
    expect(ativos.find((a) => a.id === 'nivel')?.valor).toBe('Defasagem')
    expect(ativos.find((a) => a.id === 'situacao')?.valor).toBe('Fragilidade')
    expect(ativos.find((a) => a.id === 'percentual')?.valor).toBe('de 20% a 80%')
  })

  it('exibe o próprio valor quando não há tradução, em vez de esconder o filtro', () => {
    const ativos = descreverFiltrosAtivos({ escola: 'esc-desconhecida' })
    expect(ativos[0]?.valor).toBe('esc-desconhecida')
  })

  it('descreve a faixa aberta em apenas um dos lados', () => {
    expect(descreverFiltrosAtivos({ percentualMin: 60 })[0]?.valor).toBe('a partir de 60%')
    expect(descreverFiltrosAtivos({ percentualMax: 60 })[0]?.valor).toBe('até 60%')
  })

  it('não lista nada quando não há filtro', () => {
    expect(descreverFiltrosAtivos({})).toEqual([])
  })

  it('remover a faixa de percentual apaga os dois limites de uma vez', () => {
    const dimensao = descreverFiltrosAtivos(filtros).find((a) => a.id === 'percentual')
    const restante = removerFiltros(filtros, dimensao?.chaves ?? [])

    expect(restante.percentualMin).toBeUndefined()
    expect(restante.percentualMax).toBeUndefined()
    expect(restante.rede).toBe('MUNICIPAL')
  })

  it('remover não muta o recorte original', () => {
    const antes = { ...filtros }
    removerFiltros(filtros, ['rede'])
    expect(filtros).toEqual(antes)
  })

  it('limpar tudo devolve um recorte sem filtro ativo', () => {
    expect(algumFiltroAtivo(removerFiltros(filtros, CHAVES_FILTRO))).toBe(false)
  })
})

describe('situação de participação', () => {
  it('traduz a escolha para o valor do banco', () => {
    expect(avaliadoParaBooleano('SIM')).toBe(true)
    expect(avaliadoParaBooleano('NAO')).toBe(false)
  })

  it('"Todos" e ausência de escolha significam não restringir — e não "não avaliado"', () => {
    expect(avaliadoParaBooleano('TODOS')).toBeNull()
    expect(avaliadoParaBooleano(undefined)).toBeNull()
  })
})
