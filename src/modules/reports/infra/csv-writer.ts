import type { Celula, RelatorioMontado } from '@/modules/reports/domain/report-header'

/**
 * ===========================================================================
 *  ESCRITOR CSV — FR-103, FR-108
 * ===========================================================================
 *
 * Quatro escolhas de formato, todas ditadas pelo destino real do arquivo: o Excel em
 * português, na máquina de quem coordena a rede.
 *
 *  1. **UTF-8 com BOM.** Sem o BOM, o Excel pt-BR lê os bytes UTF-8 como Latin-1 e
 *     "JOÃO" chega como "JOÃO" na tela de quem vai usar o arquivo. Três bytes evitam
 *     isso; nenhuma outra providência evita (FR-108).
 *  2. **Separador `;`.** Na configuração regional pt-BR, a vírgula é separador decimal, e
 *     o separador de lista do sistema é o ponto e vírgula. Com `,` o arquivo abriria em
 *     coluna única.
 *  3. **Vírgula decimal.** Já vem assim: os textos das células foram formatados por
 *     `formatPercent`, em `pt-BR`, exatamente como aparecem na tela (FR-107).
 *  4. **Quebra CRLF**, a do RFC 4180.
 *
 * Contagens inteiras são escritas **sem separador de milhar**, para que a planilha as
 * receba como número. O percentual segue como texto formatado: reabri-lo como decimal
 * criaria uma segunda verdade para o mesmo valor, com outro arredondamento.
 */

export const BOM_UTF8 = '\uFEFF'
export const SEPARADOR_CSV = ';'
export const QUEBRA_CSV = '\r\n'

/** Aspas em campo com separador, aspa ou quebra — a convenção do RFC 4180. */
function campo(valor: string): string {
  if (!/[;"\r\n]/.test(valor)) return valor
  return `"${valor.replace(/"/g, '""')}"`
}

/**
 * Contagem sai como número puro; qualquer outra coisa sai como o texto já formatado.
 *
 * Escrever `1.234` para uma contagem faria o Excel pt-BR ler o ponto como separador de
 * milhar — o que dá certo por acaso. Escrever `1234` dá certo por construção.
 */
function celulaParaCsv(celula: Celula): string {
  if (celula.numero !== null) return campo(String(celula.numero))
  return campo(celula.texto)
}

function linha(valores: readonly string[]): string {
  return valores.join(SEPARADOR_CSV)
}

/**
 * Documento inteiro em CSV: cabeçalho, depois cada seção com o seu título, as suas
 * colunas e as suas linhas.
 *
 * O cabeçalho vai no mesmo arquivo, e não num segundo: um CSV de números soltos, sem a
 * avaliação, o recorte, as faixas vigentes e o instante de geração, é um arquivo que
 * qualquer leitor pode atribuir ao que quiser (FR-106).
 */
export function gerarCsvDoRelatorio(relatorio: RelatorioMontado): string {
  const linhas: string[] = []

  linhas.push(linha([campo(relatorio.cabecalho.titulo)]))
  for (const item of relatorio.cabecalho.linhas) {
    linhas.push(linha([campo(item.rotulo), campo(item.valor)]))
  }

  for (const secao of relatorio.secoes) {
    linhas.push('')
    linhas.push(linha([campo(secao.titulo)]))
    if (secao.descricao !== null) linhas.push(linha([campo(secao.descricao)]))
    linhas.push(linha(secao.colunas.map((c) => campo(c.rotulo))))

    for (const registro of secao.linhas) {
      linhas.push(linha(registro.map(celulaParaCsv)))
    }

    if (secao.linhas.length === 0) {
      // Seção vazia é informação: dizer "nenhum registro" evita que o leitor conclua
      // que a exportação falhou.
      linhas.push(linha([campo('Nenhum registro neste recorte.')]))
    }
    if (secao.nota !== null) linhas.push(linha([campo(secao.nota)]))
  }

  return BOM_UTF8 + linhas.join(QUEBRA_CSV) + QUEBRA_CSV
}

export function nomeDoArquivoCsv(relatorio: RelatorioMontado): string {
  return `${relatorio.nomeArquivo}.csv`
}
