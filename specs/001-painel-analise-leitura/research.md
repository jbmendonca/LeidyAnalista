# Phase 0 — Pesquisa Técnica

**Feature**: Painel de Análise de Leitura — II Ciclo CNCA (MVP)
**Data**: 2026-08-27
**Plano**: [plan.md](plan.md)

A stack foi determinada pela entrada do usuário em `/speckit-plan`. Este documento registra as
decisões que a stack **não** resolve sozinha — aquelas em que havia mais de um caminho viável e a
escolha tem consequência sobre fidelidade do dado, segurança ou simplicidade.

---

## R-001 — Representação numérica: nunca float como fonte de verdade

**Decisão**: `acertos` e `itensPossiveis` são `INTEGER` no banco. `percentual` é persistido como
`NUMERIC(7,4)` (Prisma `Decimal`), nunca `DOUBLE PRECISION`. Toda agregação recalcula a partir das
somas de inteiros; nenhum indicador é derivado de percentual armazenado.

**Racional**: o Princípio II da constituição exige que numerador e denominador sejam a fonte de
verdade. Somar percentuais em ponto flutuante introduz erro que se acumula com o número de
estudantes e produz divergência entre a tela e a conferência manual — exatamente o modo de falha
silencioso que o produto existe para evitar. Inteiros somam exatamente; a única operação inexata é a
divisão final, que ocorre uma vez, sobre somas já fechadas.

**Como se aplica na prática**: as funções de domínio retornam a fração (`{ acertos, itens }`) e não o
percentual. A conversão para percentual usa `Decimal` e ocorre na borda de apresentação. Não há
arredondamento intermediário em lugar algum.

**Alternativas consideradas**:
- `FLOAT`/`DOUBLE` para percentual — rejeitado: `0.1 + 0.2 !== 0.3` deixa de ser curiosidade quando
  o número orienta decisão pedagógica.
- Não persistir percentual — rejeitado: FR-030 exige a persistência dos quatro campos. Persistir em
  `NUMERIC` atende sem abrir mão da exatidão.

---

## R-002 — Autenticação de sessão com credenciais

**Decisão**: implementação própria e mínima — tabela `Session` no PostgreSQL, cookie `httpOnly`,
`Secure`, `SameSite=Lax`, com identificador opaco de alta entropia. Senhas com **argon2id**
(`@node-rs/argon2`). Sem biblioteca de autenticação de terceiros.

**Racional**: o requisito é sessão em banco com credenciais próprias. O Auth.js (NextAuth) não
suporta a combinação de *Credentials provider* com `strategy: "database"` — usar Credentials força
sessão em JWT, que contraria o requisito e dificulta a revogação imediata exigida pelo controle de
acesso a dados nominais. Adaptar a biblioteca para contornar isso produziria mais código
não-idiomático do que a implementação direta, que cabe em poucas dezenas de linhas auditáveis.

**Escopo do que se implementa**: criação e destruição de sessão, rotação na autenticação, expiração
absoluta e por inatividade, verificação de senha. Nada de recuperação de senha por e-mail no MVP —
a redefinição é feita pelo Administrador.

**Alternativas consideradas**:
- Auth.js v5 + Credentials + JWT — rejeitado: sessão não revogável no servidor.
- Auth.js v5 + Provider OAuth — rejeitado: não há provedor de identidade na rede.
- `iron-session` (sessão cifrada em cookie) — rejeitado pelo mesmo motivo do JWT.

---

## R-003 — Onde vive a autorização por escola

**Decisão**: ponto único de estrangulamento na camada de aplicação. Nenhuma função de leitura ou
escrita recebe `schoolId` do cliente sem passar por `resolveAllowedSchoolIds(authContext)`, que
deriva do banco as escolas às quais o usuário está vinculado. Toda consulta que toca dado nominal é
construída a partir desse conjunto, nunca de parâmetro de requisição.

**Racional**: o Princípio IV exige o escopo aplicado na camada de dados, não na interface. Um
chokepoint único é verificável por revisão e por teste automatizado; regras espalhadas por rotas não
são. O `schoolId` enviado pelo cliente é tratado como *filtro*, jamais como *autorização*: ele só
restringe dentro do conjunto permitido, e é rejeitado se estiver fora dele.

**Guarda automatizada**: teste de integração que, para cada rota e cada ação de servidor, executa a
mesma chamada com um usuário `ESCOLA` de outra escola e exige resultado vazio ou negado. Uma rota
nova sem entrada nesse teste falha a suíte.

