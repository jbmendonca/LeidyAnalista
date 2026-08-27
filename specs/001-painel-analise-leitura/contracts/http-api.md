# Contrato — Superfície de Servidor

**Feature**: Painel de Análise de Leitura — II Ciclo CNCA (MVP)
**Plano**: [../plan.md](../plan.md)

Define a superfície exposta pelo servidor: Server Actions (mutações originadas de formulário),
Route Handlers (upload, download e exportação) e as regras de autorização que valem para **todas**
elas sem exceção.

---

## Regra de autorização — vale para toda entrada desta página

```ts
type AuthContext = Readonly<{
  userId: string
  role: 'ADMIN' | 'ANALISTA' | 'ESCOLA'
  allowedSchoolIds: readonly string[]   // derivado de UserSchool no servidor
}>
```

1. Toda entrada resolve `AuthContext` **no servidor**, a partir do cookie de sessão. Nenhuma
   confia em cabeçalho, corpo ou parâmetro para determinar identidade ou papel.
2. `schoolId` recebido do cliente é **filtro, nunca autorização**. Se não pertencer a
   `allowedSchoolIds`, a requisição é rejeitada — não é silenciosamente ignorada nem ajustada.
3. `ADMIN` tem `allowedSchoolIds` igual ao conjunto de todas as escolas, resolvido no servidor.
4. Ausência de dado autorizado retorna resultado vazio; **jamais** revela existência de escola não
   autorizada, nem por contagem, nem por mensagem de erro, nem por diferença de código de status.
5. Toda mutação registra `AuditLog` na mesma transação da escrita.

Violação de qualquer um dos cinco pontos é defeito bloqueante em revisão.

---

## Autenticação

| Operação | Tipo | Papel | Observações |
|---|---|---|---|
| `signIn(email, senha)` | Server Action | público | argon2id; resposta idêntica para e-mail inexistente e senha errada; sessão rotacionada |
| `signOut()` | Server Action | autenticado | remove a linha de `Session` |

Sem autocadastro e sem recuperação por e-mail no MVP: a redefinição de senha é ação do `ADMIN`.

---

## Usuários e escolas

| Operação | Tipo | Papel |
|---|---|---|
| `createUser` / `updateUser` / `deactivateUser` | Server Action | ADMIN |
| `linkUserToSchool` / `unlinkUserFromSchool` | Server Action | ADMIN |
| `createSchool` / `updateSchool` | Server Action | ADMIN |
| `listSchools` | leitura | qualquer, restrita a `allowedSchoolIds` |

---

## Avaliações, turmas, habilidades

| Operação | Tipo | Papel |
|---|---|---|
| `createAssessment` / `updateAssessment` | Server Action | ADMIN |
| `listAssessments` | leitura | qualquer |
| `createClass` / `updateClass` | Server Action | ADMIN, ANALISTA |
| `listSkills` / `updateSkillCatalog` | leitura / Server Action | leitura livre; escrita ADMIN |

O catálogo de habilidades não contém dado pessoal e é legível por qualquer perfil autenticado.

---

## Estudantes

| Operação | Tipo | Papel | Requisito |
|---|---|---|---|
| `createStudent` | Server Action | ADMIN, ANALISTA | FR-168, FR-169 |
| `updateStudent` | Server Action | ADMIN, ANALISTA | FR-178 — cadastral apenas, nunca resultado |
| `importStudentRoster` | Route Handler `POST` | ADMIN, ANALISTA | FR-170 — nominata em lote |
| `exportStudentRoster` | Route Handler `GET` | conforme autorização nominal | FR-174, FR-145 |
| `findStudentByUniqueCode` | leitura | qualquer, dentro do escopo | FR-133 |
| `unlinkStudentResult` | Server Action | ADMIN | FR-146 |

`createStudent` e `importStudentRoster` são os **únicos** caminhos de criação de estudante. Não há
criação implícita em nenhum ponto do pipeline de importação de resultados (FR-143, FR-172): a criação
durante a pré-visualização é uma chamada explícita a `createStudent` disparada pelo usuário.

---

## Importação de resultados

Pipeline de FR-019, um passo por entrada.

| # | Operação | Tipo | Papel | Estado resultante |
|---|---|---|---|---|
| 1 | `POST /api/imports` | Route Handler | ADMIN, ANALISTA | `UPLOADED` |
| 2 | `detectAndMapColumns(importId)` | Server Action | idem | `VALIDATING` |
| 3 | `confirmColumnMapping(importId, mapping)` | Server Action | idem | `VALIDATING` |
| 4 | `runValidation(importId)` | Server Action | idem | `READY` ou `FAILED` |
| 5 | `GET /api/imports/:id/preview` | Route Handler | idem | sem transição |
| 6 | `resolveStudentLink(importId, rowNumber, decision)` | Server Action | idem | sem transição |
| 7 | `confirmImport(importId)` | Server Action | idem | `PROCESSING` → `COMPLETED` |
| 8 | `deleteImport(importId)` | Server Action | **ADMIN** | remove resultados, mantém auditoria |

