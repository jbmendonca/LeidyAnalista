# Phase 1 — Modelo de Dados

**Feature**: Painel de Análise de Leitura — II Ciclo CNCA (MVP)
**Data**: 2026-08-27
**Plano**: [plan.md](plan.md) · **Pesquisa**: [research.md](research.md)

Modelo relacional para PostgreSQL via Prisma. Notação em Prisma simplificada; tipos e restrições são
normativos, nomes de campos são orientativos.

---

## Princípios que o modelo materializa

| Regra | Como o modelo a garante |
|---|---|
| Fidelidade (Const. I) | `StudentSkillResult` guarda `valorOriginal`, `acertos` e `itensPossiveis`; ausência é `NULL`, nunca `0` |
| Cálculo por itens (Const. II) | `acertos` e `itensPossiveis` são `Int`; `percentual` é `Decimal`, derivado e nunca somado |
| Classificação oficial (Const. III) | `nivelOriginal` é `String` bruta; o enum normalizado é campo separado e opcional |
| Não avaliados fora do desempenho | `avaliado Boolean` em `AssessmentStudentResult`, filtro obrigatório em toda consulta de desempenho |
| Escopo por escola (Const. IV) | `UserSchool` é a única fonte de autorização; `schoolId` está em toda entidade nominal |
| Auditoria sem PII (Const. IV) | `AuditLog` referencia por id; não há campo de nome |

---

## Enums

```prisma
enum Role            { ADMIN  ANALISTA  ESCOLA }
enum ImportStatus    { UPLOADED  VALIDATING  READY  PROCESSING  COMPLETED  FAILED }
enum IssueSeverity   { ERROR  WARNING }
enum LearningLevel   { ADEQUADO  INTERMEDIARIO  DEFASAGEM }
enum AnalyticalBand  { FRAGILIDADE  ATENCAO  SATISFATORIO }
enum AuditAction     { IMPORT_CONFIRM  IMPORT_DELETE  SETTINGS_CHANGE  REPROCESS
                       STUDENT_CREATE  STUDENT_UPDATE  STUDENT_LINK  STUDENT_UNLINK
                       USER_CREATE  USER_UPDATE  REPORT_EXPORT }
```

`LearningLevel` é **normalização para consulta**, nunca substituição. O valor recebido permanece em
`nivelOriginal` como texto, incluindo `-` e qualquer valor inesperado (FR-036, FR-047).

---

## Identidade e acesso

### User

| Campo | Tipo | Restrições |
|---|---|---|
| id | String @id @default(cuid()) | |
| email | String | @unique, minúsculas |
| passwordHash | String | argon2id (R-002) |
| name | String | |
| role | Role | |
| canAccessNominalData | Boolean | permissão específica de FR-007, independente do perfil e do escopo. Padrão: `true` para ADMIN e ESCOLA, `false` para ANALISTA |
| active | Boolean | @default(true) |
| createdAt / updatedAt | DateTime | |

`canAccessNominalData` é **ortogonal** a `UserSchool`: o vínculo diz *quais escolas*, a permissão diz
*se os nomes aparecem*. Sem ela, o usuário recebe a versão agregada de tudo (FR-007a) — nunca uma
negação de acesso.

### Session

| Campo | Tipo | Restrições |
|---|---|---|
| id | String @id | identificador opaco, ≥256 bits de entropia |
| userId | String | → User, onDelete: Cascade |
| expiresAt | DateTime | expiração absoluta |
| lastSeenAt | DateTime | base da expiração por inatividade |
| createdAt | DateTime | |

Índice em `userId` e em `expiresAt` (limpeza). Revogar sessão é `DELETE` — é o que a autenticação em
banco compra sobre JWT.

### UserSchool

| Campo | Tipo | Restrições |
|---|---|---|
| userId | String | → User |
| schoolId | String | → School |

`@@id([userId, schoolId])`. **Única fonte de autorização por escola** (R-003). Usuário `ADMIN`
dispensa vínculos; `ANALISTA` e `ESCOLA` acessam exclusivamente o que estiver aqui.

---

## Cadastros de referência

### School

`id`, `code` (@unique), `name`, `rede`, `municipio`, `estado`, timestamps.

### Assessment

`id`, `nome`, `ano Int`, `ciclo`, `componenteCurricular`, `dataAplicacao DateTime?`, `status`,
timestamps.