**Alternativas consideradas**:
- Row Level Security do PostgreSQL — tecnicamente superior, e é o caminho natural de evolução.
  Adiado: exige propagar a identidade do usuário para a conexão, o que conflita com o pool de
  conexões do Prisma e adiciona infraestrutura que o Princípio VI pede evitar no MVP. Registrado
  como evolução, não como descarte.
- Verificação em cada rota — rejeitado: é a forma mais comum de esquecer uma.

---

## R-004 — Leitura de CSV

**Decisão**: `csv-parse` para o parsing, `iconv-lite` para codificações não-UTF-8, remoção manual do
BOM antes de qualquer processamento. Detecção de separador por contagem de ocorrências de `;`, `,` e
tabulação na primeira linha não vazia, com sobreposição manual pelo usuário.

**Racional**: `csv-parse` é estável, streaming e trata corretamente aspas e quebras de linha dentro
de campos. O BOM precisa ser removido antes da normalização de cabeçalhos: se sobreviver, o primeiro
nome de coluna vira `﻿Rede` e o mapeamento falha de forma difícil de diagnosticar — foi o que
se observou ao inspecionar o arquivo real.

**Alternativas consideradas**:
- `papaparse` — bom, mas orientado a navegador; a importação é servidor.
- Parsing manual por `split(';')` — rejeitado: quebra em qualquer campo com aspas.

---

## R-005 — Leitura de XLSX e XLS

**Decisão**: SheetJS (`xlsx`), instalado a partir do registro oficial do projeto
(`cdn.sheetjs.com`), com versão fixada e verificação de integridade.

**Racional**: o requisito inclui **XLS** legado (formato BIFF). SheetJS é praticamente a única
biblioteca JavaScript amplamente usada que lê BIFF e OOXML com a mesma API. Concorrentes como
`exceljs` leem apenas XLSX.

**Ponto de atenção de cadeia de suprimentos**: o pacote `xlsx` publicado no npm está congelado numa
versão antiga; o projeto distribui as versões atuais pelo próprio CDN. A instalação deve apontar
para lá e a versão deve ser fixada no `package.json` com integridade verificada — não é o padrão que
a maioria dos times espera, e precisa estar documentado no README para não ser "corrigido" por
engano.

---

## R-006 — Preservação do arquivo original

**Decisão**: o arquivo é gravado em volume de disco configurável (`IMPORT_STORAGE_DIR`), nomeado
pelo seu SHA-256, com o caminho e o hash registrados em `Import`. Não vai para o banco.

**Racional**: FR-038 exige retenção do original. Guardar em `bytea` infla o banco e os backups com
dado que nunca é consultado por query. O hash serve a dois propósitos: nome estável e detecção de
reimportação acidental do mesmo conteúdo.

**Consequência de LGPD**: o arquivo contém nomes de crianças. O diretório precisa das mesmas
restrições de acesso do banco, e o prazo de retenção continua indefinido — ver *Pendências* ao fim
deste documento.

---

## R-007 — Área de estágio da importação

**Decisão**: as linhas interpretadas são gravadas em `ImportRow`, tabela de estágio, junto com
`ImportIssue`. A pré-visualização lê do estágio. A confirmação promove estágio → tabelas finais
dentro de uma única transação e marca o estágio como consumido.

**Racional**: FR-051 proíbe persistir resultado antes da confirmação, e o estágio não viola isso —
`ImportRow` não é resultado de avaliação, é o que o sistema entendeu do arquivo, e ele é descartável.
O ganho é grande: a pré-visualização de milhares de linhas não precisa reprocessar o arquivo a cada
paginação, a confirmação não depende de o arquivo ainda existir, e o conjunto exato que o usuário
aprovou é o conjunto que é gravado — sem risco de divergência entre o que se viu e o que se salvou.

**Alternativas consideradas**:
- Reprocessar o arquivo na confirmação — rejeitado: o usuário aprovaria uma leitura e o sistema
  gravaria outra, ainda que por diferença mínima.
- Manter em memória ou em sessão — rejeitado: não sobrevive a reinício nem a múltiplas instâncias.

---

## R-008 — Agregações e reprocessamento

**Decisão**: dois níveis, com fronteira explícita.

