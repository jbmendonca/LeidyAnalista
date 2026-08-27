<!--
SYNC IMPACT REPORT
==================
Versão: (template não preenchido) → 1.0.0
Tipo de bump: MAJOR inicial — primeira ratificação da constituição do projeto.

Princípios definidos (10, conforme entrada explícita do usuário; o template trazia 5 slots):
  - [NOVO] I.    Fidelidade aos Dados (NÃO NEGOCIÁVEL)
  - [NOVO] II.   Cálculos Pedagógicos Baseados em Itens
  - [NOVO] III.  Primazia da Classificação Oficial
  - [NOVO] IV.   Segurança, Privacidade e LGPD
  - [NOVO] V.    Qualidade de Código e Portões de Conclusão
  - [NOVO] VI.   Arquitetura em Camadas e Simplicidade
  - [NOVO] VII.  Importação Explícita e Sem Correções Silenciosas
  - [NOVO] VIII. Usabilidade Pedagógica em pt-BR
  - [NOVO] IX.   Disciplina de Escopo
  - [NOVO] X.    Teste de Referência como Regressão (NÃO NEGOCIÁVEL)

Seções adicionadas:
  - Padrões Técnicos e Parametrização (substitui [SECTION_2_NAME])
  - Fluxo de Desenvolvimento e Portões de Qualidade (substitui [SECTION_3_NAME])

Seções removidas: nenhuma (todos os placeholders do template foram preenchidos).

Templates dependentes:
  - OK  .specify/templates/plan-template.md — "Constitution Check" usa marcador genérico
        "[Gates determined based on constitution file]"; permanece compatível, os portões
        serão derivados desta constituição em cada execução de /speckit-plan.
  - OK  .specify/templates/spec-template.md — estrutura (User Scenarios, Requirements,
        Success Criteria, Assumptions) compatível; nenhuma seção obrigatória adicionada
        ou removida por esta constituição.
  - OK  .specify/templates/tasks-template.md — as fases previstas comportam as categorias
        exigidas (Setup, Foundational, por User Story, Polish); testes de parser, testes de
        cálculo e o teste de referência do Princípio X entram como tarefas de Foundational
        e Polish.
  - OK  .claude/skills/speckit-* — comandos usam referências genéricas de agente; nenhuma
        referência desatualizada encontrada.
  - PENDENTE  README.md / docs/quickstart.md — inexistentes neste repositório; criar quando
        o projeto for inicializado e referenciar esta constituição.

Itens adiados (deferred): nenhum. O TODO(STACK_DEFINITIVO) da v1.0.0 foi resolvido na
emenda 1.1.0.

--- EMENDA 1.0.0 → 1.1.0 (2026-08-27) ---
Tipo de bump: MINOR — orientação materialmente expandida; nenhum princípio alterado,
renomeado ou removido.
Origem: /speckit-plan, com a stack determinada pelo usuário.
Alterações, todas na seção "Padrões Técnicos e Parametrização":
  - [RESOLVIDO] TODO(STACK_DEFINITIVO) → stack registrada (Next.js App Router, React,
    PostgreSQL + Prisma, Zod, Tailwind + shadcn/ui, Vitest, React Testing Library,
    Playwright; monolito modular sem microserviços, Redis, filas ou busca dedicada).
  - [NOVO] Representação numérica: inteiros como fonte de verdade, proibição de ponto
    flutuante em cálculo, decimal exato para percentuais persistidos. Explicita o
    Princípio II sem alterá-lo.
  - [NOVO] Acessibilidade: WCAG 2.1 nível AA como critério de contraste. Resolve a
    lacuna CHK047 do checklist de pré-implementação, que apontava a exigência de "não
    só cor" sem nenhum limiar objetivo.
Templates dependentes: nenhuma alteração necessária — a emenda não cria nem remove
seção obrigatória, e o "Constitution Check" do plan-template continua derivando os
portões desta constituição.

Validação de dados de referência: os números do Princípio X foram conferidos em 2026-08-27
contra o arquivo real "HABILIDADES_DESEMPENHO_ESTUDANTE 26-08-2026 4-25-38.csv" presente no
repositório: 111 registros, 22 colunas, 106 avaliados, 5 não avaliados, 4 turmas,
Adequado 96 / Intermediário 7 / Defasagem 3. Todos conferem.
-->

# Constituição do Painel de Análise de Leitura — CNCA