### Class

| Campo | Tipo | Restrições |
|---|---|---|
| id | String @id | |
| schoolId | String | → School |
| externalCode | String | Código da Turma **normalizado** (FR-033) |
| name | String | |
| anoEscolar | String | |

`@@unique([schoolId, externalCode])`.

### Skill

`id`, `shortCode` (@unique, ex. `H07`), `referenceCode` (ex. `4EF14_P`), `descricao`, `ordem Int`.

Catálogo global, independente de avaliação.

### AssessmentSkill

Vincula a habilidade à avaliação e **abriga o denominador de referência** (FR-155, R-011).

| Campo | Tipo | Observação |
|---|---|---|
| assessmentId | String | → Assessment |
| skillId | String | → Skill |
| referenceItems | Int | denominador predominante, derivado dos dados (FR-015, FR-016) |
| referenceItemsTiebreak | Boolean @default(false) | houve empate na apuração (FR-160) |
| recalculatedAt | DateTime | recalculado a cada importação ou exclusão (FR-161) |

`@@id([assessmentId, skillId])`. **Nenhum valor de item é constante no código** — `referenceItems`
nasce sempre da apuração sobre `StudentSkillResult`.

---

## Estudante

### Student

| Campo | Tipo | Restrições |
|---|---|---|
| id | String @id @default(cuid()) | chave técnica |
| uniqueCode | String | **@unique**, código único do estudante (FR-128 a FR-131) |
| schoolId | String | → School |
| classId | String | → Class |
| nomeOriginal | String | preservado para exibição (FR-034) |
| nomeNormalizado | String | busca, duplicidade e vinculação assistida |
| codigoExterno | String? | identificador oficial da rede, quando houver (FR-135) |
| active | Boolean @default(true) | |
| createdAt / updatedAt | DateTime | |

**Não há restrição de unicidade sobre `(classId, nomeNormalizado)`** — FR-175 permite homônimos
cadastrados na mesma turma por decisão explícita. A colisão de FR-147 e FR-148 é regra de importação,
verificada na aplicação, e não constraint de banco. A distinção é deliberada: o banco não deve
impedir o que o cadastro autoriza.

Índices: `@@index([schoolId, classId])`, `@@index([schoolId, nomeNormalizado])`.

**Geração de `uniqueCode`**: aleatório, não derivado de nome, turma ou sequência previsível
(FR-131). Formato sugerido: 10 caracteres de alfabeto sem ambiguidade visual (sem `0/O`, `1/I`),
para ser transcrito à mão em planilha sem erro.

---

## Resultados

### AssessmentStudentResult

Uma linha por estudante por avaliação.

| Campo | Tipo | Observação |
|---|---|---|
| id | String @id | |
| assessmentId | String | → Assessment |
| schoolId | String | → School (desnormalizado para escopo e índice) |
| classId | String | → Class |
| studentId | String | → Student |
| importId | String | → Import, origem do dado |
| avaliado | Boolean | **filtro obrigatório de todo cálculo de desempenho** |
| nivelOriginal | String | valor bruto da fonte, preservado |
| nivelNormalizado | LearningLevel? | `NULL` quando não avaliado ou fora do conjunto esperado |
| acertosTotais | Int? | `NULL` quando não avaliado — nunca `0` |
| itensTotais | Int? | `NULL` quando não avaliado |
| percentualGeral | Decimal(7,4)? | derivado; nunca fonte de agregação |

`@@unique([assessmentId, studentId])` — impede dois resultados do mesmo estudante na mesma
avaliação, que é a tradução em banco de FR-147 e FR-148.

Índices: `@@index([assessmentId, schoolId, classId])`, `@@index([assessmentId, avaliado])`,
`@@index([assessmentId, nivelNormalizado])`.

### StudentSkillResult

| Campo | Tipo | Observação |
|---|---|---|
| id | String @id | |
| resultId | String | → AssessmentStudentResult, onDelete: Cascade |
| skillId | String | → Skill |
| valorOriginal | String? | exatamente como recebido (`"2 / 3"`); `NULL` se ausente |
| acertos | Int? | `NULL` se ausente — **nunca 0** (FR-031) |
| itensPossiveis | Int? | `NULL` se ausente |
| percentual | Decimal(7,4)? | derivado |

`@@unique([resultId, skillId])`. Índice `@@index([skillId])` para as agregações por habilidade.

