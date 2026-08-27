/**
 * Tipos compartilhados do núcleo pedagógico.
 *
 * Const. VI — domínio puro: este arquivo não importa Prisma, React, Next nem infraestrutura.
 * Const. I — ausência é `null` em toda a extensão; jamais zero.
 * Const. II — `acertos` e `itens` são inteiros; percentual é derivado com `Decimal`, nunca
 * armazenado aqui.
 *
 * Contrato: specs/001-painel-analise-leitura/contracts/domain-functions.md
 */

/** Fração exata. Fonte de verdade de todo cálculo. Nunca substituída por percentual. */
export type Fraction = Readonly<{
  /** Inteiro, `>= 0` e `<= itens`. */
  acertos: number
  /** Inteiro, `> 0`. */
  itens: number
}>

/** Ausência de resultado. Distinta de zero em todo o sistema (Const. I, FR-031). */
export type MaybeFraction = Fraction | null

/**
 * Resultado bruto de uma célula de habilidade já interpretada.
 *
 * Os três campos são `null` em conjunto quando a célula está ausente. `valorOriginal` preserva a
 * string exatamente como recebida (FR-030) — nunca a forma normalizada.
 */
export type ParsedSkillResult = Readonly<{
  valorOriginal: string | null
  acertos: number | null
  itensPossiveis: number | null
}>

/**
 * Catálogo estável de códigos de inconsistência da importação.
 *
 * Espelha o catálogo mínimo de `ImportIssue` em
 * specs/001-painel-analise-leitura/data-model.md. Cada código rastreia a um requisito.
 */
export type IssueCode =
  | 'STUDENT_NAME_MISSING'
  | 'CLASS_CODE_MISSING'
  | 'SKILL_VALUE_INVALID'
  | 'SKILL_VALUE_OVER_MAX'
  | 'SKILL_COLUMN_MISSING'
  | 'DUPLICATE_KEY_IN_FILE'
  | 'DUPLICATE_KEY_IN_ASSESSMENT'
  | 'DUPLICATE_UNIQUE_CODE_IN_FILE'
  | 'UNKNOWN_UNIQUE_CODE'
  | 'CODE_FROM_OTHER_SCHOOL'
  | 'STUDENT_NOT_REGISTERED'
  | 'REGISTERED_STUDENT_ABSENT'
  | 'SAME_NAME_OTHER_CLASS'
  | 'DENOMINATOR_DIVERGENT'
  | 'LEVEL_MISSING_FOR_EVALUATED'
  | 'EVALUATED_WITHOUT_RESULTS'
  | 'NOT_EVALUATED_WITH_RESULTS'
  | 'SKILL_NOT_IN_CATALOG'
  | 'FILE_ALREADY_IMPORTED'

/**
 * Desfecho da interpretação de uma célula.
 *
 * Célula ausente é `ok: true` com os campos `null`; célula inválida é `ok: false`. As duas
 * situações nunca se confundem.
 */
export type ParseOutcome =
  | { ok: true; value: ParsedSkillResult }
  | { ok: false; code: IssueCode; originalValue: string }