| Nível | Onde vive | Quando muda |
|---|---|---|
| Derivados determinísticos do estudante (`acertosTotais`, `itensTotais`, `percentualGeral`) | persistidos em `AssessmentStudentResult` na transação de importação | só se a importação for reprocessada |
| Agregações de turma, escola, habilidade e avaliação | calculadas sob demanda em SQL (`SUM` sobre inteiros) | a cada consulta |
| Classificação analítica (Fragilidade / Atenção / Satisfatório) | calculada na leitura, a partir de `AnalyticalSettings` vigente | imediatamente ao mudar a configuração |

**Racional**: essa separação torna FR-113 e FR-164 quase triviais — alterar faixas analíticas não
exige reprocessar nada, porque nada analítico está materializado. E elimina a classe de bug mais
comum em painéis: o cache invalidado pela metade. Sem tabela materializada não há invalidação.

**Desempenho**: as agregações são `SUM` sobre índices compostos, em volume de milhares de linhas por
avaliação. Fica muito abaixo dos 3 segundos exigidos pelo RNF-002. Materialização é evolução para
quando o volume justificar, não decisão do MVP.

---

## R-009 — Exportação em PDF

**Decisão**: rota de impressão dedicada por relatório, com folha de estilo `@media print`, e o
usuário gera o PDF pelo próprio navegador. Nenhuma dependência de serviço externo.

**Racional**: atende "gerar relatório próprio para impressão/exportação" sem adicionar runtime de
navegador headless ao ambiente de produção. Playwright já estará no projeto para E2E e pode renderizar
o mesmo endpoint no servidor caso um arquivo gerado pelo servidor venha a ser exigido — o caminho de
evolução existe e não custa nada agora.

**Ponto que precisa de confirmação**: se a expectativa for um arquivo `.pdf` baixado diretamente pelo
botão de exportar, e não "Salvar como PDF" no diálogo de impressão, a decisão muda e o Playwright
passa a ser dependência de produção. Ver *Pendências*.

---

## R-010 — Mapa de calor e acessibilidade

**Decisão**: TanStack Table com virtualização de linhas (TanStack Virtual) acionada acima de 60
estudantes. A marcação permanece uma `<table>` semântica; cada célula expõe o resultado original, o
percentual e a descrição da habilidade em texto acessível, não apenas em cor.

**Contraste**: adotado **WCAG 2.1 nível AA** — 4.5:1 para texto normal, 3:1 para texto grande e para
elementos gráficos. Isso resolve a lacuna CHK047, que apontava exigência de "não só cor" sem nenhum
limiar objetivo.

**Racional**: virtualizar cedo demais quebra Ctrl+F e leitores de tela sem necessidade; uma turma
típica tem menos de 40 estudantes e cabe inteira no DOM. O limiar protege o caso da escola grande sem
penalizar o caso comum. A versão de impressão nunca é virtualizada.

---

## R-011 — Desempate no ranking de habilidades e de turmas

**Decisão**: ordem determinística em três chaves — (1) menor percentual de acerto; (2) maior
quantidade de itens possíveis, que dá precedência à habilidade com mais evidência; (3) código curto
da habilidade em ordem alfabética, como critério final e estável.

**Racional**: resolve a lacuna CHK061. Sem regra explícita, a ordem de empate fica à mercê da ordem
de retorno do banco e muda entre execuções — o gestor vê o ranking mudar sem que nenhum dado tenha
mudado, e perde a confiança na tela. O mesmo critério vale para turmas, com o total de itens da turma
como segunda chave.

---

## R-012 — Fixture do teste de regressão e dados pessoais

**Decisão**: o arquivo de referência **não** entra no repositório. A fixture versionada é uma versão
anonimizada, com nomes substituídos por nomes sintéticos e **todos os valores numéricos preservados
sem alteração** — as 111 linhas, os 12 denominadores, os acertos de cada célula, a coluna `Avaliado`
e a coluna `Nível de aprendizagem`. O caso do nome que se repete em duas turmas é preservado com um
nome sintético repetido, para que o cenário de possível transferência continue exercitável.

**Racional**: este é um problema real e não hipotético. O arquivo de referência contém nome completo
de 111 crianças. Versioná-lo em git o replica para toda máquina de desenvolvimento, todo fork e todo
runner de CI, sem controle de acesso e sem possibilidade prática de remoção — o histórico do git é
imutável na prática. O Princípio IV e a LGPD não admitem isso, e nenhuma conveniência de teste
justifica.

**Como se garante que a fixture continua válida**: como só os nomes mudam, todos os números do
Princípio X são reproduzidos exatamente — 111, 106, 5, 4, 12, a distribuição 96/7/3 e o ranking de
fragilidade do PRD §38.1. Um teste confere o SHA-256 do conteúdo numérico da fixture para detectar
alteração acidental.

