# Implementation Plan: Painel de Análise de Leitura — II Ciclo CNCA (MVP)

**Branch**: `001-painel-analise-leitura` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-painel-analise-leitura/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Aplicação web para transformar os resultados brutos das avaliações de Leitura do II Ciclo CNCA —
recebidos como `acertos / itens` por habilidade — em diagnóstico pedagógico acionável por avaliação,
escola, turma, habilidade e estudante.

A abordagem técnica gira em torno de uma decisão central: **inteiros são a fonte de verdade**.
`acertos` e `itensPossiveis` são persistidos como `INTEGER`, toda agregação soma inteiros, e a
divisão que produz o percentual acontece uma única vez, com `Decimal`, na borda de apresentação.
Ausência de resultado é `NULL` em toda a extensão do sistema e nunca colapsa em zero. Sobre essa base
se apoiam nove funções de domínio puras, testáveis sem banco e sem interface, que concentram toda a
regra pedagógica.

Aplicação monolítica Next.js (App Router) com PostgreSQL via Prisma, organizada em treze módulos, cada
um separando domínio, aplicação, infraestrutura e interface. Sem microserviços, sem Redis, sem filas,
sem cache materializado — o volume do MVP não os justifica e cada um deles adicionaria uma classe de
bug que o produto não pode pagar.

## Technical Context

**Language/Version**: TypeScript 5.x em modo `strict`, Node.js 22 LTS

**Primary Dependencies**: Next.js (App Router, Server Components, Server Actions e Route Handlers) ·
React 19 · Prisma ORM · Zod · Tailwind CSS · shadcn/ui · TanStack Table + TanStack Virtual · Recharts ·
`csv-parse` + `iconv-lite` · SheetJS (`xlsx`) · `@node-rs/argon2` · `decimal.js`

**Storage**: PostgreSQL 16 com migrations versionadas. Arquivos originais importados em volume de
disco, nomeados pelo SHA-256, caminho registrado no banco.

**Testing**: Vitest (unitários e integração) · React Testing Library (componentes com lógica de
apresentação) · Playwright (end-to-end)

**Target Platform**: navegadores modernos em desktop, tablet e smartphone; servidor Node.js

**Project Type**: aplicação web monolítica, modular por domínio

**Performance Goals**: dashboards já processados em até 3 s em condições normais (RNF-002);
importação de 5.000 registros até dashboard disponível em até 60 s (SC-007)

**Constraints**: sem float como fonte de verdade de cálculo · sem microserviços · sem Redis · sem
filas externas · sem Elasticsearch · sem IA · sem funcionalidades das fases futuras do roadmap ·
interface integralmente em pt-BR · WCAG 2.1 AA

**Scale/Scope**: rede municipal — dezenas de escolas, centenas de turmas, milhares de estudantes por
avaliação; 12 habilidades por ciclo, variável entre ciclos; ~30 telas; 178 requisitos funcionais

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Avaliação contra a constituição v1.0.0. Portão avaliado antes da Fase 0 e reavaliado após a Fase 1.

| Princípio | Como o plano o satisfaz | Antes | Depois |
|---|---|---|---|
| **I — Fidelidade aos Dados** | `valorOriginal`, `acertos`, `itensPossiveis` e `percentual` em colunas separadas; ausência é `NULL` com CHECK constraint no banco; arquivo original retido com hash; sem edição de resultado confirmado | PASS | PASS |
| **II — Cálculo por Itens** | inteiros no banco, `Decimal` no percentual, agregação por `SUM` de inteiros; média simples proibida no contrato das funções de domínio; sem arredondamento intermediário | PASS | PASS |
| **III — Classificação Oficial** | `nivelOriginal` é texto bruto preservado; `LearningLevel` normalizado é campo separado; `classifyAnalyticalSkillResult` proibida por contrato de tocar em `LearningLevel` | PASS | PASS |
| **IV — Segurança e LGPD** | sessão em banco revogável; argon2id; `UserSchool` como única fonte de escopo; chokepoint único de autorização; `404` em vez de `403` fora de escopo; auditoria por id; guarda de PII em log | PASS | PASS |
| **V — Qualidade de Código** | TypeScript strict; Zod em toda entrada externa; domínio puro fora de componentes; portão de conclusão com lint, typecheck, testes, build e regressão | PASS | PASS |
| **VI — Arquitetura e Simplicidade** | monolito modular com quatro camadas por módulo; sem microserviços, Redis, filas ou materialização | PASS | PASS |
| **VII — Importação Explícita** | pipeline de treze passos com estágio; `ERROR` bloqueia, `WARNING` permite; catálogo de 19 códigos de inconsistência; nenhuma correção silenciosa | PASS | PASS |
| **VIII — Usabilidade pt-BR** | pt-BR integral; `Intl.NumberFormat('pt-BR')`; WCAG 2.1 AA adotado; resultado original ao lado do percentual | PASS | PASS |
| **IX — Escopo** | restrições do usuário coincidem com o Fora do Escopo da spec; nenhuma funcionalidade de fase futura no plano | PASS | PASS |
| **X — Teste de Referência** | `npm run test:regression` como portão de integração; fixture com os números exatos; `22` derivado dos dados em `AssessmentSkill.referenceItems` | PASS | PASS |