Esta constituição governa o desenvolvimento do Sistema Web de Análise e Consolidação das
Avaliações de Leitura do II Ciclo do Compromisso Nacional Criança Alfabetizada.

Neste documento, **DEVE** / **NÃO DEVE** indicam regras inegociáveis; **PODE** indica
faculdade sujeita a justificativa registrada.

## Core Principles

### I. Fidelidade aos Dados (NÃO NEGOCIÁVEL)

O dado importado é evidência de avaliação. Ele **NÃO DEVE** ser alterado silenciosamente
em nenhuma etapa do sistema.

- O valor original de cada habilidade, exatamente como recebido (por exemplo `"2 / 3"`),
  **DEVE** ser persistido.
- Para cada resultado de habilidade, o sistema **DEVE** armazenar em campos separados:
  valor original, quantidade de acertos, quantidade de itens possíveis e percentual
  calculado.
- Valores ausentes **DEVEM** ser persistidos como `NULL`. Converter ausência em `0`
  **É PROIBIDO**, em qualquer camada, inclusive em agregações e exportações.
- Estudantes com `Avaliado = Não` **NÃO DEVEM** compor numeradores nem denominadores de
  qualquer cálculo de desempenho.
- Estudantes com `Avaliado = Não` **DEVEM** compor os indicadores de participação.
- O arquivo original importado e o log de transformação **DEVEM** ser retidos, permitindo
  reprocessamento sem alteração dos valores originais.

**Racional:** o produto se sustenta sobre a confiança do gestor pedagógico no número
exibido. Uma única conversão silenciosa de ausência em zero rebaixa artificialmente turmas
inteiras e destrói essa confiança.

### II. Cálculos Pedagógicos Baseados em Itens

Numeradores e denominadores são a fonte de verdade. Percentuais são valores derivados.

- Percentual da habilidade do estudante = `acertos ÷ itens_possíveis × 100`.
- Desempenho geral do estudante = `Σ acertos válidos ÷ Σ itens possíveis válidos × 100`.
- Percentual consolidado de uma habilidade = `Σ acertos ÷ Σ itens possíveis`, restrito aos
  estudantes avaliados, `× 100`.
- A média simples dos percentuais de H01 a H12 **NÃO DEVE** ser usada como indicador
  principal em nenhuma tela, relatório ou exportação.
- Cálculos intermediários **NÃO DEVEM** ser arredondados. O arredondamento **DEVE** ocorrer
  apenas na camada de apresentação.
- Toda agregação **DEVE** transportar seus numeradores e denominadores, de modo que
  qualquer percentual exibido seja auditável até as somas que o originaram.

**Racional:** as habilidades têm 1, 2 ou 3 itens. Média de percentuais atribui peso igual a
habilidades de peso desigual e produz um número que não corresponde ao desempenho real.

### III. Primazia da Classificação Oficial

O campo `Nível de aprendizagem` recebido da fonte é informação oficial da avaliação.

- As categorias oficiais são `Adequado`, `Intermediário` e `Defasagem`; `-` combinado com
  `Avaliado = Não` representa não avaliado.
- O sistema **NÃO DEVE** inventar pontos de corte para reproduzir ou recalcular essas
  categorias.
- Substituir a classificação da fonte por classificação calculada **É PROIBIDO**, ainda que
  a classificação da fonte pareça inconsistente com o percentual apurado. Divergências
  **DEVEM** ser exibidas, nunca resolvidas automaticamente.
- Categorias internas do sistema — `Fragilidade`, `Atenção`, `Satisfatório`, `Abaixo do
  adequado`, Índice de Prioridade Pedagógica — são **exclusivamente analíticas**,
  configuráveis, e **DEVEM** ser rotuladas na interface como critério analítico do sistema.
- Categorias analíticas **DEVEM** ser visual e conceitualmente distintas do
  `Nível de aprendizagem`: paleta, rótulo e posicionamento diferentes, sem ambiguidade.

**Racional:** o sistema apoia a leitura da avaliação oficial; não é autoridade avaliativa.
Misturar as duas classificações produz decisões pedagógicas sobre um dado que a rede não
reconhece.

### IV. Segurança, Privacidade e LGPD

Dados nominais de estudantes são dados pessoais de acesso restrito.

