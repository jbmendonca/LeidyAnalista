---

description: "Task list for feature implementation"
---

# Tasks: Painel de Análise de Leitura — II Ciclo CNCA (MVP)

**Input**: Design documents from `/specs/001-painel-analise-leitura/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: incluídos e obrigatórios. O Princípio V da constituição condiciona a conclusão de qualquer tarefa a lint, typecheck, testes unitários, testes de integração e build de produção passando; o Princípio X acrescenta o teste de regressão do arquivo de referência.

**Organization**: fases conforme a estrutura de 18 fases definida pelo usuário. O rótulo `[US#]` mantém a rastreabilidade às user stories da spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo — arquivos distintos, sem dependência pendente
- **[US#]**: user story da spec a que a tarefa serve
- `✓` abaixo de cada tarefa: critério objetivo de conclusão

## Path Conventions

Monolito Next.js conforme [plan.md](plan.md): `src/app/`, `src/modules/<módulo>/{domain,application,infra,schemas}/`, `src/server/`, `src/components/`, `prisma/`, `tests/`.

## Regra de paralelismo

Não recebem `[P]`, por decisão explícita do usuário, tarefas que dependam de **schema**, **migrations**, **contratos** ou **regras de domínio ainda não definidas**. Na prática: nada em Fase 1 após `T009` é paralelo até a migration existir, e nada consome função de domínio antes de ela estar implementada e testada.

## Numeração

T001 a T188 seguem a ordem de execução. **T189 a T196 foram acrescentadas em 2026-08-27 pela remediação de `/speckit-analyze`** e estão posicionadas na fase a que pertencem, não no fim do arquivo — por isso o número está fora de ordem naquele ponto. A escolha preserva todas as referências já existentes a tarefas anteriores.

---

## FASE 1 — FUNDAÇÃO

**Propósito**: projeto executável, banco de pé, schema aplicado e seed carregado.

- [X] T001 Inicializar projeto Next.js com App Router e React em `/` (`package.json`, `next.config.ts`)
  - ✓ `npm run dev` sobe e serve uma rota
- [X] T002 Configurar TypeScript strict em `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`)
  - ✓ `npm run typecheck` passa sem `any` implícito
- [X] T003 [P] Configurar ESLint em `eslint.config.mjs`, incluindo regra que proíbe `src/modules/*/domain/**` de importar `react`, `next` ou `@prisma/client`
  - ✓ import proibido em `domain/` falha o lint (Const. VI)
- [X] T004 [P] Configurar Prettier e EditorConfig em `.prettierrc`, `.editorconfig`
- [X] T005 Criar a árvore de diretórios de `plan.md` em `src/`, `prisma/`, `tests/`
  - ✓ os treze módulos existem com as quatro camadas
- [X] T006 [P] Criar `docker-compose.yml` com PostgreSQL 16 e volume nomeado
  - ✓ `docker compose up -d db` responde a `pg_isready`
- [X] T007 [P] Criar `.env.example` e validação de ambiente com Zod em `src/lib/env.ts` (`DATABASE_URL`, `SESSION_SECRET`, `IMPORT_STORAGE_DIR`, `IMPORT_MAX_FILE_SIZE_MB`)
  - ✓ variável ausente derruba o boot com mensagem clara
- [X] T008 Inicializar Prisma em `prisma/schema.prisma` com datasource PostgreSQL
- [X] T009 Escrever o schema completo em `prisma/schema.prisma`: enums e os 16 modelos de [data-model.md](data-model.md)
  - ✓ `acertos`/`itensPossiveis` são `Int?`; `percentual` é `Decimal @db.Decimal(7,4)`; **nenhum `Float` no arquivo**
- [X] T010 Gerar a migration inicial em `prisma/migrations/`
  - ✓ `npm run db:migrate` aplica em banco vazio sem erro
- [X] T011 Adicionar CHECK constraints por SQL na migration: `acertos IS NULL OR (acertos >= 0 AND itens_possiveis > 0 AND acertos <= itens_possiveis)`
  - ✓ `INSERT` violando a regra é rejeitado pelo banco (FR-032)
- [X] T012 Adicionar os índices compostos de [data-model.md](data-model.md) na migration em `prisma/migrations/`
- [X] T013 Criar o cliente Prisma singleton em `src/server/prisma.ts`
- [X] T014 Escrever o seed do catálogo das 12 habilidades em `prisma/seed.ts`, com códigos e descrições do PRD §4
  - ✓ 12 registros em `Skill`; **nenhuma quantidade de itens é semeada** (FR-016)
- [X] T015 Estender o seed com `AnalyticalSettings` versão 1 (60/80, baixo rendimento = Defasagem), um usuário ADMIN e uma escola de demonstração
- [X] T016 Declarar os scripts npm em `package.json`: `dev`, `lint`, `typecheck`, `test`, `test:regression`, `test:e2e`, `build`, `db:migrate`, `db:seed`
  - ✓ os seis comandos do portão da constituição executam

**Checkpoint**: banco de pé, schema aplicado, catálogo semeado.

---

## FASE 2 — AUTENTICAÇÃO E AUTORIZAÇÃO

**Propósito**: nenhum dado nominal acessível sem identidade e escopo verificados no servidor. Implementa a **US3 (P1)**.

- [X] T017 [US3] Implementar hash e verificação de senha com argon2id em `src/modules/auth/domain/password.ts`
  - ✓ teste unitário: hash não é reversível, verificação aceita a senha correta e rejeita a errada
- [X] T018 [US3] Implementar criação, leitura, renovação e revogação de sessão em `src/modules/auth/infra/session-repository.ts`
  - ✓ expiração absoluta e por inatividade; revogar é `DELETE` (R-002)
- [X] T019 [US3] Implementar `signIn` em `src/modules/auth/application/sign-in.ts`
  - ✓ resposta idêntica para e-mail inexistente e senha errada; sessão rotacionada na autenticação
- [X] T020 [US3] Implementar `signOut` em `src/modules/auth/application/sign-out.ts`
- [X] T021 [US3] Implementar `resolveAuthContext` a partir do cookie em `src/server/auth-context.ts`
  - ✓ cookie `httpOnly`, `Secure`, `SameSite=Lax`
- [X] T022 [US3] Implementar `resolveAllowedSchoolIds` — **chokepoint único de autorização** — em `src/server/authorization.ts`
  - ✓ deriva de `UserSchool`; ADMIN recebe todas; nenhum caminho aceita `schoolId` do cliente como autorização (R-003)
- [X] T023 [US3] Implementar os guardas `requireUser` e `requireRole` em `src/server/authorization.ts`
- [X] T024 [US3] Implementar o middleware de rota autenticada em `src/middleware.ts`
  - ✓ rota de dado nominal sem sessão redireciona para `/entrar`
- [X] T025 [US3] Implementar a tela de login em `src/app/(public)/entrar/page.tsx`
- [X] T026 [US3] Implementar CRUD de usuários (ADMIN) em `src/modules/users/application/` e `src/app/(app)/usuarios/`
- [X] T027 [US3] Implementar vínculo e desvínculo usuário–escola em `src/modules/users/application/link-school.ts`
- [X] T189 [US3] Implementar a permissão `canAccessNominalData` no cadastro de usuários em `src/modules/users/application/set-nominal-permission.ts` (FR-007)
  - ✓ padrão na criação: concedida a ADMIN e ESCOLA, negada a ANALISTA; alterável pelo ADMIN e registrada em auditoria
- [X] T190 [US3] Implementar a supressão de dados nominais na camada de consulta em `src/server/nominal-data.ts` (FR-007a)
  - ✓ a resposta do servidor **não carrega** nomes que o solicitante não pode ver; esconder coluna no componente é reprovado em revisão
- [X] T028 [P] [US3] Escrever os esquemas Zod de auth e users em `src/modules/auth/schemas/` e `src/modules/users/schemas/`
- [X] T029 [P] [US3] Implementar o logger com guarda de PII em `src/server/logger.ts`
  - ✓ campo de lista negra (`nome`, `nomeOriginal`, `estudante`) derruba o processo em desenvolvimento (FR-009, R-013)
- [X] T030 [US3] Implementar o mapeamento de códigos de resposta em `src/server/http-errors.ts`
  - ✓ recurso fora de escopo retorna **404, nunca 403** (contrato http-api)
- [X] T031 [P] [US3] Testes unitários de senha e sessão em `tests/unit/auth/`
- [X] T032 [US3] Escrever a **matriz de autorização** em `tests/integration/authorization.test.ts`
  - ✓ enumera cada entrada de servidor e executa com usuário ESCOLA de outra escola, exigindo vazio ou 404; entrada nova sem linha na matriz quebra a suíte

**Checkpoint**: US3 funcional e testável isoladamente.

---

## FASE 3 — DOMÍNIO PRINCIPAL

**Propósito**: cadastros que a importação pressupõe. Implementa a **US10 (P1)**.

- [X] T033 [P] Implementar CRUD de escolas em `src/modules/schools/` e `src/app/(app)/escolas/`
- [X] T034 [P] Implementar CRUD de avaliações em `src/modules/assessments/` e `src/app/(app)/avaliacoes/`
- [X] T035 [P] Implementar CRUD de turmas em `src/modules/classes/`
  - ✓ `externalCode` gravado já normalizado (FR-033)
- [X] T191 Implementar a proteção contra exclusão de avaliação, escola ou habilidade com resultados vinculados em `src/modules/assessments/application/delete-guard.ts` (FR-018)
  - ✓ chave estrangeira `RESTRICT` na migration + override explícito do ADMIN registrado em auditoria; teste garante que resultado importado nunca é destruído em cascata
- [X] T036 [P] Implementar leitura do catálogo de habilidades em `src/modules/skills/application/list-skills.ts`
- [X] T037 Implementar a geração de `uniqueCode` em `src/modules/students/domain/unique-code.ts`
  - ✓ aleatório, não derivado de dado pessoal, alfabeto sem `0/O` e `1/I` (FR-131); teste de colisão em 10⁵ gerações
- [X] T038 [US10] Implementar cadastro individual de estudante em `src/modules/students/application/create-student.ts`
  - ✓ atribui `uniqueCode` na criação (FR-169); grava `AuditLog` `STUDENT_CREATE` (FR-136)
- [X] T039 [US10] Implementar edição cadastral de estudante em `src/modules/students/application/update-student.ts`
  - ✓ altera nome, turma e escola; **não toca em nenhum resultado** (FR-178)
- [X] T040 [US10] Implementar importação de nominata em lote em `src/modules/students/application/import-roster.ts`
  - ✓ reusa as mesmas regras de normalização e severidade da importação de resultados (FR-170); depende de T053 e T054
- [X] T041 [US10] Implementar exportação da nominata com códigos em `src/app/api/students/roster/route.ts`
  - ✓ respeita escopo e autorização nominal (FR-174)
- [X] T042 [P] [US10] Implementar busca de estudante por `uniqueCode` em `src/modules/students/application/find-by-code.ts` (FR-133)
- [X] T043 [US10] Implementar as telas de cadastro e listagem de estudantes em `src/app/(app)/estudantes/`
  - ✓ exibe `uniqueCode`; exibe o **nome original**, nunca o normalizado (FR-132, FR-134)
- [X] T044 Implementar leitura da versão vigente de `AnalyticalSettings` em `src/modules/settings/application/get-current-settings.ts`
  - ✓ maior `effectiveFrom` não futura; nenhum limite fixo em código (FR-111)
- [X] T045 [P] Escrever os esquemas Zod dos cadastros em `src/modules/{schools,assessments,classes,students}/schemas/`
- [X] T046 [P] Testes de integração dos cadastros em `tests/integration/registrations.test.ts`
- [X] T047 [US10] Teste de integração: dois homônimos coexistem na mesma turma com códigos distintos, em `tests/integration/homonyms.test.ts` (FR-175)
- [X] T048 [US10] Teste de integração: 111 estudantes por nominata recebem 111 códigos distintos, em `tests/integration/roster-import.test.ts` (SC-021)

**Checkpoint**: US10 funcional; base cadastral pronta para receber resultados.

---

## FASE 4 — PARSER DE ARQUIVOS

**Propósito**: as funções puras de [contracts/domain-functions.md](contracts/domain-functions.md). Nenhuma depende de banco, e todas devem estar testadas antes da Fase 5. Serve a **US1 (P1)**.

- [X] T049 [P] Implementar `toPercent` e `formatPercent` com `Decimal` em `src/lib/decimal.ts`
  - ✓ arredondamento **apenas** em `formatPercent`; ausência devolve `—`, nunca `0%` (FR-063, FR-031)
- [X] T050 [P] [US1] Implementar `parseSkillResult` em `src/modules/imports/domain/parse-skill-result.ts`
  - ✓ tabela completa do contrato: aceita `1 / 1`, `1/1`, ` 1 / 2 `, `2 / 3`; célula vazia devolve os três campos nulos; rejeita `2 / 1`, `1 / 0`, `-1 / 2`, texto e `120%`
- [X] T051 [P] [US1] Testes unitários de `parseSkillResult` em `tests/unit/domain/parse-skill-result.test.ts`
  - ✓ um caso por linha da tabela do contrato, incluindo a distinção ausência × inválido
- [X] T052 [P] [US1] Implementar `normalizeStudentName` em `src/modules/students/domain/normalize-name.ts`
  - ✓ trim, colapso de espaços, maiúsculas, remoção de diacríticos; **não altera o nome original** (FR-034)
- [X] T053 [P] [US1] Implementar `normalizeClassCode` em `src/modules/classes/domain/normalize-class-code.ts`
  - ✓ remove **apenas** espaços das extremidades; preserva caixa e conteúdo interno (FR-033)
- [X] T054 [P] [US1] Testes unitários de normalização em `tests/unit/domain/normalization.test.ts`
  - ✓ inclui o código real `" 8npu2dd9128c "` e nomes com acento, caixa mista e espaços múltiplos
- [X] T055 [P] [US1] Implementar `validateSkillDenominators` em `src/modules/imports/domain/validate-denominators.ts`
  - ✓ denominador predominante; empate adota o **maior** e marca `tiebreak` (FR-160); lista as linhas divergentes
- [X] T056 [P] [US1] Testes unitários de denominadores em `tests/unit/domain/validate-denominators.test.ts`
  - ✓ conjunto uniforme, conjunto divergente e conjunto com empate
- [X] T057 [US1] Implementar a detecção de BOM e de codificação em `src/modules/imports/infra/encoding.ts`
  - ✓ BOM removido **antes** da normalização de cabeçalhos; acentos preservados (FR-023, FR-024)
- [X] T058 [US1] Implementar a detecção de separador CSV em `src/modules/imports/infra/delimiter.ts`
  - ✓ escolhe entre `;`, `,` e tabulação; sobreposição manual disponível (FR-021)
- [X] T059 [US1] Implementar o leitor de CSV com `csv-parse` e `iconv-lite` em `src/modules/imports/infra/csv-reader.ts`
  - ✓ processa o arquivo real com `;` e UTF-8 com BOM sem ajuste manual (FR-022)
- [X] T060 [US1] Implementar o leitor de XLSX e XLS com SheetJS em `src/modules/imports/infra/xlsx-reader.ts`
  - ✓ instalado do registro oficial do SheetJS com versão fixada (R-005); primeira aba por padrão, com escolha manual
- [X] T061 [US1] Implementar a identificação de formato por extensão, MIME e assinatura de conteúdo em `src/modules/imports/infra/format-detector.ts`
- [X] T062 [US1] Implementar a normalização de cabeçalhos e o reconhecimento de `H 01` … `H 12` em `src/modules/imports/domain/header-mapping.ts`
  - ✓ reconhece `H 01`, `H01`, `H_01` e `H 01 (2EF08_P)` (FR-026)
- [X] T063 [P] [US1] Testes unitários de mapeamento de cabeçalhos em `tests/unit/domain/header-mapping.test.ts`
- [X] T064 [US1] Testes de integração dos leitores em `tests/integration/readers.test.ts`
  - ✓ mesmo conteúdo em CSV, XLSX e XLS produz linhas idênticas

**Checkpoint**: parser completo e testado, independente de banco e de interface.

---

## FASE 5 — IMPORTAÇÃO

**Propósito**: o pipeline de treze passos de [plan.md](plan.md). Completa a **US1 (P1)**.

- [X] T065 [US1] Implementar upload em `src/app/api/imports/route.ts`
  - ✓ valida extensão, MIME e tamanho contra `IMPORT_MAX_FILE_SIZE_MB`; retorna 413 acima do limite
- [X] T066 [US1] Implementar o cálculo de SHA-256 e a gravação no volume em `src/modules/imports/infra/file-storage.ts`
  - ✓ arquivo nomeado pelo hash; caminho e hash em `Import` (R-006, FR-038)
- [X] T067 [US1] Implementar a criação do registro `Import` com avaliação e escola em `src/modules/imports/application/create-import.ts`
  - ✓ `assessmentId` e `schoolId` validados contra `allowedSchoolIds`; escola obrigatória quando ausente do arquivo (FR-028)
- [X] T068 [US1] Implementar a detecção de arquivo já importado por hash em `src/modules/imports/application/detect-duplicate-file.ts`
  - ✓ emite `FILE_ALREADY_IMPORTED` como `WARNING`
- [X] T069 [US1] Implementar a máquina de estados de `Import` em `src/modules/imports/domain/import-status.ts`
  - ✓ apenas as transições do diagrama de [data-model.md](data-model.md) são aceitas
- [X] T070 [US1] Implementar proposta e confirmação do mapeamento de colunas em `src/modules/imports/application/column-mapping.ts` (FR-027)
- [X] T071 [US1] Implementar a gravação do estágio `ImportRow` em `src/modules/imports/infra/staging-repository.ts`
  - ✓ `rawData` e `parsedData` por linha; **nenhuma escrita em tabela de resultado** (FR-051, R-007)
- [X] T072 [US1] Implementar as validações estruturais em `src/modules/imports/domain/structural-validations.ts`
  - ✓ estudante sem nome, código da turma ausente, turma ausente, coluna de habilidade ausente → `ERROR`
- [X] T073 [US1] Implementar as validações pedagógicas em `src/modules/imports/domain/pedagogical-validations.ts`
  - ✓ avaliado × nível, avaliado sem resultados, não avaliado com resultados, habilidade fora do catálogo → `WARNING`
- [X] T074 [US1] Implementar a detecção de colisão de chave em `src/modules/imports/domain/key-collision.ts`
  - ✓ mesma chave no arquivo e na avaliação → `ERROR` (FR-147, FR-148); mesmo nome em turma diferente → `WARNING` (FR-151)
- [X] T075 [US1] Implementar a reconciliação com a base cadastral em `src/modules/imports/application/reconcile-students.ts`
  - ✓ ordem código → assistida → não cadastrado (FR-171); nunca vincula por nome sozinho (FR-142)
- [X] T076 [US1] Implementar o tratamento de código único no arquivo em `src/modules/imports/application/resolve-by-code.ts`
  - ✓ desconhecido → `ERROR` sem criar estudante (FR-139); de outra escola → `WARNING` (FR-140); repetido no arquivo → `ERROR` (FR-152)
- [X] T077 [US1] Implementar a vinculação assistida e a criação sob demanda em `src/modules/imports/application/assisted-link.ts`
  - ✓ sugere candidatos da mesma escola; criação só por ação explícita do usuário (FR-141, FR-143, FR-172)
- [X] T078 [US1] Implementar a detecção de cadastrado ausente do arquivo em `src/modules/imports/application/detect-absent-students.ts`
  - ✓ `REGISTERED_STUDENT_ABSENT` como `WARNING`, com a lista (FR-173)
- [X] T079 [US1] Implementar o repositório de `ImportIssue` com o catálogo de 19 códigos em `src/modules/imports/infra/issue-repository.ts`
  - ✓ cada ocorrência traz linha, coluna, código, severidade, mensagem em pt-BR e valor original (FR-043)
- [X] T080 [US1] Implementar a API de pré-visualização em `src/app/api/imports/[id]/preview/route.ts`
  - ✓ contagens de FR-049; amostra com valor original ao lado do interpretado (FR-050); lê só do estágio
- [X] T081 [US1] Implementar a interface do fluxo de importação em `src/app/(app)/importacoes/`
  - ✓ os seis passos de FR-019; cancelamento sem efeito colateral (FR-052)
- [X] T082 [US1] Implementar a confirmação transacional em `src/modules/imports/application/confirm-import.ts`
  - ✓ rejeita com qualquer `ERROR` pendente (409); promove estágio → resultados, recalcula `AssessmentSkill.referenceItems` e grava `AuditLog` numa única transação
- [X] T083 [US1] Implementar o rollback e a transição para `FAILED` em `src/modules/imports/application/confirm-import.ts`
  - ✓ falha em qualquer ponto não deixa estado parcial
- [X] T084 [US1] Implementar a apuração e persistência do denominador de referência em `src/modules/skills/application/resolve-reference-items.ts`
  - ✓ derivado dos dados, nunca constante; recalculado a cada importação e exclusão (FR-155, FR-161)
- [X] T085 [US1] Implementar o histórico de importações em `src/modules/imports/application/list-imports.ts` e `src/app/(app)/importacoes/page.tsx`
  - ✓ todos os campos de FR-115
- [X] T086 [US1] Implementar a exclusão de importação (ADMIN) em `src/modules/imports/application/delete-import.ts`
  - ✓ remove resultados, recalcula denominadores, preserva `Import`, `ImportIssue` e `AuditLog` (FR-118)
- [X] T087 [US1] Teste de integração do pipeline completo em `tests/integration/import-pipeline.test.ts`
  - ✓ pré-visualização não grava resultado; confirmação é atômica; falha reverte tudo
- [X] T088 [US1] Teste de integração da reimportação bloqueada em `tests/integration/reimport.test.ts`
  - ✓ 111 `ERROR` de chave existente; após exclusão auditada, a importação passa (FR-153)

**Checkpoint**: US1 completa — o arquivo de referência entra no sistema com fidelidade.

---

## FASE 6 — ANALYTICS

**Propósito**: as funções de cálculo e as consultas agregadas. Base das **US2, US4 e US5**.

- [X] T089 [P] [US2] Implementar `calculateStudentPerformance` em `src/modules/analytics/domain/student-performance.ts`
  - ✓ retorna a fração, não o percentual; ignora nulos sem contá-los como zero; devolve `null` se não há resultado (FR-056)
- [X] T090 [P] [US2] Implementar `calculateSkillPerformance` em `src/modules/analytics/domain/skill-performance.ts`
  - ✓ considera **apenas** `avaliado === true` (FR-059); absorve denominadores divergentes (FR-157)
- [X] T091 [P] [US2] Implementar `calculateParticipationRate` em `src/modules/analytics/domain/participation.ts`
  - ✓ denominador é **todo** registro importado (FR-060, FR-061)
- [X] T092 [P] [US2] Implementar `classifyAnalyticalSkillResult` em `src/modules/analytics/domain/classify.ts`
  - ✓ limites vindos de `AnalyticalSettings`; comparação sem arredondamento prévio; **sem qualquer relação com `LearningLevel`** (FR-112)
- [X] T093 [P] [US2] Implementar `rankSkillsByFragility` em `src/modules/analytics/domain/rank-skills.ts`
  - ✓ quatro critérios de FR-072; desempate em três chaves, ordem estável entre execuções (R-011)
- [X] T094 [US2] Testes unitários dos cálculos em `tests/unit/domain/analytics.test.ts`
  - ✓ exemplos do PRD §8 (15/22) e §9 (37/60 = 61,67%); fronteiras exatas em 60 e 80; empates de ranking
- [X] T095 [US2] Implementar a distribuição por nível de aprendizagem em `src/modules/analytics/application/level-distribution.ts`
  - ✓ denominador **somente avaliados**; não avaliados nunca contados como Defasagem (FR-062)
- [X] T096 [US2] Implementar as contagens de habilidades em fragilidade e em atenção por estudante em `src/modules/analytics/application/student-bands.ts`
- [X] T097 [US2] Implementar as consultas agregadas SQL em `src/modules/analytics/infra/aggregate-queries.ts`
  - ✓ forma canônica de [data-model.md](data-model.md); `avaliado = true` presente em toda consulta de desempenho e ausente na de participação
- [X] T098 [US2] Implementar o escopo por escola nas agregações em `src/modules/analytics/infra/aggregate-queries.ts`
  - ✓ `school_id = ANY($allowedSchoolIds)`, derivado no servidor (FR-006)
- [X] T099 [US2] Garantir que toda resposta de indicador carrega `{ acertos, itens }` junto do percentual
  - ✓ rastreabilidade de FR-064 disponível à interface
- [X] T100 [US2] Testes de integração das agregações em `tests/integration/aggregations.test.ts`
  - ✓ um teste dedicado à diferença entre participação e desempenho quanto aos não avaliados

**Checkpoint**: cálculos corretos e verificáveis antes de qualquer tela.

---

## FASE 7 — DASHBOARD GERAL

**Propósito**: primeira tela de valor. Completa a **US2 (P1)**.

- [X] T101 [P] [US2] Implementar os componentes de card de indicador em `src/components/data/indicator-card.tsx`
  - ✓ exibe numerador e denominador; ausência de dado nunca aparece como `0%` (FR-065)
- [X] T102 [US2] Implementar o painel de participação em `src/app/(app)/avaliacoes/[assessmentId]/page.tsx`
  - ✓ importados, avaliados, não avaliados e taxa (FR-066)
- [X] T103 [US2] Implementar a distribuição por nível com gráfico Recharts em `src/components/charts/level-distribution.tsx`
  - ✓ quantidade e percentual de Adequado, Intermediário e Defasagem sobre os avaliados (FR-068)
- [X] T104 [US2] Implementar o percentual geral de acertos do recorte em `src/app/(app)/avaliacoes/[assessmentId]/page.tsx` (FR-067)
- [X] T105 [US2] Implementar o ranking H01:H12 com TanStack Table em `src/components/data/skill-ranking-table.tsx`
  - ✓ acertos, itens, percentual e posição; ordenação padrão do menor percentual; seletor dos quatro critérios com o ativo visível (FR-070, FR-072)
- [X] T106 [US2] Implementar a habilidade mais frágil e a de melhor desempenho em `src/app/(app)/avaliacoes/[assessmentId]/page.tsx` (FR-069)
- [X] T107 [US2] Implementar o ranking de turmas em `src/components/data/class-ranking-table.tsx`
  - ✓ menor desempenho geral e maior percentual em Defasagem (FR-071)

**Checkpoint**: US2 completa — a pergunta central do produto tem resposta na tela.

---

## FASE 8 — DASHBOARD DA ESCOLA

- [X] T108 [US2] Implementar os indicadores da escola em `src/app/(app)/escolas/[schoolId]/page.tsx`
  - ✓ turmas, estudantes, participação e percentual geral (FR-074)
- [X] T109 [US2] Implementar a distribuição por nível da escola em `src/app/(app)/escolas/[schoolId]/page.tsx` (FR-075)
- [X] T110 [US2] Implementar os rankings de habilidades e de turmas da escola em `src/app/(app)/escolas/[schoolId]/page.tsx` (FR-075)
- [X] T111 [US2] Implementar as listas de estudantes em Defasagem, em Intermediário e não avaliados em `src/components/data/priority-students-list.tsx` (FR-076)
  - ✓ respeita a autorização para dados nominais
- [X] T112 [US2] Teste E2E do escopo de escola em `tests/e2e/school-scope.spec.ts`
  - ✓ cenário 5 do [quickstart](quickstart.md): usuário ESCOLA não alcança outra escola por URL nem por parâmetro

---

## FASE 9 — DASHBOARD DA TURMA

**Propósito**: início da **US4 (P2)**.

- [X] T113 [US4] Implementar o resumo da turma em `src/app/(app)/turmas/[classId]/page.tsx`
  - ✓ escola, turma, código, ano escolar e componente (FR-077)
- [X] T114 [US4] Implementar participação e percentual geral da turma em `src/app/(app)/turmas/[classId]/page.tsx` (FR-078)
- [X] T115 [US4] Implementar a distribuição por nível e as habilidades extremas da turma em `src/app/(app)/turmas/[classId]/page.tsx` (FR-079)
- [X] T116 [US4] Implementar a tabela de habilidades da turma em `src/components/data/class-skills-table.tsx` (FR-080)
  - ✓ ordenação padrão da maior fragilidade para o melhor desempenho
- [X] T117 [US4] Implementar a tabela de estudantes da turma em `src/components/data/student-table.tsx`
  - ✓ colunas de FR-081; ordenável e filtrável
- [X] T118 [US4] Implementar a ordenação por prioridade pedagógica em `src/modules/analytics/domain/student-priority.ts`
  - ✓ Defasagem → Intermediário → Adequado → **não avaliados em lista própria**; dentro do grupo, menor percentual primeiro (FR-082)
- [X] T119 [US4] Teste de componente da tabela em `tests/unit/components/student-table.test.tsx`
  - ✓ não avaliado exibe travessão, não `0`, e não aparece entre os de Defasagem (FR-093)

---

## FASE 10 — TELA DA HABILIDADE

**Propósito**: **US5 (P2)**.

- [X] T120 [US5] Implementar o cabeçalho da habilidade em `src/app/(app)/habilidades/[skillId]/page.tsx`
  - ✓ código curto, código pedagógico e descrição (FR-083)
- [X] T121 [US5] Implementar os totais da habilidade no recorte em `src/app/(app)/habilidades/[skillId]/page.tsx` (FR-084)
  - ✓ quantidade de itens vem de `AssessmentSkill.referenceItems`, jamais de constante
- [X] T122 [US5] Implementar a distribuição `0/n` … `n/n` em `src/components/charts/skill-distribution.tsx`
  - ✓ soma exatamente o total de avaliados com resultado (FR-085)
- [X] T123 [US5] Implementar a listagem de registros com denominador divergente, à parte da distribuição, em `src/components/data/divergent-denominators-list.tsx`
  - ✓ informa quantos ficaram fora e por quê (FR-158, FR-159)
- [X] T124 [US5] Implementar o ranking de turmas na habilidade em `src/components/data/class-ranking-table.tsx` (FR-086)
- [X] T125 [US5] Implementar a lista de estudantes com maior dificuldade em `src/components/data/struggling-students-list.tsx` (FR-087)
  - ✓ respeita a autorização nominal

---

## FASE 11 — FICHA DO ESTUDANTE

- [X] T126 [US4] Implementar a identificação na ficha em `src/app/(app)/estudantes/[studentId]/page.tsx`
  - ✓ nome, escola, turma, código da turma, ano escolar e `uniqueCode` (FR-088, FR-132)
- [X] T127 [US4] Implementar participação e `Nível de aprendizagem` **original** (FR-089)
  - ✓ valor da fonte, sem qualquer substituição (Const. III)
- [X] T128 [US4] Implementar acertos totais, itens possíveis e percentual geral em `src/app/(app)/estudantes/[studentId]/page.tsx` (FR-090)
- [X] T129 [US4] Implementar o detalhamento H01:H12 em `src/components/data/student-skills-table.tsx`
  - ✓ resultado original (`1 / 2`) ao lado do percentual (`50%`) (FR-091, FR-127)
- [X] T130 [US4] Implementar as contagens de fragilidade e atenção com rótulo de critério analítico em `src/components/data/analytical-band-summary.tsx` (FR-092)
  - ✓ visual e conceitualmente distinto do `Nível de aprendizagem` (FR-112)

---

## FASE 12 — MAPA DE CALOR

- [X] T131 [US4] Implementar a matriz estudante × habilidade em `src/components/data/heatmap.tsx`
  - ✓ marcação `<table>` semântica (FR-094)
- [X] T132 [US4] Implementar o detalhe de célula em `src/components/data/heatmap-cell.tsx`
  - ✓ código, resultado original, percentual e descrição da habilidade (FR-095)
- [X] T133 [US4] Implementar a paleta por faixa analítica com WCAG 2.1 AA em `src/components/data/heatmap-palette.ts`
  - ✓ contraste ≥ 4,5:1; valor numérico sempre visível ou acessível — **cor nunca é o único portador** (FR-096)
- [X] T134 [US4] Distinguir visualmente célula sem resultado de célula com resultado zero em `src/components/data/heatmap-cell.tsx` (FR-097)
- [X] T135 [US4] Implementar virtualização com TanStack Virtual acima de 60 estudantes em `src/components/data/heatmap.tsx` (R-010)
  - ✓ abaixo do limiar, sem virtualização; versão de impressão nunca virtualizada
- [X] T192 [US4] Implementar o layout responsivo das telas de análise em `src/app/(app)/` e `src/components/data/` (FR-123, Const. VIII)
  - ✓ tabelas largas rolam no próprio contêiner sem rolagem horizontal da página; nenhum indicador fica inacessível em 375 px de largura
- [X] T136 [US4] Teste de acessibilidade do mapa de calor em `tests/e2e/heatmap-a11y.spec.ts`
  - ✓ navegação por teclado; leitor de tela alcança o valor de cada célula

**Checkpoint**: US4 e US5 completas.

---

## FASE 13 — FILTROS

**Propósito**: **US6 (P2)**.

- [X] T137 [US6] Implementar o esquema Zod das quinze dimensões em `src/modules/analytics/schemas/filters.ts` (FR-098)
- [X] T138 [US6] Implementar a tradução de filtros para as consultas agregadas em `src/modules/analytics/infra/filter-builder.ts`
  - ✓ `schoolId` do cliente é **filtro dentro** de `allowedSchoolIds`, nunca autorização
- [X] T139 [US6] Implementar o componente de filtros em `src/components/data/filter-bar.tsx`
  - ✓ filtros ativos legíveis e removíveis (FR-100)
- [X] T140 [US6] Propagar os filtros a todos os indicadores, rankings, gráficos e listas em `src/modules/analytics/application/apply-filters.ts` (FR-099)
- [X] T141 [US6] Implementar o estado vazio de filtro sem resultados em `src/components/data/empty-state.tsx` (FR-099)
  - ✓ informa ausência de registros; **não exibe indicadores zerados**
- [X] T142 [US6] Teste de integração dos filtros em `tests/integration/filters.test.ts`
  - ✓ filtro `Avaliado = Não` lista os não avaliados e não apresenta percentual de desempenho para eles

---

## FASE 14 — RELATÓRIOS E EXPORTAÇÕES

**Propósito**: **US7 (P3)**.

- [ ] T143 [P] [US7] Implementar o relatório geral em `src/modules/reports/application/general-report.ts` (FR-102)
- [ ] T144 [P] [US7] Implementar o relatório por escola em `src/modules/reports/application/school-report.ts`
- [ ] T145 [P] [US7] Implementar o relatório por turma em `src/modules/reports/application/class-report.ts`
- [ ] T146 [P] [US7] Implementar o relatório por habilidade em `src/modules/reports/application/skill-report.ts`
- [ ] T147 [P] [US7] Implementar o relatório individual em `src/modules/reports/application/student-report.ts`
- [ ] T148 [US7] Implementar o cabeçalho comum de relatório em `src/modules/reports/domain/report-header.ts`
  - ✓ avaliação, escola, filtros, versão de `AnalyticalSettings`, data/hora e solicitante (FR-106, FR-166)
- [ ] T149 [US7] Implementar a exportação CSV em `src/app/api/reports/[tipo]/csv/route.ts`
  - ✓ gerada no servidor; acentos e separador decimal pt-BR corretos (FR-108)
- [ ] T150 [US7] Implementar a exportação XLSX em `src/app/api/reports/[tipo]/xlsx/route.ts`
- [ ] T151 [US7] Implementar a rota de impressão em `src/app/relatorios/[tipo]/imprimir/page.tsx`
  - ✓ folha `@media print`; sem dependência de serviço externo (R-009)
- [ ] T152 [US7] Aplicar filtros e escopo a todas as exportações em `src/modules/reports/application/report-scope.ts` (FR-104)
- [ ] T153 [US7] Aplicar a permissão de dados nominais aos relatórios em `src/modules/reports/application/nominal-authorization.ts` (FR-105)
  - ✓ usuário sem `canAccessNominalData` recebe **versão agregada**, nunca negação (FR-007a); a supressão ocorre na consulta, não na renderização
- [ ] T154 [US7] Teste de integração de coerência tela × exportação em `tests/integration/reports.test.ts`
  - ✓ valores idênticos, mesmo arredondamento (FR-107)

---

## FASE 15 — CONFIGURAÇÕES E AUDITORIA

**Propósito**: **US8 e US9 (P3)**.

- [X] T155 [US8] Implementar a criação de nova versão de `AnalyticalSettings` em `src/modules/settings/application/create-version.ts`
  - ✓ nunca faz `UPDATE`; sempre insere versão nova (FR-163)
- [X] T156 [US8] Implementar a tela de configuração dos critérios em `src/app/(app)/configuracoes/page.tsx`
  - ✓ faixas e definição de baixo rendimento editáveis (FR-109, FR-110)
- [X] T157 [US8] Implementar a consulta do histórico de versões em `src/app/(app)/configuracoes/historico/page.tsx` (FR-165)
- [X] T158 [US8] Verificar que alterar faixas recalcula a leitura analítica sem tocar em valor original nem em `LearningLevel` (FR-113, FR-164)
  - ✓ teste compara o dump integral de resultados antes e depois — deve ser idêntico
- [X] T159 [P] [US9] Implementar o repositório de `AuditLog` em `src/modules/audit/infra/audit-repository.ts`
  - ✓ referencia por identificador; **sem campo de nome**; sem rota de alteração ou remoção (FR-120)
- [X] T160 [US9] Gravar `AuditLog` na mesma transação de toda mutação sensível (FR-117)
- [X] T161 [US9] Implementar a tela de auditoria (ADMIN) em `src/app/(app)/auditoria/page.tsx`
- [X] T162 [US9] Implementar o reprocessamento de indicadores em `src/modules/results/application/reprocess.ts`
  - ✓ recalcula derivados a partir de `acertos` e `itens` armazenados; não altera nenhum valor original (FR-119)

---

## FASE 16 — SEGURANÇA E LGPD

**Propósito**: passagem de auditoria sobre o que a Fase 2 implementou. Fecha a **US3**.

- [ ] T163 [US3] Revisar toda entrada de servidor contra as cinco regras de [contracts/http-api.md](contracts/http-api.md), atualizando `tests/integration/authorization.test.ts`
  - ✓ cada entrada tem linha na matriz de autorização de T032
- [ ] T164 [US3] Auditar o isolamento por escola em telas, filtros, buscas, contagens e mensagens de erro, em `tests/integration/school-isolation.test.ts`
  - ✓ nenhuma revela existência de escola não autorizada; 404, nunca 403 (SC-009)
- [X] T165 [US3] Auditar ausência de PII em logs de aplicação e em `AuditLog`
  - ✓ varredura automatizada de campos nominais em `tests/integration/pii-guard.test.ts` (FR-009)
- [ ] T166 [US3] Auditar o acesso a relatórios nominais nos cinco tipos em `tests/integration/nominal-reports.test.ts` (FR-105)
- [X] T167 [US1] Endurecer a validação de upload em `src/app/api/imports/route.ts`
  - ✓ extensão, MIME, assinatura de conteúdo e limite de tamanho; arquivo fora do padrão rejeitado antes de qualquer parsing
- [X] T168 [US1] Restringir permissões do diretório `IMPORT_STORAGE_DIR`
  - ✓ mesmas restrições de acesso do banco (R-006)
- [X] T195 Implementar a expiração automática do arquivo original em `src/modules/imports/application/purge-expired-files.ts` (FR-038a a FR-038c)
  - ✓ prazo configurável por `IMPORT_FILE_RETENTION_DAYS` (padrão 90); exclui o arquivo, zera `storagePath`, grava `filePurgedAt`; hash, contagens e auditoria permanecem
- [X] T196 Implementar a exclusão antecipada do arquivo pelo Administrador em `src/modules/imports/application/purge-file.ts` (FR-038c)
  - ✓ ação registrada em auditoria; os resultados já importados não são afetados
- [X] T169 Documentar a política de retenção do arquivo original em `README.md` (FR-038a a FR-038c)
  - ✓ prazo padrão, variável de configuração e o que permanece após a exclusão; registra que os 90 dias são padrão técnico, não parecer jurídico
- [X] T170 [US3] Teste E2E de tentativa de escalada de privilégio em `tests/e2e/privilege-escalation.spec.ts`
  - ✓ manipulação de URL e de parâmetro por usuário ESCOLA não alcança dado de outra escola

---

## FASE 17 — TESTES

**Propósito**: consolidar a suíte e instalar os portões.

- [X] T171 Gerar a fixture anonimizada em `tests/fixtures/resultados-referencia.csv`
  - ✓ nomes sintéticos, **todos os valores numéricos preservados**; mantém o caso de nome repetido em duas turmas; o arquivo real **não** entra no repositório (R-012)
- [X] T172 [P] Gerar a fixture de nominata em `tests/fixtures/nominata-referencia.csv`
- [X] T173 [P] Gerar as fixtures de casos inválidos em `tests/fixtures/casos-invalidos/`
  - ✓ uma por código do catálogo de 19 inconsistências
- [X] T174 Consolidar os testes unitários de parser e cálculos em `tests/unit/` conforme a tabela de cobertura de [contracts/domain-functions.md](contracts/domain-functions.md)
- [X] T175 Consolidar os testes de integração de importação, autorização e agregações em `tests/integration/`
- [X] T176 Escrever o teste de regressão do Princípio X em `tests/regression/reference-file.test.ts`
  - ✓ 111 / 106 / 5 / 4 / 12; distribuição 96 / 7 / 3; ranking do PRD §38.1 com tolerância de 0,01 p.p.
- [X] T177 Verificar a integridade da fixture por SHA-256 do conteúdo numérico em `tests/regression/fixture-integrity.test.ts`
  - ✓ alteração acidental dos números é detectada
- [X] T178 Escrever os testes E2E dos sete cenários do [quickstart](quickstart.md) em `tests/e2e/`
- [X] T193 Escrever o teste de responsividade em `tests/e2e/responsive.spec.ts` (FR-123, SC — Const. VIII)
  - ✓ percorre dashboard geral, turma, ficha e mapa de calor em 375 px, 768 px e 1280 px sem rolagem horizontal da página
- [X] T194 Escrever o teste da permissão de dados nominais em `tests/integration/nominal-permission.test.ts` (FR-007, FR-007a)
  - ✓ usuário sem a permissão recebe agregado em todas as telas e nos cinco relatórios; a resposta do servidor não contém nome algum
- [X] T179 Configurar o portão de integração em `.github/workflows/ci.yml`
  - ✓ `lint`, `typecheck`, `test`, `test:regression` e `build` bloqueiam a integração em caso de falha (Const. V e X; fecha a lacuna CHK060)
- [X] T180 Verificar a cobertura das funções de domínio em `vitest.config.ts` (limiar por diretório)
  - ✓ as nove funções do contrato com 100% de linhas e ramos

---

## FASE 18 — DOCUMENTAÇÃO E ENTREGA DO MVP

- [X] T181 [P] Escrever o `README.md` com visão geral, instalação e configuração
  - ✓ inclui a nota sobre o registro oficial do SheetJS (R-005), para não ser "corrigida" por engano
- [X] T182 [P] Documentar a preparação do banco, migrations e seed no `README.md`
- [X] T183 [P] Documentar o fluxo de importação passo a passo no `README.md`
- [X] T184 [P] Documentar a execução de testes, E2E, regressão e build no `README.md`
- [X] T185 [P] Documentar em `README.md` a política de dados: o arquivo real não é versionado e a fixture é anonimizada
- [ ] T186 Executar integralmente os sete cenários de `specs/001-painel-analise-leitura/quickstart.md` contra o sistema construído
- [ ] T187 Reavaliar `specs/001-painel-analise-leitura/checklists/pre-implementacao.md` contra o que foi implementado
  - ✓ os sete achados resolvidos ou explicitamente aceitos
- [ ] T188 Fechar as pendências P-1 a P-4 de `specs/001-painel-analise-leitura/research.md` ou registrar a aceitação de cada uma

**Checkpoint**: MVP entregável.

---

## Dependencies & Execution Order

### Ordem das fases

```text
F1 Fundação
 └─► F2 Auth ──► F3 Domínio ──┐
 └─► F4 Parser ───────────────┴─► F5 Importação ──► F6 Analytics
                                                      ├─► F7 Geral ──► F8 Escola
                                                      ├─► F9 Turma ──► F11 Ficha ──► F12 Mapa
                                                      └─► F10 Habilidade
                                        F13 Filtros ──┘
                                        F14 Relatórios (após F13)
                                        F15 Config e Auditoria (após F6)
                                        F16 Segurança (após F5 e F14)
                                        F17 Testes (transversal, consolida ao fim)
                                        F18 Documentação (após F17)
```

**F4 pode correr em paralelo a F2 e F3**: o parser é domínio puro e não toca banco nem sessão. É a maior oportunidade de paralelismo do projeto.

### Dependências por user story

| Story | Prioridade | Depende de | Entregue em |
|---|---|---|---|
| US3 — Acesso restrito | P1 | F1 | F2, auditada em F16 |
| US10 — Cadastro prévio | P1 | F1, F2, T053, T054 | F3 |
| US1 — Importação fiel | P1 | F3, F4 | F5 |
| US2 — Onde estão as fragilidades | P1 | F5 | F6, F7, F8 |
| US4 — Priorizar estudantes | P2 | F6 | F9, F11, F12 |
| US5 — Detalhar habilidade | P2 | F6 | F10 |
| US6 — Filtros | P2 | F7 a F12 | F13 |
| US7 — Relatórios | P3 | F13 | F14 |
| US8 — Critérios analíticos | P3 | F6 | F15 |
| US9 — Histórico e auditoria | P3 | F5 | F15 |

### Bloqueios que não podem ser contornados

- **T009 → T010 → T011/T012**: schema, migration e constraints são estritamente sequenciais.
- **T050/T052/T053/T055 → T071 em diante**: nenhuma tarefa de importação consome função de domínio antes de ela existir e estar testada.
- **T022 → toda consulta com escopo**: o chokepoint de autorização precede qualquer leitura de dado nominal.
- **T044 → T092**: a classificação analítica depende da leitura da configuração vigente.
- **T084 → T121/T122**: a tela da habilidade depende do denominador de referência apurado.

---

## Parallel Opportunities

**Fase 1** — após T002: `T003`, `T004`, `T006`, `T007` em paralelo.

**Fase 4 inteira em paralelo com Fases 2 e 3** — o parser não depende de banco nem de sessão:

```bash
Task: "Implementar parseSkillResult em src/modules/imports/domain/parse-skill-result.ts"
Task: "Implementar normalizeStudentName em src/modules/students/domain/normalize-name.ts"
Task: "Implementar normalizeClassCode em src/modules/classes/domain/normalize-class-code.ts"
Task: "Implementar validateSkillDenominators em src/modules/imports/domain/validate-denominators.ts"
```

**Fase 6** — as cinco funções puras em paralelo:

```bash
Task: "calculateStudentPerformance em src/modules/analytics/domain/student-performance.ts"
Task: "calculateSkillPerformance em src/modules/analytics/domain/skill-performance.ts"
Task: "calculateParticipationRate em src/modules/analytics/domain/participation.ts"
Task: "classifyAnalyticalSkillResult em src/modules/analytics/domain/classify.ts"
Task: "rankSkillsByFragility em src/modules/analytics/domain/rank-skills.ts"
```

**Fase 14** — os cinco relatórios em paralelo (T143 a T147), pois são arquivos distintos sobre agregações já prontas.

**Fase 18** — a documentação em paralelo (T181 a T185).

---

## Implementation Strategy

### Incremento mínimo demonstrável

F1 → F2 → F3 → F4 → F5 → F6 → F7. Nesse ponto o sistema importa o arquivo de referência com fidelidade, protege os dados por perfil e responde à pergunta central — quais habilidades apresentam maior fragilidade. É o menor conjunto que entrega valor real, e cobre as quatro user stories P1.

### Entrega incremental

1. **F1–F3** — fundação, acesso e cadastros. *Valida*: US3 e US10.
2. **F4–F5** — importação fiel. *Valida*: US1, e os números do Princípio X já conferem.
3. **F6–F8** — diagnóstico coletivo. *Valida*: US2. **Ponto natural de demonstração.**
4. **F9–F12** — diagnóstico individual. *Valida*: US4 e US5.
5. **F13–F15** — filtros, relatórios, configuração e auditoria. *Valida*: US6 a US9.
6. **F16–F18** — auditoria de segurança, suíte consolidada e documentação.

### Com equipe paralela

Após a Fase 1, três frentes independentes: **A** faz F2 e F3 (auth e cadastros); **B** faz F4 inteira (parser puro, sem banco); **C** prepara as fixtures da F17 (T171 a T173) e a infraestrutura de teste. As três convergem na Fase 5.

---

## Notes

- `[P]` = arquivos distintos, sem dependência pendente.
- Nenhuma tarefa está concluída sem lint, typecheck, testes e build passando (Const. V). A partir da Fase 5, `test:regression` entra no portão.
- Comprometer após cada tarefa ou grupo lógico.
- **Três regras que valem em toda tarefa**: ausência nunca vira zero; nenhum cálculo parte de percentual; `Nível de aprendizagem` da fonte é intocável.
- As pendências P-1 a P-4 de [research.md](research.md) não bloqueiam a implementação, mas P-1 é exposição de dado pessoal enquanto permanecer aberta.