**Upload** (passo 1): valida extensão (`.csv`, `.xlsx`, `.xls`), tipo MIME quando o navegador o
fornece, e tamanho contra `IMPORT_MAX_FILE_SIZE_MB` (configurável). Calcula SHA-256, grava o arquivo
no volume e cria `Import`. Requer `assessmentId` e `schoolId`, ambos validados contra
`allowedSchoolIds` (FR-028).

**Pré-visualização** (passo 5): lê exclusivamente de `ImportRow` e `ImportIssue`. **Nenhuma escrita
em tabela de resultado ocorre antes do passo 7** (FR-051). Retorna as contagens de FR-049, a amostra
de FR-050 com valor original ao lado do interpretado, e os problemas agrupados por severidade.

**Confirmação** (passo 7): rejeitada se houver qualquer `ERROR` pendente (FR-040). Executa numa
única transação: promove `ImportRow` → `AssessmentStudentResult` + `StudentSkillResult`, recalcula
`AssessmentSkill.referenceItems` (FR-161), grava `AuditLog` e marca `COMPLETED`. Falha em qualquer
ponto reverte tudo e leva a `FAILED`.

**Exclusão** (passo 8): remove os resultados da importação, recalcula os denominadores de referência
das habilidades afetadas e preserva `Import`, `ImportIssue` e `AuditLog` (FR-118, premissa 13).

---

## Análise

Leituras, todas com escopo aplicado na consulta.

| Operação | Recorte |
|---|---|
| `getAssessmentDashboard(assessmentId, filters)` | FR-066 a FR-073 |
| `getSchoolDashboard(schoolId, assessmentId, filters)` | FR-074 a FR-076 |
| `getClassDashboard(classId, assessmentId, filters)` | FR-077 a FR-082 |
| `getSkillDetail(skillId, assessmentId, filters)` | FR-083 a FR-087 |
| `getStudentRecord(studentId, assessmentId)` | FR-088 a FR-093 |
| `getHeatmap(classId, assessmentId)` | FR-094 a FR-097 |

`filters` é validado por Zod e aceita as quinze dimensões de FR-098. Toda resposta de indicador
carrega `{ acertos, itens }` junto do percentual, para satisfazer a rastreabilidade de FR-064 —
a interface decide se exibe sempre ou sob demanda.

---

## Relatórios e exportações

| Operação | Formato | Papel |
|---|---|---|
| `GET /api/reports/:tipo/csv` | CSV | conforme autorização nominal |
| `GET /api/reports/:tipo/xlsx` | XLSX | idem |
| `GET /relatorios/:tipo/imprimir` | HTML com `@media print` | idem |

`tipo` ∈ `geral`, `escola`, `turma`, `habilidade`, `individual` (FR-102).

Regras comuns: gerados no servidor; respeitam os filtros recebidos **e** o escopo do usuário
(FR-104); declaram no cabeçalho a avaliação, a escola, os filtros, a versão de `AnalyticalSettings`
vigente, a data/hora e o solicitante (FR-106, FR-166); registram `REPORT_EXPORT` em auditoria.

**Relatórios nominais** exigem a permissão específica `canAccessNominalData` (FR-007). Quem não a
possui **recebe a versão agregada**, sem nomes — a geração nunca é negada por esse motivo (FR-007a,
FR-105). Negação com `404` fica reservada ao caso distinto de escola fora do escopo (FR-006).

A supressão do nome é aplicada **na consulta**, não na renderização: a resposta do servidor não deve
carregar nomes que o solicitante não pode ver. Um componente que "esconde a coluna" seria exatamente
a permissão implementada só na interface que o Princípio IV proíbe.

---

## Configuração

| Operação | Tipo | Papel |
|---|---|---|
| `getCurrentAnalyticalSettings` | leitura | qualquer autenticado |
| `createAnalyticalSettingsVersion(payload)` | Server Action | ADMIN |
| `listAnalyticalSettingsVersions` | leitura | ADMIN |

Nunca há `UPDATE`: cada alteração insere versão nova (FR-163). A resposta de leitura inclui a
`version`, para que relatórios possam registrá-la.

---

## Auditoria

| Operação | Tipo | Papel |
|---|---|---|
| `listAuditLog(filters)` | leitura | ADMIN |
| `listImports(filters)` | leitura | ADMIN, ANALISTA, dentro do escopo |

Somente leitura. Não existe rota de alteração ou remoção de `AuditLog` (FR-120).

---

## Validação de entrada

Todo dado externo passa por Zod antes de qualquer uso (FR-024 da spec, Const. V): corpo de Server
Action, parâmetros de rota, query string, arquivos enviados e conteúdo de linha do arquivo importado.
Os esquemas vivem em `src/modules/*/schemas/` e são compartilhados entre servidor e formulário — a
validação de cliente é conveniência de UX, e a de servidor é a que vale.

---

## Códigos de resposta

| Situação | Resposta |
|---|---|
| Não autenticado | `401` |
| Autenticado sem permissão de papel | `403` |
| Recurso fora de `allowedSchoolIds` | `404` — **nunca `403`** |
| Entrada inválida | `422` com detalhes por campo |
| Confirmação com `ERROR` pendente | `409` |
| Arquivo acima do limite | `413` |

O `404` para recurso fora de escopo é deliberado: `403` confirmaria a existência da escola ao usuário
não autorizado, o que é vazamento de informação (FR-006).
