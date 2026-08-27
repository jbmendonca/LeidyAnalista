# Contrato — Funções de Domínio

**Feature**: Painel de Análise de Leitura — II Ciclo CNCA (MVP)
**Plano**: [../plan.md](../plan.md) · **Modelo**: [../data-model.md](../data-model.md)

Estas funções são o núcleo pedagógico do sistema. Todas são **puras**: sem I/O, sem estado global,
sem acesso ao relógio, determinísticas. Vivem em `src/modules/*/domain/` e não importam nada de
Prisma, React ou Next.

Este contrato é normativo. Alterá-lo exige revalidar o teste de regressão do Princípio X.

---

## Tipos compartilhados

```ts
/** Fração exata. Fonte de verdade de todo cálculo. Nunca substituída por percentual. */
type Fraction = Readonly<{ acertos: number; itens: number }>   // ambos inteiros, itens > 0

/** Ausência de resultado. Distinta de zero em todo o sistema. */
type MaybeFraction = Fraction | null

type ParsedSkillResult = Readonly<{
  valorOriginal: string | null
  acertos: number | null
  itensPossiveis: number | null
}>

type ParseOutcome =
  | { ok: true;  value: ParsedSkillResult }
  | { ok: false; code: IssueCode; originalValue: string }

type AnalyticalBands = Readonly<{
  fragilidadeMax: Decimal   // limite superior exclusivo, ex. 60
  atencaoMax: Decimal       // limite superior exclusivo, ex. 80
}>
```

`Decimal` é o de `decimal.js`, o mesmo que o Prisma expõe. **Nenhuma assinatura desta página retorna
`number` para representar percentual.**

---

## `parseSkillResult`

```ts
function parseSkillResult(raw: string | null | undefined): ParseOutcome
```

Interpreta o valor bruto de uma célula de habilidade.

| Entrada | Resultado |
|---|---|
| `"1 / 1"`, `"1/1"`, `" 1 / 2 "`, `"2 / 3"`, `"1 /2"` | `ok`, com acertos e itens extraídos |
| `""`, `"   "`, `null`, `undefined` | `ok`, com os três campos `null` — **ausência, jamais zero** |
| `"2 / 1"` | erro `SKILL_VALUE_OVER_MAX` |
| `"1 / 0"` | erro `SKILL_VALUE_INVALID` |
| `"-1 / 2"` | erro `SKILL_VALUE_INVALID` |
| `"texto"`, `"120%"`, `"1"`, `"1 / 2 / 3"` | erro `SKILL_VALUE_INVALID` |

Invariante de aceitação: `acertos >= 0 && itensPossiveis > 0 && acertos <= itensPossiveis` (FR-032).

`valorOriginal` preserva a string **exatamente como recebida**, incluindo espaços internos, e não a
forma normalizada (FR-030). Célula ausente e célula inválida são resultados distintos e nunca se
confundem.

---

## `calculateStudentPerformance`

```ts
function calculateStudentPerformance(results: readonly MaybeFraction[]): MaybeFraction
```

Desempenho geral do estudante (FR-056).

- Soma acertos e itens **apenas** das habilidades com resultado; entradas `null` são ignoradas, não
  contadas como zero.
- Retorna `null` se nenhuma habilidade tiver resultado — nunca `{ acertos: 0, itens: 0 }`.
- **Não** retorna percentual: a divisão pertence à borda de apresentação (R-001).
- **Não** calcula média de percentuais em nenhuma circunstância (FR-058).

Exemplo do PRD §8: acertos totais 15, itens 22 → `{ acertos: 15, itens: 22 }`. O `68,18%` aparece só
na tela.

---

## `calculateSkillPerformance`

```ts
function calculateSkillPerformance(
  entries: readonly { avaliado: boolean; result: MaybeFraction }[],
): MaybeFraction
```

Percentual consolidado de uma habilidade num recorte (FR-057).

- Considera **exclusivamente** entradas com `avaliado === true` (FR-059).
- Ignora resultados `null` dentro dos avaliados.
- Retorna `null` quando não há nenhum item possível no recorte — nunca zero (FR-065).
- Denominadores divergentes entre estudantes são somados normalmente: `Σ itens` absorve a variação
  sem tratamento especial (FR-157).

O parâmetro `avaliado` é explícito na assinatura de propósito: torna impossível chamar esta função
sem decidir o que fazer com os não avaliados.

---

## `calculateParticipationRate`

```ts
function calculateParticipationRate(
  entries: readonly { avaliado: boolean }[],
): Readonly<{ total: number; avaliados: number; naoAvaliados: number }>
```

Participação (FR-061). O denominador é **todo registro importado**, incluindo os não avaliados
(FR-060) — é a única métrica do sistema em que eles entram.

Retorna as contagens, não a taxa. A divisão é feita na apresentação, pela mesma razão das anteriores.

---

## `classifyAnalyticalSkillResult`

```ts
function classifyAnalyticalSkillResult(
  result: MaybeFraction,
  bands: AnalyticalBands,
): AnalyticalBand | null
```

Classificação **analítica** de um resultado de habilidade (FR-109).

| Condição | Retorno |
|---|---|
| `percentual < bands.fragilidadeMax` | `FRAGILIDADE` |
| `bands.fragilidadeMax <= percentual < bands.atencaoMax` | `ATENCAO` |
| `percentual >= bands.atencaoMax` | `SATISFATORIO` |
| `result === null` | `null` |