- Autenticação e autorização **DEVEM** existir antes de qualquer acesso a dados nominais.
- O princípio do menor privilégio **DEVE** ser aplicado em todos os perfis.
- Perfis mínimos: **Administrador**, **Gestor/Analista** e **Escola**.
- O perfil Escola **DEVE** acessar exclusivamente dados da própria escola; o escopo por
  escola **DEVE** ser aplicado na camada de dados, não apenas na interface.
- Relatórios nominais **DEVEM** exigir autorização compatível com o perfil.
- Logs **NÃO DEVEM** registrar dados pessoais além do estritamente necessário; identificação
  por chave interna é preferível a nome de estudante.
- Importação, exclusão, alteração de parâmetros analíticos e reprocessamento **DEVEM**
  gerar registro de auditoria com autor, data/hora e escopo afetado.

**Racional:** desempenho de leitura associado a nome de criança é dado sensível na prática.
Vazamento ou acesso indevido é dano irreversível e responsabilidade legal da rede.

### V. Qualidade de Código e Portões de Conclusão

- TypeScript **DEVE** operar em modo `strict`.
- O uso de `any` **DEVE** ser evitado. Quando indispensável, **DEVE** vir acompanhado de
  comentário no código justificando a necessidade.
- Toda entrada externa — arquivo importado, requisição, parâmetro de configuração —
  **DEVE** ser validada antes do uso.
- Regras de domínio **NÃO DEVEM** residir em componentes visuais.
- Funções de cálculo **DEVEM** ser puras sempre que possível: sem I/O, sem estado global,
  determinísticas.
- O parser de planilhas **DEVE** possuir testes extensivos, cobrindo formatos válidos,
  células vazias, denominadores divergentes e entradas malformadas.
- Cálculos pedagógicos **DEVEM** possuir testes unitários e testes de regressão.
- Uma implementação **SOMENTE** pode ser declarada concluída quando, simultaneamente:
  lint passando, typecheck passando, testes unitários passando, testes de integração
  passando e build de produção funcionando.

**Racional:** o valor do produto é a exatidão aritmética. Erro de cálculo aqui não gera
exceção visível — gera um número plausível e errado, que só é descoberto quando já orientou
decisão pedagógica.

### VI. Arquitetura em Camadas e Simplicidade

- As camadas **domínio**, **aplicação**, **infraestrutura**, **persistência** e
  **interface** **DEVEM** ser separadas de forma explícita e verificável na estrutura de
  diretórios.
- Regras pedagógicas **NÃO DEVEM** ser implementadas dentro de componentes React.
- Parser e cálculos **DEVEM** ser executáveis independentemente da interface, comprovado
  por testes que os exercitam sem renderizar componente algum.
- Abstrações prematuras **DEVEM** ser evitadas. Código simples, legível, testável e
  evolutivo tem precedência sobre generalidade especulativa.
- Microserviços **NÃO DEVEM** ser introduzidos sem necessidade demonstrada.
- Infraestrutura desnecessária ao MVP **NÃO DEVE** ser introduzida.

**Racional:** o domínio é pequeno e estável; a complexidade real está na exatidão, não na
distribuição. Isolar domínio da interface é o que torna os cálculos testáveis e o que
permite trocar a apresentação sem risco aritmético.

### VII. Importação Explícita e Sem Correções Silenciosas

- Os formatos **CSV**, **XLSX** e **XLS** **DEVEM** ser suportados.
- O CSV real utiliza separador `;` e codificação UTF-8 com BOM. O BOM **DEVE** ser detectado
  e removido; a detecção de separador e codificação **NÃO DEVE** ser fixada apenas nesse
  caso.
- Cabeçalhos **DEVEM** ser normalizados para o mapeamento de colunas, tolerando variações
  como `H 01` e `H01`.
- `Código da Turma` **DEVE** ser normalizado removendo espaços nas extremidades.
- O nome original do estudante **DEVE** ser preservado. Uma versão normalizada do nome
  **PODE** ser derivada, exclusivamente para pesquisa e detecção de duplicidade, e **NÃO
  DEVE** ser exibida no lugar do nome original.
- Estudantes de mesmo nome em turmas diferentes **NÃO DEVEM** ser unificados
  automaticamente.
- Inconsistências **NÃO DEVEM** ser corrigidas silenciosamente. Cada uma **DEVE** produzir
  `ERROR` ou `WARNING`:
  - `ERROR` impede a confirmação da importação;
  - `WARNING` permite confirmação consciente pelo usuário.
- A pré-visualização anterior à confirmação **DEVE** exibir os `ERROR` e `WARNING` apurados
  antes de qualquer gravação definitiva.