**Invariante de banco** (CHECK constraint em migration): `acertos IS NULL OR (acertos >= 0 AND
itensPossiveis > 0 AND acertos <= itensPossiveis)`. Traduz FR-032 numa garantia que sobrevive a
qualquer caminho de escrita, inclusive correção manual em produção.

---

## Importação

### Import

| Campo | Tipo | Observação |
|---|---|---|
| id | String @id | |
| assessmentId / schoolId | String | destino da carga |
| fileName | String | nome original enviado |
| fileHash | String | SHA-256 do conteúdo |
| fileSize | Int | |
| storagePath | String? | caminho no volume (R-006); `NULL` após a exclusão do arquivo pelo prazo de retenção |
| fileRetainedUntil | DateTime | prazo de retenção do arquivo original (FR-038a) |
| filePurgedAt | DateTime? | quando o arquivo foi excluído; hash e metadados permanecem (FR-038b) |
| status | ImportStatus | |
| userId | String | quem importou |
| createdAt / confirmedAt | DateTime | |
| totalRows / evaluatedRows / notEvaluatedRows / classCount / skillCount | Int | contagens da pré-visualização |
| errorCount / warningCount | Int | |

`@@index([assessmentId, schoolId, fileHash])` — detecta reimportação acidental do mesmo conteúdo e
gera alerta; não é `@@unique`, porque uma carga excluída e legitimamente refeita repetiria o hash.

**Transições de estado** (nenhuma outra é válida):

```text
UPLOADED ──► VALIDATING ──► READY ──────► PROCESSING ──► COMPLETED
                 │             │               │
                 └────► FAILED ◄───────────────┘
```

`READY` significa pré-visualização disponível e ausência de `ERROR`. A promoção `READY → PROCESSING →
COMPLETED` ocorre integralmente dentro de uma transação (FR-051, FR-053).

### ImportRow — área de estágio

Grava o que o sistema entendeu do arquivo, antes da confirmação (R-007). **Não é resultado de
avaliação.**

| Campo | Tipo | Observação |
|---|---|---|
| id / importId | String | |
| rowNumber | Int | linha no arquivo de origem, base 1, para diagnóstico |
| rawData | Json | linha bruta após normalização de cabeçalhos |
| parsedData | Json | valores interpretados, incluindo cada habilidade |
| resolvedStudentId | String? | vínculo resolvido por código ou confirmado pelo usuário |
| resolutionKind | String? | `CODE` \| `ASSISTED` \| `NEW` \| `UNRESOLVED` |
| blocked | Boolean | possui `ERROR` |

`@@unique([importId, rowNumber])`. Descartado após `COMPLETED` ou `FAILED`, conforme política de
limpeza.

### ImportIssue

Estrutura exigida pelo usuário, com os campos exatos.

| Campo | Tipo | Observação |
|---|---|---|
| id / importId | String | |
| rowNumber | Int? | `NULL` para problemas do arquivo inteiro |
| column | String? | coluna envolvida |
| code | String | código estável, ex. `SKILL_VALUE_INVALID` |
| severity | IssueSeverity | `ERROR` bloqueia; `WARNING` permite confirmação consciente |
| message | String | mensagem em pt-BR |
| originalValue | String? | valor encontrado, para diagnóstico |

`@@index([importId, severity])`.

**Catálogo mínimo de códigos** — cada um rastreia a um requisito:

| Código | Severidade | Requisito |
|---|---|---|
| `STUDENT_NAME_MISSING` | ERROR | FR-041 |
| `CLASS_CODE_MISSING` | ERROR | FR-041 |
| `SKILL_VALUE_INVALID` | ERROR | FR-032 |
| `SKILL_VALUE_OVER_MAX` | ERROR | FR-032 |
| `SKILL_COLUMN_MISSING` | ERROR | FR-041 |
| `DUPLICATE_KEY_IN_FILE` | ERROR | FR-147 |
| `DUPLICATE_KEY_IN_ASSESSMENT` | ERROR | FR-148 |
| `DUPLICATE_UNIQUE_CODE_IN_FILE` | ERROR | FR-152 |
| `UNKNOWN_UNIQUE_CODE` | ERROR | FR-139 |
| `CODE_FROM_OTHER_SCHOOL` | WARNING | FR-140 |
| `STUDENT_NOT_REGISTERED` | WARNING | FR-172 |
| `REGISTERED_STUDENT_ABSENT` | WARNING | FR-173 |
| `SAME_NAME_OTHER_CLASS` | WARNING | FR-045, FR-151 |
| `DENOMINATOR_DIVERGENT` | WARNING | FR-046 |
| `LEVEL_MISSING_FOR_EVALUATED` | WARNING | FR-041 |
| `EVALUATED_WITHOUT_RESULTS` | WARNING | FR-041 |
| `NOT_EVALUATED_WITH_RESULTS` | WARNING | FR-041 |
| `SKILL_NOT_IN_CATALOG` | WARNING | FR-041 |
| `FILE_ALREADY_IMPORTED` | WARNING | R-006 |