Os limites vêm de `AnalyticalSettings` e **nunca** de constante no código (FR-111). O percentual é
calculado internamente com `Decimal`, sem arredondamento antes da comparação — um resultado de
`3/5` (60% exato) é `ATENCAO`, e a fronteira não pode depender de como o número seria exibido.

**Esta função não tem, e não pode ganhar, relação com `LearningLevel`.** A classificação oficial da
fonte não é produzida, alterada ou inferida por nenhuma função de domínio (Const. III, FR-112).

---

## `rankSkillsByFragility`

```ts
type SkillAggregate = Readonly<{
  skillId: string
  shortCode: string
  result: MaybeFraction
  studentsInFragility: number
  studentsWithResult: number
}>

type RankCriterion =
  | 'LOWEST_PERCENT'          // padrão (FR-072)
  | 'FRAGILITY_RATE'
  | 'FRAGILITY_COUNT'
  | 'POINTS_LOST'

function rankSkillsByFragility(
  skills: readonly SkillAggregate[],
  criterion: RankCriterion,
): readonly SkillAggregate[]
```

Ordena da maior para a menor fragilidade (FR-013 do PRD, FR-072).

**Desempate determinístico em três chaves** (R-011, resolve a lacuna CHK061):

1. critério escolhido;
2. maior `itens` — mais evidência tem precedência;
3. `shortCode` em ordem alfabética — critério final, sempre estável.

Sem a terceira chave a ordem passa a depender do retorno do banco e muda entre execuções sem que
nenhum dado tenha mudado. Habilidades com `result === null` vão para o fim, agrupadas.

`POINTS_LOST` = `Σ itens − Σ acertos`.

---

## `normalizeStudentName`

```ts
function normalizeStudentName(name: string): string
```

Deriva a forma normalizada usada em busca, detecção de duplicidade e sugestão de vinculação assistida
(FR-034, FR-141).

Transformações, nesta ordem: remoção de espaços das extremidades → colapso de espaços internos
múltiplos em um → maiúsculas → remoção de diacríticos (`NFD` + remoção de marcas de combinação).

`"  José   da Silva  "` → `"JOSE DA SILVA"`.

**O nome original nunca é alterado** (FR-034). Esta função produz um campo adicional, nunca um
substituto. A forma normalizada não é exibida ao usuário em nenhuma tela.

---

## `normalizeClassCode`

```ts
function normalizeClassCode(code: string): string
```

Normaliza o Código da Turma (FR-033): **remove apenas os espaços das extremidades**.

O arquivo real traz `" 8npu2dd9128c "` com espaço nos dois lados. Maiúsculas, minúsculas e conteúdo
interno são preservados — o código é opaco e gerado por outro sistema; alterá-lo além do necessário
arriscaria colidir dois códigos distintos.

---

## `validateSkillDenominators`

```ts
type DenominatorReport = Readonly<{
  bySkill: ReadonlyMap<string, {
    referenceItems: number
    tiebreak: boolean
    divergentRows: readonly { rowNumber: number; found: number }[]
  }>
}>

function validateSkillDenominators(
  rows: readonly { rowNumber: number; skillId: string; itens: number }[],
): DenominatorReport
```

Apura o denominador de referência de cada habilidade e detecta divergências (FR-046, FR-155).

- `referenceItems` é o denominador **mais frequente** da habilidade no conjunto.
- Havendo empate de frequência, adota o **maior** e marca `tiebreak = true` (FR-160) — a escolha
  nunca é arbitrária nem silenciosa.
- `divergentRows` lista as linhas fora do padrão, com o valor encontrado, para o relatório de
  inconsistências (FR-149).

A função **não corrige** nada e **não altera** nenhum cálculo: `calculateSkillPerformance` continua
somando todos os denominadores. O relatório serve à apresentação e ao alerta (FR-157, FR-158).

---

## Funções auxiliares de borda

Não são domínio puro no mesmo sentido, mas o contrato é igualmente estrito.

```ts
/** Única conversão fração → percentual do sistema. Sem arredondamento. */
function toPercent(f: MaybeFraction): Decimal | null

/** Única formatação de percentual para exibição. Arredonda aqui e só aqui (FR-063). */
function formatPercent(value: Decimal | null, fractionDigits = 2): string  // "66,67%" ou "—"
```

`formatPercent` usa `Intl.NumberFormat('pt-BR')` e devolve um travessão para ausência de dado — o
que garante, na borda de saída, que ausência jamais se apresente como `0%` (FR-031, FR-093).

---

## Cobertura de teste exigida

| Função | Exigência |
|---|---|
| `parseSkillResult` | tabela completa desta página, caso a caso |
| `calculateStudentPerformance` | ausência total, ausência parcial, exemplo do PRD §8 |
| `calculateSkillPerformance` | não avaliados presentes no conjunto, denominadores divergentes, exemplo do PRD §9 (37/60 = 61,67%) |
| `calculateParticipationRate` | 111/106/5 do arquivo de referência |
| `classifyAnalyticalSkillResult` | fronteiras exatas em 60 e 80, e faixas alteradas |
| `rankSkillsByFragility` | os quatro critérios, empates, estabilidade em execuções repetidas |
| `normalizeStudentName` | acentos, caixa, espaços múltiplos |
| `normalizeClassCode` | o código real com espaços nas duas extremidades |
| `validateSkillDenominators` | conjunto uniforme, divergente e com empate |

O teste de regressão do Princípio X exercita a cadeia inteira sobre a fixture anonimizada e confere
os 111/106/5/4/12, a distribuição 96/7/3 e o ranking do PRD §38.1.
