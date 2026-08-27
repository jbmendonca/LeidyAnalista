/**
 * Normalização e mapeamento de cabeçalhos (passos 4 e 5 do pipeline).
 *
 * Vive em `infra/` de propósito: o mapeamento depende do formato do arquivo recebido, não do
 * núcleo pedagógico. O domínio não conhece coluna nenhuma (Const. VI).
 *
 * O mapeamento produzido aqui é **proposta**: o usuário revisa antes de qualquer parsing.
 */

/**
 * `trim` → colapsa espaços internos → maiúsculas → remove diacríticos.
 *
 * Remove também um BOM residual: o custo é uma comparação e o benefício é não depender de a
 * decodificação ter feito o trabalho dela.
 */
export function normalizarCabecalho(h: string): string {
  return h
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Campos canônicos e as formas aceitas, já normalizadas.
 *
 * A chave é o nome do campo no sistema; o valor, as variações vistas nos arquivos da rede.
 */
export const COLUNAS_CONHECIDAS: Readonly<Record<string, readonly string[]>> = {
  rede: ['REDE'],
  anoEscolar: ['ANO ESCOLAR', 'ANO_ESCOLAR', 'ANO/SERIE', 'SERIE'],
  componenteCurricular: [
    'COMPONENTE CURRICULAR',
    'COMPONENTE_CURRICULAR',
    'COMPONENTE',
    'DISCIPLINA',
  ],
  estado: ['ESTADO', 'UF'],
  municipio: ['MUNICIPIO'],
  codigoTurma: ['CODIGO DA TURMA', 'CODIGO TURMA', 'CODIGO_DA_TURMA', 'COD TURMA'],
  turma: ['TURMA'],
  estudante: ['ESTUDANTE', 'NOME DO ESTUDANTE', 'ALUNO', 'NOME DO ALUNO', 'NOME'],
  avaliado: ['AVALIADO'],
  nivelAprendizagem: [
    'NIVEL DE APRENDIZAGEM',
    'NIVEL APRENDIZAGEM',
    'NIVEL_DE_APRENDIZAGEM',
    'NIVEL',
  ],
  codigoUnico: [
    'CODIGO UNICO',
    'CODIGO DO ESTUDANTE',
    'CODIGO_UNICO',
    'CODIGO DO ALUNO',
    'ID DO ESTUDANTE',
  ],
}

/**
 * `H 01`, `H01`, `H_01`, `H-01`, `H 01 (2EF08_P)` — todas a mesma habilidade.
 *
 * O sufixo entre parênteses carrega o código do descritor da matriz e não distingue coluna; é
 * descartado aqui e recuperado, se preciso, do catálogo de habilidades.
 */
const PADRAO_HABILIDADE = /^H[\s_.-]*(\d{1,2})(?:[\s_.(\[-].*)?$/

/**
 * Devolve o código curto canônico (`H01`..`H99`), ou `null` quando não é coluna de habilidade.
 *
 * `H 00` devolve `null`: não existe habilidade zero, e aceitá-la criaria uma coluna fantasma.
 */
export function detectarColunaHabilidade(cabecalho: string): string | null {
  const casamento = PADRAO_HABILIDADE.exec(normalizarCabecalho(cabecalho))
  if (casamento === null) return null

  const digitos = casamento[1]
  if (digitos === undefined) return null

  const numero = Number.parseInt(digitos, 10)
  if (!Number.isInteger(numero) || numero < 1 || numero > 99) return null

  return `H${String(numero).padStart(2, '0')}`
}

export type MapeamentoColunas = Readonly<{
  /** Campo canônico → índice da coluna. */
  campos: Readonly<Record<string, number>>
  /** Código curto da habilidade (`H01`) → índice da coluna. */
  habilidades: Readonly<Record<string, number>>
  /** Cabeçalhos originais, sem alteração, que não foram reconhecidos. */
  naoMapeadas: readonly string[]
}>

/** Índice invertido: forma normalizada → campo canônico. Construído uma vez. */
const POR_VARIACAO: ReadonlyMap<string, string> = new Map(
  Object.entries(COLUNAS_CONHECIDAS).flatMap(([campo, variacoes]) =>
    variacoes.map((v) => [v, campo] as const),
  ),
)

/**
 * Proposta de mapeamento a partir da linha de cabeçalhos.
 *
 * Em coluna repetida, a **primeira** ocorrência vence e as demais entram em `naoMapeadas` — o
 * usuário vê a duplicidade em vez de o sistema escolher em silêncio.
 */
export function proporMapeamento(cabecalhos: readonly string[]): MapeamentoColunas {
  const campos: Record<string, number> = {}
  const habilidades: Record<string, number> = {}
  const naoMapeadas: string[] = []

  cabecalhos.forEach((cabecalho, indice) => {
    const normalizado = normalizarCabecalho(cabecalho)

    const campo = POR_VARIACAO.get(normalizado)
    if (campo !== undefined) {
      if (campos[campo] === undefined) {
        campos[campo] = indice
        return
      }
      naoMapeadas.push(cabecalho)
      return
    }

    const habilidade = detectarColunaHabilidade(cabecalho)
    if (habilidade !== null) {
      if (habilidades[habilidade] === undefined) {
        habilidades[habilidade] = indice
        return
      }
      naoMapeadas.push(cabecalho)
      return
    }

    naoMapeadas.push(cabecalho)
  })

  return { campos, habilidades, naoMapeadas }
}