**Uso do arquivo real**: permanece fora do repositório, disponível para conferência manual sob as
mesmas restrições de acesso dos demais dados nominais. Um teste opcional, ativado por variável de
ambiente e ignorado por padrão, pode apontar para ele.

---

## R-013 — Tratamento de PII em logs e auditoria

**Decisão**: `AuditLog` referencia entidades por identificador, nunca por nome. Os logs de aplicação
usam um serializador que rejeita campos de uma lista negra (`nome`, `nomeOriginal`, `estudante`) e
falha em desenvolvimento se um deles for passado. O código único do estudante é seguro em log porque
não é derivado de dado pessoal (FR-131).

**Racional**: FR-009 é fácil de escrever e fácil de violar por acidente, com um `console.log` de
depuração que sobrevive à revisão. Uma guarda que falha em desenvolvimento converte a regra em algo
que o próprio ambiente cobra.

---

## Pendências que exigem decisão do usuário

Nenhuma bloqueia o início da implementação, mas todas alteram entregáveis e devem ser resolvidas
antes das tarefas correspondentes.

| # | Assunto | Origem | Situação |
|---|---|---|---|
| P-1 | Retenção do arquivo original com dados nominais | CHK055 | **Resolvida em 2026-08-27** — 90 dias configuráveis, com exclusão automática; hash e metadados permanecem (FR-038a a FR-038c). *Padrão técnico defensável, pendente de confirmação pela política de dados da rede.* |
| P-2 | Exportação em PDF: rota de impressão ou arquivo gerado no servidor | R-009 | **Aberta** — rota de impressão adotada; Playwright fora de produção |
| P-3 | Usuário sem permissão nominal: negação ou versão agregada | CHK040 | **Resolvida em 2026-08-27** — permissão específica por usuário (FR-007) com **versão agregada** para quem não a possui (FR-007a) |
| P-4 | Redação de FR-034 quanto ao nome normalizado | CHK026 | **Resolvida em 2026-08-27** — FR-034 reescrito com três finalidades explícitas, incluindo a vinculação assistida |

---

## R-014 — Permissão de dados nominais como controle próprio *(2026-08-27, pós-análise)*

**Decisão**: `User.canAccessNominalData` é um controle **por usuário**, independente do perfil e do
escopo de escola. Padrão na criação: concedida a ADMIN e ao perfil ESCOLA, negada a ANALISTA.
Ausência da permissão entrega **versão agregada**, nunca negação.

**Racional**: a premissa original derivava a autorização do perfil, o que contrariava duas coisas ao
mesmo tempo — o PRD §30, que pede "permissão específica", e o Princípio IV, que impõe menor
privilégio como MUST. Um analista municipal que trabalha sobre agregados não tem por que carregar o
nome de milhares de crianças no navegador. Entregar o agregado em vez de negar preserva integralmente
a função dele; a permissão restringe o dado, não o trabalho.

**Onde a supressão acontece**: na consulta, não na renderização. A resposta do servidor não carrega
nomes que o solicitante não pode ver. Esconder a coluna no componente seria a permissão de interface
que o Princípio IV proíbe.

**Alternativas consideradas**:
- Derivar do perfil (premissa 12 original) — rejeitada por contrariar o PRD e o menor privilégio.
- Negar a geração — rejeitada: bloqueia trabalho legítimo de análise sem ganho de proteção, já que o
  agregado atende ao mesmo propósito.

---

## R-015 — Retenção do arquivo original *(2026-08-27, pós-análise)*

**Decisão**: o arquivo original é retido por **90 dias configuráveis** após a confirmação e depois
excluído automaticamente. `Import.fileHash`, contagens, autor e data/hora permanecem por prazo
indeterminado.

**Racional**: a retenção indefinida confundia duas necessidades distintas. Conferir uma importação
recente contra a fonte é atividade de semanas, não de anos. Provar **qual** conteúdo foi importado é
permanente — e o SHA-256 já faz isso sem guardar nome algum. Separadas as duas, o arquivo com dados
de 111 crianças deixa de existir três meses depois sem que a auditoria perca nada.

**Limite desta decisão**: 90 dias é um padrão técnico defensável, **não um parecer jurídico**. A rede
deve confirmá-lo à luz da sua política de dados e do prazo de guarda que a Secretaria adote.