---

## Configuração e auditoria

### AnalyticalSettings

Configuração **global e versionada** (FR-162 a FR-167). Nunca sofre `UPDATE`: cada alteração insere
nova versão.

| Campo | Tipo | Observação |
|---|---|---|
| id | String @id | |
| version | Int | @unique, incremental |
| fragilidadeMax | Decimal(5,2) | limite superior exclusivo, padrão `60.00` |
| atencaoMax | Decimal(5,2) | limite superior exclusivo, padrão `80.00` |
| baixoRendimento | LearningLevel[] | padrão `[DEFASAGEM]` |
| abaixoDoAdequadoHabilitado | Boolean | visão opcional (FR-073) |
| effectiveFrom | DateTime | início de vigência |
| createdByUserId | String | autor |

A versão vigente é a de maior `effectiveFrom` não futura. Relatórios registram a `version` usada
(FR-166).

### AuditLog

| Campo | Tipo | Observação |
|---|---|---|
| id | String @id | |
| action | AuditAction | |
| userId | String | autor |
| occurredAt | DateTime | |
| entityType / entityId | String | alvo, **sempre por identificador** |
| schoolId / assessmentId | String? | escopo, para consulta |
| beforeValue / afterValue | Json? | apenas campos não nominais |
| metadata | Json? | contexto adicional sem PII |

`@@index([occurredAt])`, `@@index([entityType, entityId])`, `@@index([userId])`.

**Sem campo de nome.** O `uniqueCode` do estudante é aceitável em `metadata` porque não é derivado de
dado pessoal (FR-131, R-013). Registros de auditoria não são editáveis pela aplicação (FR-120): sem
rota de `UPDATE` ou `DELETE`.

---

## Consultas de agregação — forma canônica

Toda métrica de desempenho parte da mesma estrutura. O filtro `avaliado = true` é **obrigatório** e
sua ausência é tratada como defeito na revisão.

```sql
-- Percentual consolidado de cada habilidade num recorte (FR-057)
SELECT ssr.skill_id,
       SUM(ssr.acertos)          AS acertos,
       SUM(ssr.itens_possiveis)  AS itens
FROM   student_skill_result ssr
JOIN   assessment_student_result asr ON asr.id = ssr.result_id
WHERE  asr.assessment_id = $1
  AND  asr.school_id     = ANY($2)   -- escopo derivado no servidor, nunca do cliente
  AND  asr.avaliado      = true       -- FR-059
  AND  ssr.acertos IS NOT NULL
GROUP  BY ssr.skill_id;
```

O percentual é calculado **fora do SQL**, sobre os inteiros retornados, com `Decimal` (R-001).

```sql
-- Participação (FR-061): denominador é TODO registro importado, sem filtro de avaliado
SELECT COUNT(*)                            AS total,
       COUNT(*) FILTER (WHERE avaliado)    AS avaliados
FROM   assessment_student_result
WHERE  assessment_id = $1 AND school_id = ANY($2);
```

A diferença entre as duas consultas — presença e ausência de `avaliado = true` — é a tradução exata
de FR-059 e FR-060, e é o ponto do sistema que mais merece teste dedicado.

---

## Volumetria

| Entidade | Ordem de grandeza por avaliação |
|---|---|
| AssessmentStudentResult | 10² a 10⁴ |
| StudentSkillResult | 12× o anterior — 10³ a 10⁵ |
| ImportRow | transitório, igual ao número de linhas |

Índices compostos sobre `(assessment_id, school_id, class_id)` e `(result_id, skill_id)` mantêm as
agregações abaixo do limite de 3 segundos do RNF-002 sem materialização (R-008).