**Racional:** a importação é o único ponto onde dado errado entra no sistema. Uma correção
automática silenciosa converte um problema visível de arquivo em um erro invisível de banco.

### VIII. Usabilidade Pedagógica em pt-BR

- A interface **DEVE** estar integralmente em português do Brasil.
- Datas e números **DEVEM** seguir o padrão pt-BR.
- O layout **DEVE** ser responsivo em desktop, tablet e smartphone.
- Significado **NÃO DEVE** ser transmitido somente por cor; rótulo, ícone ou texto
  **DEVEM** acompanhar toda codificação cromática.
- Dashboards **DEVEM** priorizar interpretação pedagógica; gráficos excedentes ou
  decorativos **DEVEM** ser omitidos.
- Ao abrir uma turma ou avaliação, o usuário **DEVE** identificar rapidamente: habilidades
  mais frágeis, estudantes prioritários, participação e distribuição dos níveis de
  aprendizagem.
- O resultado original (`1 / 2`) **DEVE** ser exibido junto ao percentual derivado (`50%`)
  nas telas de detalhe da habilidade.

**Racional:** o usuário é gestor ou professor sob restrição de tempo. Um painel que exige
interpretação prévia não substitui a planilha — apenas a reveste.

### IX. Disciplina de Escopo

- Apenas o MVP definido no PRD **DEVE** ser desenvolvido inicialmente.
- Funcionalidades das Fases 2, 3 e 4 do roadmap **NÃO DEVEM** ser implementadas antes da
  conclusão do MVP.
- IA generativa **NÃO DEVE** ser adicionada ao produto.
- Planos de aula automáticos **NÃO DEVEM** ser gerados.
- Diagnóstico pedagógico automático além das regras explicitamente definidas **NÃO DEVE**
  ser produzido.
- Funcionalidades ausentes da specification e do PRD **NÃO DEVEM** ser inventadas durante a
  implementação.

**Racional:** o PRD já delimitou o que a rede precisa e o que ela explicitamente recusa.
Escopo adicional consome o orçamento do que foi pedido e amplia a superfície de dado
pessoal exposto.

### X. Teste de Referência como Regressão (NÃO NEGOCIÁVEL)

O arquivo real analisado no PRD **DEVE** integrar a suíte de regressão. Os valores abaixo
foram conferidos em 2026-08-27 contra o arquivo presente no repositório:

| Métrica | Valor esperado |
|---|---:|
| Registros | 111 |
| Avaliados (`Sim`) | 106 |
| Não avaliados (`Não`) | 5 |
| Turmas | 4 |
| Habilidades | 12 |
| Nível `Adequado` (entre avaliados) | 96 |
| Nível `Intermediário` (entre avaliados) | 7 |
| Nível `Defasagem` (entre avaliados) | 3 |

- O ranking de fragilidade consolidado por itens do PRD (§38.1) **DEVE** ser reproduzido
  pelo teste de regressão; ele valida o cálculo, **não** constitui meta nem ponto de corte.
- Neste ciclo o arquivo apresenta 22 itens possíveis por estudante avaliado. O valor `22`
  **NÃO DEVE** ser fixado em código. A quantidade de itens **DEVE** ser derivada dos
  denominadores presentes no arquivo e validada durante a importação.
- Nenhuma alteração em regras de domínio **DEVE** ser integrada com este teste falhando.

**Racional:** é o único ponto de verificação com resposta conhecida de ponta a ponta. Sem
ele, uma regressão aritmética passa despercebida por todos os demais testes.

## Padrões Técnicos e Parametrização

- **Stack decidida** (emenda de 2026-08-27, via `/speckit-plan`): TypeScript em modo `strict` sobre
  Node.js 22 LTS; Next.js com App Router e React na camada de interface; PostgreSQL com Prisma ORM e
  migrations versionadas; Zod para validação de toda entrada externa; Tailwind CSS e shadcn/ui;
  Vitest para testes unitários e de integração, React Testing Library para componentes e Playwright
  para testes de ponta a ponta. Aplicação monolítica modular: microserviços, Redis, filas externas e
  mecanismos de busca dedicados **NÃO DEVEM** ser introduzidos no MVP.
