import * as XLSX from 'xlsx'

import type { Celula, RelatorioMontado } from '@/modules/reports/domain/report-header'

/**
 * ===========================================================================
 *  ESCRITOR XLSX — FR-103, FR-108
 * ===========================================================================
 *
 * Uma aba por seção, mais a aba de cabeçalho, que vem primeiro e é obrigatória: um
 * arquivo de planilha circula por e-mail e sobrevive ao contexto em que foi gerado, de
 * modo que a avaliação, o recorte, as faixas vigentes, o instante e o solicitante
 * precisam viajar dentro dele (FR-106, FR-166).
 *
 * **Contagens vão como número; percentuais vão como texto.** A escolha é deliberada e
 * responde a FR-107: o percentual exibido foi arredondado uma vez, em `formatPercent`,
 * com `ROUND_HALF_UP` e duas casas. Gravá-lo como decimal deixaria a planilha
 * rearredondá-lo com a máscara da célula, e o número do relatório passaria a depender da
 * configuração do Excel de quem abre o arquivo.
 *
 * Ausência continua travessão — inclusive na planilha. Uma célula vazia seria lida por
 * qualquer fórmula como zero, que é exatamente o que a Const. I proíbe.
 */

/** Excel recusa `[ ] : * ? / \` e nomes acima de 31 caracteres. */
function sanitizarNomeDeAba(bruto: string): string {
  const limpo = bruto.replace(/[[\]:*?/\\]/g, ' ').trim()
  return (limpo.length === 0 ? 'Seção' : limpo).slice(0, 31)
}

/** Excel também recusa abas homônimas; o sufixo numérico preserva a ordem original. */
function nomesUnicos(nomes: readonly string[]): string[] {
  const usados = new Set<string>()
  return nomes.map((nome) => {
    const base = sanitizarNomeDeAba(nome)
    if (!usados.has(base)) {
      usados.add(base)
      return base
    }
    for (let i = 2; ; i++) {
      const sufixo = ` (${i})`
      const candidato = base.slice(0, 31 - sufixo.length) + sufixo
      if (!usados.has(candidato)) {
        usados.add(candidato)
        return candidato
      }
    }
  })
}

type ValorDeCelula = string | number

function valorDaCelula(celula: Celula): ValorDeCelula {
  return celula.numero !== null ? celula.numero : celula.texto
}

function abaDoCabecalho(relatorio: RelatorioMontado): XLSX.WorkSheet {
  const linhas: ValorDeCelula[][] = [
    [relatorio.cabecalho.titulo],
    [],
    ...relatorio.cabecalho.linhas.map((l) => [l.rotulo, l.valor]),
    [],
    ['Seções deste relatório'],
    ...relatorio.secoes.map((s) => [s.titulo, s.linhas.length]),
  ]

  const aba = XLSX.utils.aoa_to_sheet(linhas)
  aba['!cols'] = [{ wch: 34 }, { wch: 90 }]
  return aba
}

function abaDaSecao(secao: RelatorioMontado['secoes'][number]): XLSX.WorkSheet {
  const linhas: ValorDeCelula[][] = [[secao.titulo]]
  if (secao.descricao !== null) linhas.push([secao.descricao])
  linhas.push([])
  linhas.push(secao.colunas.map((c) => c.rotulo))

  for (const registro of secao.linhas) {
    linhas.push(registro.map(valorDaCelula))
  }

  if (secao.linhas.length === 0) linhas.push(['Nenhum registro neste recorte.'])
  if (secao.nota !== null) {
    linhas.push([])
    linhas.push([secao.nota])
  }

  const aba = XLSX.utils.aoa_to_sheet(linhas)
  aba['!cols'] = secao.colunas.map((c) => ({ wch: c.numerica ? 14 : 30 }))
  return aba
}

export function gerarXlsxDoRelatorio(relatorio: RelatorioMontado): Buffer {
  const livro = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(livro, abaDoCabecalho(relatorio), 'Cabeçalho')

  const nomes = nomesUnicos(relatorio.secoes.map((s) => s.titulo))
  relatorio.secoes.forEach((secao, indice) => {
    XLSX.utils.book_append_sheet(
      livro,
      abaDaSecao(secao),
      nomes[indice] ?? `Seção ${indice + 1}`,
    )
  })

  const conteudo: unknown = XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(conteudo as ArrayBufferLike)
}

export function nomeDoArquivoXlsx(relatorio: RelatorioMontado): string {
  return `${relatorio.nomeArquivo}.xlsx`
}