**Resultado do portão**: aprovado nas duas avaliações, sem violação a justificar.

**Pendência de governança**: a constituição carrega `TODO(STACK_DEFINITIVO)`, que esta entrada
resolve. Emenda registrada — ver *Emenda à Constituição* ao fim deste plano.

## Project Structure

### Documentation (this feature)

```text
specs/001-painel-analise-leitura/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── domain-functions.md
│   └── http-api.md
├── checklists/
│   ├── requirements.md
│   └── pre-implementacao.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/                          # INTERFACE — App Router
│   ├── (public)/entrar/
│   ├── (app)/
│   │   ├── avaliacoes/[assessmentId]/
│   │   ├── escolas/[schoolId]/
│   │   ├── turmas/[classId]/
│   │   ├── habilidades/[skillId]/
│   │   ├── estudantes/[studentId]/
│   │   ├── importacoes/[importId]/
│   │   ├── relatorios/[tipo]/
│   │   ├── configuracoes/
│   │   ├── usuarios/
│   │   └── auditoria/
│   ├── relatorios/[tipo]/imprimir/     # rota de impressão, @media print
│   ├── api/                            # Route Handlers: upload, export, preview
│   └── layout.tsx
│
├── modules/                      # um diretório por módulo, quatro camadas cada
│   ├── auth/
│   ├── users/
│   ├── schools/
│   ├── assessments/
│   ├── classes/
│   ├── students/
│   ├── skills/
│   ├── imports/
│   ├── results/
│   ├── analytics/
│   ├── reports/
│   ├── audit/
│   └── settings/
│       ├── domain/         # funções puras — sem I/O, sem Prisma, sem React
│       ├── application/    # casos de uso, orquestração, transações
│       ├── infra/          # repositórios Prisma, parsers, adaptadores
│       └── schemas/        # Zod, compartilhados servidor/formulário
│
├── components/
│   ├── ui/                       # shadcn/ui
│   ├── charts/                   # Recharts
│   └── data/                     # TanStack Table, mapa de calor
│
├── server/
│   ├── auth-context.ts           # resolve AuthContext a partir da sessão
│   ├── authorization.ts          # resolveAllowedSchoolIds — chokepoint único
│   ├── prisma.ts
│   └── logger.ts                 # serializador com guarda de PII
│
└── lib/
    ├── decimal.ts                # toPercent, formatPercent
    └── format.ts                 # pt-BR

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

tests/
├── unit/                         # domínio puro, sem banco
├── integration/                  # pipeline de importação, autorização, agregações
├── regression/                   # Princípio X
├── e2e/                          # Playwright
└── fixtures/
    ├── resultados-referencia.csv       # anonimizado, números preservados
    ├── nominata-referencia.csv
    └── casos-invalidos/

docker-compose.yml
.env.example
README.md
```

**Structure Decision**: monolito Next.js único, com a separação de camadas exigida pelo Princípio VI
aplicada **dentro de cada módulo** em vez de no topo da árvore. A alternativa de separar
`backend/` e `frontend/` foi descartada: com App Router e Server Actions não há fronteira de rede
entre os dois, e dividir a árvore criaria uma separação física que não corresponde a nenhuma
separação real de execução. A regra que importa — domínio puro fora de componentes — é garantida por
`modules/*/domain/` não importar nada de `react`, `next` ou `@prisma/client`, o que é verificável por
regra de ESLint e não por convenção de pasta.

## Pipeline de Importação

Os treze passos exigidos, com a fronteira transacional explícita.