- **Representação numérica:** `acertos` e `itens possíveis` **DEVEM** ser inteiros. Ponto flutuante
  **NÃO DEVE** ser usado como fonte de verdade de nenhum cálculo. Percentuais persistidos **DEVEM**
  usar tipo decimal exato. Agregações **DEVEM** partir de somas de inteiros, nunca de percentuais
  previamente calculados.
- **Acessibilidade:** o critério de contraste é o **WCAG 2.1 nível AA** — 4,5:1 para texto normal e
  3:1 para texto grande e elementos gráficos —, complementando a regra do Princípio VIII de não
  transmitir significado apenas por cor.
- **Parâmetros analíticos configuráveis:** as faixas de fragilidade individual (sugestão
  inicial: `< 60%` Fragilidade, `60%–79,99%` Atenção, `>= 80%` Satisfatório), a definição de
  baixo rendimento por nível e os pesos do Índice de Prioridade Pedagógica **DEVEM** ser
  configuráveis pelo Administrador e persistidos com versionamento. Fixá-los em código
  **É PROIBIDO**.
- **Reprocessamento:** alterar parâmetros analíticos **DEVE** permitir recálculo dos
  indicadores derivados sem qualquer alteração nos valores originais importados.
- **Identificação:** a chave do registro na avaliação **DEVE** dispensar identificador único
  de estudante, ausente na fonte. `Código da Turma` normalizado é o identificador externo da
  turma.
- **Escola:** a fonte não traz coluna de escola; o sistema **DEVE** permitir informá-la antes
  da importação.
- **Transporte e desempenho:** HTTPS obrigatório; dashboards já processados **DEVEM**
  carregar preferencialmente em até 3 segundos em condições normais.

## Fluxo de Desenvolvimento e Portões de Qualidade

1. **Especificação** — toda funcionalidade parte de uma spec derivada do PRD. Requisito
   ausente do PRD **DEVE** ser recusado ou promovido a emenda antes da implementação
   (Princípio IX).
2. **Planejamento** — o `Constitution Check` do plano **DEVE** ser avaliado contra os dez
   princípios antes da Fase 0 e reavaliado após a Fase 1. Violação sem justificativa
   registrada bloqueia o avanço.
3. **Implementação** — regras de domínio em módulos puros e testáveis; a interface consome o
   domínio, nunca o reimplementa.
4. **Portão de conclusão** — lint, typecheck, testes unitários, testes de integração, build
   de produção e teste de referência do Princípio X, todos passando. A ausência de qualquer
   um impede declarar a tarefa concluída (Princípios V e X).
5. **Revisão** — a revisão **DEVE** verificar explicitamente: ausência de conversão de
   `NULL` em zero; ausência de média simples de percentuais como indicador principal;
   ausência de sobrescrita da classificação oficial; escopo por escola aplicado na camada de
   dados; ausência de dado pessoal desnecessário em logs.
6. **Justificativa de complexidade** — desvios dos Princípios VI e IX **DEVEM** ser
   registrados na tabela de Complexity Tracking do plano, com a alternativa mais simples e o
   motivo de sua recusa.

## Governance

Esta constituição tem precedência sobre qualquer outra prática, convenção ou preferência
adotada no projeto. Em conflito entre esta constituição e uma decisão de implementação,
prevalece a constituição.

**Emendas.** Toda emenda **DEVE**: (a) ser registrada neste arquivo; (b) declarar o motivo;
(c) atualizar a versão conforme a política abaixo; (d) atualizar o Sync Impact Report no topo
do arquivo; e (e) propagar as alterações para `plan-template.md`, `spec-template.md` e
`tasks-template.md` quando afetarem seções obrigatórias ou portões de qualidade.

**Versionamento semântico da constituição.**

- **MAJOR** — remoção ou redefinição incompatível de princípio ou regra de governança.
- **MINOR** — novo princípio ou seção, ou expansão material de orientação existente.
- **PATCH** — esclarecimento, correção de redação ou refinamento sem efeito semântico.

**Conformidade.** Toda revisão de código e todo plano de implementação **DEVEM** verificar a
conformidade com estes princípios. Alterações futuras nas regras de domínio **DEVEM**
preservar os Princípios I, II, III e X; alterá-los exige emenda MAJOR com justificativa
pedagógica explícita e revalidação completa do teste de referência.

**Orientação em tempo de execução.** As instruções operacionais do agente residem nos
arquivos de contexto do projeto e nas skills `speckit-*`; elas complementam, mas nunca
sobrepõem, esta constituição.

**Version**: 1.1.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-27
