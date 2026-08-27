# Quickstart — Validação da Feature

**Feature**: Painel de Análise de Leitura — II Ciclo CNCA (MVP)
**Plano**: [plan.md](plan.md)

Guia de execução e validação. Não contém código de implementação — os cenários abaixo são o que
prova que a feature está correta.

---

## Pré-requisitos

- Node.js 22 LTS
- Docker e Docker Compose (PostgreSQL 16)
- Acesso ao registro do SheetJS para a dependência `xlsx` (ver R-005 da pesquisa)

---

## Preparação do ambiente

```bash
cp .env.example .env
```

```bash
docker compose up -d db
```

```bash
npm install
```

```bash
npm run db:migrate && npm run db:seed
```

O seed cria: o catálogo das 12 habilidades com códigos e descrições do PRD §4, a versão inicial de
`AnalyticalSettings` (60/80, baixo rendimento = Defasagem), um usuário `ADMIN` e uma escola de
demonstração. **Não** cria estudantes nem resultados — esses vêm pela importação.

```bash
npm run dev
```

---

## Comandos do projeto

| Comando | Finalidade |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit`, TypeScript strict |
| `npm run test` | Vitest — unitários e integração |
| `npm run test:regression` | somente o teste de regressão do Princípio X |
| `npm run test:e2e` | Playwright |
| `npm run build` | build de produção |
| `npm run db:migrate` | aplica migrations |
| `npm run db:seed` | popula catálogo e configuração inicial |

O portão de conclusão da constituição (Princípio V) exige os cinco primeiros passando
simultaneamente, mais `test:regression`.

---

## Cenário 1 — Cadastro prévio e código único

Valida FR-168 a FR-174 e a User Story 10.

1. Autentique-se como `ADMIN`.
2. Cadastre uma escola e quatro turmas.
3. Importe a nominata de `tests/fixtures/nominata-referencia.csv` (111 estudantes anonimizados).
4. Exporte a nominata com códigos.

**Esperado**: 111 estudantes cadastrados, cada um com `uniqueCode` distinto; nenhum código repetido;
a exportação traz a coluna de código; dois estudantes de nome idêntico em turmas diferentes aparecem
como cadastros separados, com códigos distintos.

---

## Cenário 2 — Importação fiel do arquivo de referência

Valida a User Story 1 e os números do Princípio X.

1. Crie a avaliação "II Ciclo — Leitura".
2. Inicie a importação: selecione avaliação, escola e envie
   `tests/fixtures/resultados-referencia.csv` (separador `;`, UTF-8 com BOM).
3. Revise o mapeamento de colunas.
4. Abra a pré-visualização.

**Esperado na pré-visualização**:

```text
Registros encontrados:      111
Registros avaliados:        106
Registros não avaliados:      5
Turmas identificadas:         4
Habilidades identificadas:   12
Inconsistências críticas:     0
Alertas:                      1   (nome repetido em turmas diferentes)
```

5. Confirme a importação.

**Esperado após a confirmação**: cada resultado de habilidade guarda valor original, acertos, itens e
percentual; os 5 não avaliados têm habilidades nulas — **não zero**; os denominadores de referência
apurados são 1, 1, 3, 1, 2, 2, 2, 2, 2, 1, 2, 3 para H01 a H12.

---

## Cenário 3 — Dashboard e ranking de fragilidade

Valida a User Story 2 e SC-003.

Abra o dashboard geral da avaliação.

**Esperado**:

| Indicador | Valor |
|---|---|
| Estudantes importados | 111 |
| Avaliados / Não avaliados | 106 / 5 |
| Taxa de participação | 95,50% |
| Adequado / Intermediário / Defasagem | 96 / 7 / 3, sobre 106 |

Ranking de habilidades, ordenação padrão (menor percentual primeiro):

```text
1. H07 ≈ 70,75%     7. H09 ≈ 86,32%
2. H05 ≈ 75,94%     8. H03 ≈ 87,42%
3. H06 ≈ 79,25%     9. H04 ≈ 88,68%
4. H10 ≈ 83,96%    10. H01 ≈ 89,62%
5. H12 ≈ 84,59%    11. H02 ≈ 90,57%
6. H11 ≈ 84,91%    12. H08 ≈ 91,98%
```

Estes valores validam o cálculo. **Não são metas nem pontos de corte.**

Alterne o critério de ordenação para "pontos possíveis não atingidos" e confirme que a ordem muda e
que o critério ativo fica visível.

---

## Cenário 4 — Não avaliados não distorcem nada

Valida FR-059, FR-060 e FR-062 — o cenário que mais justifica o produto.

1. Abra a turma que contém estudantes não avaliados.
2. Localize um estudante com `Avaliado = Não`.

**Esperado**: acertos, itens e percentual exibem ausência de dado, nunca `0`; o estudante aparece em
lista própria, separada, e não entre os de Defasagem; a taxa de participação da turma o inclui; o
percentual geral da turma o exclui.

**Conferência aritmética**: some manualmente os acertos e os itens dos avaliados da turma e compare
com o percentual exibido. Devem coincidir exatamente.

---

## Cenário 5 — Escopo por escola

Valida a User Story 3 e SC-009.

1. Crie um usuário de perfil `ESCOLA` vinculado apenas à Escola A.
2. Autentique-se com ele.
3. Tente, por manipulação direta de URL e de parâmetro, acessar turma, estudante, relatório e
   exportação da Escola B.

**Esperado**: todas as tentativas retornam `404`, nunca `403`; nenhuma contagem agregada da Escola B
é revelada; nenhuma mensagem de erro confirma a existência da Escola B; a configuração de critérios
analíticos e a gestão de usuários são inacessíveis.

---

## Cenário 6 — Critérios analíticos e imutabilidade do dado

Valida FR-113, FR-162 a FR-167 e SC-011.

1. Registre os valores de acertos e itens de uma turma.
2. Como `ADMIN`, altere o limite de Fragilidade de 60% para 70%.
3. Volte à turma.

**Esperado**: a quantidade de habilidades em Fragilidade muda; acertos, itens, percentuais e
`Nível de aprendizagem` permanecem **idênticos**; a alteração consta em auditoria com valor anterior
e novo; um relatório gerado agora declara a nova versão das faixas.

---

## Cenário 7 — Reimportação bloqueada

Valida FR-148 e FR-153.

Tente importar novamente o mesmo arquivo para a mesma avaliação e escola.

**Esperado**: todas as 111 linhas geram `ERROR` de chave já existente; a confirmação é impossível; a
mensagem indica que a importação anterior precisa ser excluída. Exclua-a como `ADMIN` e repita — a
importação passa, e a exclusão consta em auditoria.

---

## Teste de regressão do Princípio X

```bash
npm run test:regression
```

Executa a cadeia completa — parsing, normalização, cálculo e agregação — sobre
`tests/fixtures/resultados-referencia.csv` e falha se qualquer um destes divergir: 111 / 106 / 5 /
4 / 12; distribuição 96 / 7 / 3; ranking do PRD §38.1 com tolerância de 0,01 ponto percentual.

Este teste é portão de integração: nenhuma alteração em regra de domínio pode ser mesclada com ele
falhando.

**Sobre a fixture**: é uma versão anonimizada do arquivo real — nomes substituídos, **todos os
valores numéricos preservados**. O arquivo original contém nome completo de 111 crianças e não é
versionado, por decisão registrada em R-012 da pesquisa. Para conferir contra o arquivo real, aponte
`REFERENCE_FILE_PATH` para ele fora do repositório e execute
`npm run test:regression -- --run real-file`.