```text
 1. upload                    POST /api/imports        → Import(UPLOADED), SHA-256, arquivo no volume
 2. leitura                   detecta codificação, remove BOM
 3. identificação do formato  extensão + MIME + assinatura de conteúdo
 4. normalização cabeçalhos   "H 01" | "H01" | "H_01" | "H 01 (2EF08_P)" → skillId
 5. mapeamento                proposto pelo sistema, revisável pelo usuário
 6. parsing                   parseSkillResult por célula → ImportRow
 7. validações estruturais    colunas, tipos, formato          ┐
 8. validações pedagógicas    denominadores, avaliado×nível,   ├→ ImportIssue
                              colisão de chave, vínculo        ┘
 9. pré-visualização          GET /api/imports/:id/preview     → Import(READY)
                              ── NENHUMA ESCRITA EM RESULTADO ATÉ AQUI ──
10. confirmação               confirmImport                    → Import(PROCESSING)
11. transação  ┐
12. persistência├─ uma única transação: ImportRow → AssessmentStudentResult + StudentSkillResult,
13. cálculo    ┘  recalcula AssessmentSkill.referenceItems, grava AuditLog → Import(COMPLETED)

    dashboard                 agregações sob demanda, sem materialização
```

Os passos 11 a 13 são indivisíveis. Falha em qualquer ponto reverte tudo e leva a `FAILED`, sem
estado parcial. O estágio `ImportRow` garante que **o conjunto exibido na pré-visualização é
exatamente o conjunto gravado** — não há reprocessamento entre aprovar e persistir.

## Estratégia de Testes

| Camada | Ferramenta | Alvo |
|---|---|---|
| Unitário | Vitest | as nove funções de domínio, tabela de casos do contrato |
| Integração | Vitest + PostgreSQL efêmero | pipeline de importação ponta a ponta, transacionalidade, agregações SQL |
| Autorização | Vitest | matriz papel × recurso; toda rota nova exige entrada, ou a suíte falha |
| Regressão | Vitest | Princípio X sobre a fixture anonimizada |
| Componente | React Testing Library | mapa de calor, tabelas, formatação pt-BR, ausência vs. zero |
| E2E | Playwright | os sete cenários do [quickstart](quickstart.md) |

A guarda de autorização merece destaque: é uma tabela que enumera cada entrada da superfície de
servidor e executa cada uma com um usuário `ESCOLA` de outra escola, exigindo resultado vazio ou
`404`. Uma rota nova sem entrada nessa tabela quebra a suíte — é a forma de impedir que o escopo por
escola seja esquecido em uma rota entre trinta.

## Decisões que precisam de confirmação

Nenhuma bloqueia o início da implementação; todas alteram entregáveis. Detalhamento em
[research.md](research.md).

| # | Assunto | Situação |
|---|---|---|
| P-1 | Prazo de retenção do arquivo original com dados nominais | **Resolvida** (2026-08-27) — 90 dias configuráveis com exclusão automática; hash e metadados permanecem. Ver R-015. *Padrão técnico, pendente de confirmação pela política de dados da rede.* |
| P-2 | PDF: rota de impressão ou arquivo gerado no servidor | **Aberta** — rota de impressão adotada; Playwright não entra em produção |
| P-3 | Usuário sem permissão nominal: negar ou entregar agregado | **Resolvida** (2026-08-27) — permissão específica por usuário com **versão agregada**. Ver R-014 |
| P-4 | Redação de FR-034 quanto ao uso do nome normalizado | **Resolvida** (2026-08-27) — FR-034 reescrito com três finalidades explícitas |

Restam apenas P-2, que é decisão de produto sem consequência de dados, e a confirmação do prazo de
90 dias de P-1 pela política de dados da rede — o padrão já está implementado e reduz a exposição de
indefinida para três meses.

## Emenda à Constituição

Esta entrada resolve o `TODO(STACK_DEFINITIVO)` deixado em aberto na constituição v1.0.0. A seção
*Padrões Técnicos e Parametrização* passa a registrar a stack decidida, e a versão vai para **1.1.0**
(MINOR — orientação materialmente expandida, nenhum princípio alterado). Duas decisões desta fase
também entram como padrão: **WCAG 2.1 AA** como critério de contraste, resolvendo a lacuna CHK047, e
a proibição de ponto flutuante como fonte de verdade de cálculo, que explicita o Princípio II.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Nenhuma violação a justificar — o portão foi aprovado nas duas avaliações.

Duas adições ao mínimo especificado pelo usuário, registradas por transparência e não por serem
violações:

| Adição | Motivo | Alternativa rejeitada porque |
|---|---|---|
| `ImportRow` (estágio) | garante que o conjunto aprovado na pré-visualização é o gravado, e evita reprocessar o arquivo na confirmação | reprocessar na confirmação faria o usuário aprovar uma leitura e o sistema gravar outra |
| `Session` (tabela) | sessão em banco é revogável de imediato, exigência do acesso a dados nominais | JWT não é revogável no servidor, e Credentials + sessão em banco não é suportado pelo Auth.js |
