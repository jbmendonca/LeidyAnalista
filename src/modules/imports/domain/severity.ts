import type { IssueCode } from './types'

export type Severity = 'ERROR' | 'WARNING'

/**
 * Severidade de cada inconsistência — FR-039, FR-040.
 *
 * O critério que separa as duas colunas: **`ERROR` é o que corromperia o
 * cálculo se passasse; `WARNING` é o que é informativo ou contraditório mas
 * não altera nenhum número.**
 *
 * `ERROR` impede a confirmação da importação. `WARNING` permite a confirmação
 * consciente pelo usuário. Nenhuma inconsistência é corrigida em silêncio
 * (FR-042).
 */
export const SEVERIDADE: Readonly<Record<IssueCode, Severity>> = {
  // --- ERROR: passariam a corromper número ou identidade ---------------------
  STUDENT_NAME_MISSING: 'ERROR',
  CLASS_CODE_MISSING: 'ERROR',
  SKILL_VALUE_INVALID: 'ERROR',
  SKILL_VALUE_OVER_MAX: 'ERROR',
  SKILL_COLUMN_MISSING: 'ERROR',
  // Chave repetida dupla-contaria a criança no denominador — FR-147, FR-148.
  DUPLICATE_KEY_IN_FILE: 'ERROR',
  DUPLICATE_KEY_IN_ASSESSMENT: 'ERROR',
  DUPLICATE_UNIQUE_CODE_IN_FILE: 'ERROR',
  // Código preenchido e desconhecido: criar estudante novo faria a falha de
  // vínculo passar despercebida — FR-139.
  UNKNOWN_UNIQUE_CODE: 'ERROR',

  // --- WARNING: informativos, não alteram cálculo ---------------------------
  CODE_FROM_OTHER_SCHOOL: 'WARNING',
  STUDENT_NOT_REGISTERED: 'WARNING',
  REGISTERED_STUDENT_ABSENT: 'WARNING',
  // Mesmo nome em turmas diferentes é provável transferência, não duplicata:
  // os registros permanecem separados — FR-045, FR-151.
  SAME_NAME_OTHER_CLASS: 'WARNING',
  // O cálculo Σ/Σ absorve denominadores divergentes sem distorção — FR-157.
  DENOMINATOR_DIVERGENT: 'WARNING',
  LEVEL_MISSING_FOR_EVALUATED: 'WARNING',
  EVALUATED_WITHOUT_RESULTS: 'WARNING',
  NOT_EVALUATED_WITH_RESULTS: 'WARNING',
  SKILL_NOT_IN_CATALOG: 'WARNING',
  FILE_ALREADY_IMPORTED: 'WARNING',
}

export const MENSAGEM: Readonly<Record<IssueCode, string>> = {
  STUDENT_NAME_MISSING: 'Estudante sem nome.',
  CLASS_CODE_MISSING: 'Código da Turma ausente.',
  SKILL_VALUE_INVALID: 'Valor de habilidade inválido.',
  SKILL_VALUE_OVER_MAX: 'Acertos maiores que a quantidade de itens.',
  SKILL_COLUMN_MISSING: 'Coluna de habilidade ausente no arquivo.',
  DUPLICATE_KEY_IN_FILE:
    'Estudante repetido no arquivo, na mesma turma. Corrija o arquivo antes de importar.',
  DUPLICATE_KEY_IN_ASSESSMENT:
    'Este estudante já possui resultado nesta avaliação. Exclua a importação anterior para substituí-la.',
  DUPLICATE_UNIQUE_CODE_IN_FILE: 'O mesmo código único aparece em mais de uma linha.',
  UNKNOWN_UNIQUE_CODE: 'Código único não encontrado no cadastro.',
  CODE_FROM_OTHER_SCHOOL: 'O código único pertence a estudante de outra escola.',
  STUDENT_NOT_REGISTERED: 'Estudante não encontrado no cadastro da turma.',
  REGISTERED_STUDENT_ABSENT: 'Estudante cadastrado na turma e ausente do arquivo.',
  SAME_NAME_OTHER_CLASS: 'Possível estudante duplicado ou transferido.',
  DENOMINATOR_DIVERGENT: 'Quantidade de itens divergente para esta habilidade.',
  LEVEL_MISSING_FOR_EVALUATED: 'Nível de aprendizagem vazio em estudante avaliado.',
  EVALUATED_WITHOUT_RESULTS: 'Estudante avaliado sem nenhum resultado de habilidade.',
  NOT_EVALUATED_WITH_RESULTS: 'Estudante não avaliado com resultados preenchidos.',
  SKILL_NOT_IN_CATALOG: 'Habilidade presente no arquivo e ausente do catálogo.',
  FILE_ALREADY_IMPORTED: 'Este arquivo já foi importado para esta avaliação e escola.',
}

export type Inconsistencia = Readonly<{
  code: IssueCode
  severity: Severity
  message: string
  rowNumber?: number | undefined
  column?: string | undefined
  originalValue?: string | undefined
}>

export function criarInconsistencia(
  code: IssueCode,
  extras: {
    rowNumber?: number | undefined
    column?: string | undefined
    originalValue?: string | undefined
    detalhe?: string | undefined
  } = {},
): Inconsistencia {
  const base = MENSAGEM[code]
  return {
    code,
    severity: SEVERIDADE[code],
    message: extras.detalhe ? `${base} ${extras.detalhe}` : base,
    rowNumber: extras.rowNumber,
    column: extras.column,
    originalValue: extras.originalValue,
  }
}

export function temErro(lista: readonly Inconsistencia[]): boolean {
  return lista.some((i) => i.severity === 'ERROR')
}

export function contarPorSeveridade(lista: readonly Inconsistencia[]): {
  errors: number
  warnings: number
} {
  let errors = 0
  let warnings = 0
  for (const i of lista) {
    if (i.severity === 'ERROR') errors++
    else warnings++
  }
  return { errors, warnings }
}
