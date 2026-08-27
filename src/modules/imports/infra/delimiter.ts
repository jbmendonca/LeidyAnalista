/**
 * Detecção de separador de CSV.
 *
 * Contagem de ocorrências fora de aspas na primeira linha não vazia (R-004). Aspas importam:
 * `"SOUZA, ANA";MUNICIPAL` tem uma vírgula que não separa nada.
 */

export type Separador = ';' | ',' | '\t'

/** Ordem de preferência no empate. `;` é o separador do arquivo real da rede. */
const CANDIDATOS: readonly Separador[] = [';', ',', '\t']

function contarForaDeAspas(linha: string): Record<Separador, number> {
  const contagem: Record<Separador, number> = { ';': 0, ',': 0, '\t': 0 }
  let dentroDeAspas = false

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]
    if (c === '"') {
      // `""` dentro de campo entre aspas é uma aspa literal, não o fim do campo.
      if (dentroDeAspas && linha[i + 1] === '"') {
        i += 1
        continue
      }
      dentroDeAspas = !dentroDeAspas
      continue
    }
    if (dentroDeAspas) continue
    if (c === ';' || c === ',' || c === '\t') contagem[c] += 1
  }

  return contagem
}

/**
 * Devolve o candidato mais frequente fora de aspas. Empate ou nenhuma ocorrência devolve `;`.
 *
 * Aceita tanto uma única linha quanto um trecho maior: usa a primeira linha não vazia.
 */
export function detectarSeparador(primeiraLinha: string): Separador {
  const linha =
    primeiraLinha.split(/\r\n|\n|\r/).find((l) => l.trim().length > 0) ?? primeiraLinha
  const contagem = contarForaDeAspas(linha)

  let melhor: Separador = ';'
  let melhorContagem = 0
  for (const candidato of CANDIDATOS) {
    // Estritamente maior: o empate preserva o candidato anterior, e `;` é o primeiro.
    if (contagem[candidato] > melhorContagem) {
      melhor = candidato
      melhorContagem = contagem[candidato]
    }
  }

  return melhor
}
