# Feature Specification: Painel de Análise de Leitura — II Ciclo CNCA (MVP)

**Feature Directory**: `specs/001-painel-analise-leitura`

**Feature Branch**: `001-painel-analise-leitura` (repositório ainda não versionado em git)

**Created**: 2026-08-27

**Status**: Draft

**Input**: Descrição fornecida via `/speckit-specify`, tendo como fonte principal de requisitos o PRD
`PRD_Sistema_Analise_Avaliacao_Leitura_CNCA_v2.md` (raiz do repositório) e como governo a
constituição do projeto v1.0.0 (`.specify/memory/constitution.md`).

---

## Contexto e Problema

Os resultados das avaliações de Língua Portuguesa — Leitura do II Ciclo do Compromisso Nacional
Criança Alfabetizada chegam em arquivos tabulares com uma linha por estudante. O arquivo traz o
resultado bruto de cada habilidade no formato `acertos / itens` (por exemplo `2 / 3`) e a
classificação oficial de `Nível de aprendizagem`, mas **não** traz consolidação pedagógica.

Responder às perguntas que orientam a ação pedagógica exige hoje trabalho manual de planilha,
propenso a erro e não reprodutível. O sistema existe para converter o dado bruto em resposta
imediata a oito perguntas:

1. Quais habilidades apresentam maior fragilidade no conjunto analisado?
2. Quais habilidades apresentam maior fragilidade em cada turma?
3. Quais estudantes necessitam de maior atenção?
4. Em quais habilidades cada estudante apresenta dificuldade?
5. Como os níveis Adequado, Intermediário e Defasagem estão distribuídos?
6. Quantos estudantes foram avaliados?
7. Quantos estudantes não foram avaliados?
8. Quais turmas concentram as maiores fragilidades?

O risco central do produto não é indisponibilidade — é **exibir um número plausível e errado**.
Um percentual incorreto não gera erro visível; ele orienta uma decisão pedagógica equivocada e só
é descoberto muito depois. Por isso, fidelidade ao dado e auditabilidade do cálculo têm precedência
sobre qualquer outro atributo desta especificação.

---

## Clarifications

### Session 2026-08-27

- Q: Chave de estudante repetida (mesma avaliação + turma + nome) — qual política? → A: Adotar
  **código único e estável por estudante**, gerado pelo sistema, persistido no cadastro do estudante
  e utilizado na avaliação atual e nas próximas. Ver grupo de requisitos S (Identidade do estudante).
- Q: Como o código único se vincula ao estudante nas avaliações seguintes? → A: Vinculação **por
  código quando a coluna existir no arquivo** (sem intervenção); quando não existir, **vinculação
  assistida** com confirmação humana. Nunca vincular automaticamente por nome. Ver FR-137 a FR-146.
- Q: Colisão de chave (avaliação + turma + nome) dentro da mesma avaliação — qual severidade? → A:
  `ERROR` bloqueante, tanto dentro do mesmo arquivo quanto entre importações da mesma avaliação. O
  sistema nunca funde nem descarta linhas; o arquivo é corrigido na origem. Ver FR-147 a FR-152.
- Q: (derivada) Reimportação do mesmo par avaliação + escola? → A: bloqueada por FR-148; substituir
  exige excluir a importação anterior, com auditoria. Ver FR-153. *(Resolve o marcador aberto
  "Reimportação".)*
- Q: (derivada) Correção pontual de registro já confirmado? → A: não há edição de resultados no
  sistema; a correção é feita no arquivo e reenviada. Ver FR-154. *(Resolve o marcador aberto
  "Correção pontual pós-importação".)*
- Q: Com denominadores divergentes na mesma habilidade, qual `n` usar na exibição e na distribuição?
  → A: **denominador predominante** como referência de apresentação; registros divergentes contam no
  percentual consolidado (Σ/Σ, inalterado) e são listados à parte. Ver FR-155 a FR-161.
- Q: Qual a abrangência dos critérios analíticos configuráveis? → A: **global e versionada** — uma
  configuração única para todo o sistema, com histórico de vigência; sem variação por escola ou por
  avaliação no MVP. Ver FR-162 a FR-167.
- Q: Quando os estudantes passam a existir no sistema? → A: **cadastro prévio na plataforma, antes
  das avaliações**. A base cadastral é a autoridade sobre quem existe e o código único é atribuído no
  cadastro; a importação de resultados reconcilia com essa base em vez de criar estudantes. Ver
  FR-168 a FR-178.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar a planilha real com fidelidade total (Priority: P1)

Como analista educacional, quero enviar o arquivo recebido da avaliação, vincular a uma avaliação e
a uma escola, revisar o que o sistema entendeu do arquivo e só então confirmar, para que os dados
entrem no sistema sem nenhuma alteração silenciosa.

**Why this priority**: nenhuma outra funcionalidade existe sem dado importado. É também o único
ponto por onde dado incorreto entra no sistema; um erro aqui contamina todas as telas.

**Independent Test**: enviar o arquivo de referência e verificar que a pré-visualização informa
111 registros, 106 avaliados, 5 não avaliados, 4 turmas e 12 habilidades, e que após a confirmação
cada resultado de habilidade tem seu valor original, acertos, itens possíveis e percentual
armazenados separadamente.

**Acceptance Scenarios**:

1. **Dado** um arquivo CSV com separador `;` e codificação UTF-8 com BOM, **quando** o usuário o
   envia, **então** o sistema detecta separador e codificação, remove o BOM e preserva integralmente
   os acentos dos nomes exibidos.
2. **Dado** um arquivo cujas colunas de habilidade se chamam `H 01` a `H 12`, **quando** o sistema
   faz o mapeamento, **então** cada coluna é associada à habilidade correspondente do catálogo,
   aceitando também as variações `H01`, `H_01` e `H 01 (2EF08_P)`.
3. **Dado** um resultado de habilidade com o valor `2 / 3`, **quando** o registro é confirmado,
   **então** o sistema persiste `valor original = "2 / 3"`, `acertos = 2`, `itens possíveis = 3` e
   `percentual = 66,666…` (sem arredondamento no armazenamento).
4. **Dado** um registro com `Avaliado = Não` e todas as habilidades vazias, **quando** o registro é
   confirmado, **então** as habilidades são persistidas como ausentes (nulas) e em nenhum momento
   convertidas para zero.
5. **Dado** que o usuário chegou à etapa de pré-visualização, **quando** ele abandona o fluxo sem
   confirmar, **então** nenhum dado de resultado é persistido.
6. **Dado** um arquivo sem coluna de escola, **quando** o usuário inicia a importação, **então** o
   sistema exige a seleção de uma escola antes de permitir a confirmação, e todos os registros do
   arquivo recebem essa escola.

---

### User Story 2 - Ver onde estão as fragilidades (Priority: P1)

Como coordenador pedagógico, quero abrir a avaliação e a turma e identificar imediatamente quais
habilidades tiveram o pior desempenho e como as turmas se comparam, para direcionar a recuperação.

**Why this priority**: é a entrega central do produto — a razão pela qual o painel substitui a
planilha. Sem ela, a importação não produz valor.

**Independent Test**: com o arquivo de referência importado, abrir o dashboard geral e conferir que
o ranking das 12 habilidades reproduz a ordem de fragilidade do PRD §38.1 (H07 como mais frágil,
H08 como melhor desempenho) e que os percentuais batem com o cálculo por itens.

**Acceptance Scenarios**:

1. **Dado** o arquivo de referência importado, **quando** o usuário abre o dashboard geral,
   **então** vê 111 estudantes importados, 106 avaliados, 5 não avaliados e taxa de participação
   de 95,50%.
2. **Dado** o mesmo conjunto, **quando** o usuário consulta a distribuição por nível, **então** vê
   96 Adequado, 7 Intermediário e 3 Defasagem, com percentuais calculados sobre os 106 avaliados —
   nunca sobre os 111 registros.
3. **Dado** o ranking de habilidades, **quando** exibido sem ordenação alternativa selecionada,
   **então** as habilidades aparecem do menor para o maior percentual de acerto, com H07 na primeira
   posição (aproximadamente 70,75%) e H08 na última (aproximadamente 91,98%).
4. **Dado** o ranking de habilidades, **quando** o usuário escolhe ordenar por quantidade de pontos
   possíveis não atingidos, **então** a ordem muda de acordo com esse critério e o critério ativo
   fica visível na tela.
5. **Dado** o dashboard da turma, **quando** aberto, **então** exibe a habilidade mais frágil e a de
   melhor desempenho **daquela turma**, calculadas apenas com os estudantes avaliados da turma.
6. **Dado** que uma turma tem 0 estudantes avaliados, **quando** seus indicadores de desempenho são
   exibidos, **então** o sistema apresenta "sem dados de desempenho" em vez de 0%, e mantém a taxa
   de participação em 0%.

---

### User Story 3 - Acesso restrito aos dados nominais (Priority: P1)

Como administrador, quero que cada usuário acesse apenas o que seu perfil autoriza, e que o perfil
Escola veja exclusivamente a própria escola, para cumprir a LGPD e proteger dados de crianças.

**Why this priority**: os dados são nominais e de menores de idade. A constituição (Princípio IV)
proíbe acesso a dados nominais antes da existência de autenticação e autorização; portanto esta
história é pré-requisito de liberação de qualquer tela que exiba nomes.

**Independent Test**: autenticar com um usuário de perfil Escola vinculado à Escola A e confirmar
que nenhuma tela, filtro, relatório, exportação ou busca retorna qualquer registro da Escola B.

**Acceptance Scenarios**:

1. **Dado** um usuário não autenticado, **quando** ele tenta acessar qualquer tela com dados de
   estudantes, **então** o acesso é negado e ele é direcionado à autenticação.
2. **Dado** um usuário de perfil Escola vinculado à Escola A, **quando** ele aplica um filtro que
   referencia a Escola B, **então** o resultado é vazio e nenhum dado da Escola B é revelado, nem
   mesmo contagens agregadas.
3. **Dado** um usuário de perfil Escola, **quando** ele tenta acessar a configuração de critérios
   analíticos ou a gestão de usuários, **então** o acesso é negado.
4. **Dado** um usuário sem a permissão de dados nominais (FR-007), **quando** ele gera um relatório
   ou abre uma tela que listaria estudantes, **então** recebe a versão agregada, sem nomes — a função
   permanece disponível e apenas o dado nominal é suprimido.
5. **Dado** qualquer registro de log gerado pelo sistema, **quando** inspecionado, **então** não
   contém nome de estudante nem outro dado pessoal além do estritamente necessário.

---

### User Story 4 - Priorizar estudantes que precisam de atenção (Priority: P2)

Como professor ou coordenador, quero ver a lista de estudantes da turma ordenada por prioridade
pedagógica e abrir a ficha de um estudante, para saber quem acompanhar e em quais habilidades.

**Why this priority**: converte o diagnóstico coletivo em ação individual. Depende das US1 e US2.

**Independent Test**: abrir uma turma do arquivo de referência, confirmar que os estudantes em
Defasagem aparecem primeiro, que os não avaliados aparecem em lista própria, e que a ficha
individual mostra o resultado original e o percentual de cada habilidade.

**Acceptance Scenarios**:

1. **Dado** a lista de estudantes de uma turma, **quando** exibida na ordenação padrão, **então**
   os grupos aparecem na ordem Defasagem, Intermediário, Adequado e, por último e separadamente,
   Não avaliado; dentro de cada grupo, do menor para o maior percentual geral.
2. **Dado** um estudante não avaliado, **quando** exibido na lista, **então** suas colunas de
   acertos, itens e percentual mostram ausência de dado e nunca zero, e ele não aparece entre os
   estudantes em Defasagem.
3. **Dado** a ficha de um estudante avaliado, **quando** aberta, **então** exibe o
   `Nível de aprendizagem` recebido da fonte, os acertos totais, os itens possíveis, o percentual
   geral e, para cada habilidade, o resultado original (`1 / 2`) ao lado do percentual (`50%`).
4. **Dado** a ficha de um estudante, **quando** exibida, **então** informa quantas habilidades estão
   em Fragilidade e quantas em Atenção, rotuladas explicitamente como critério analítico do sistema
   e visualmente distintas do `Nível de aprendizagem`.
5. **Dado** o mapa de calor estudante × habilidade, **quando** o usuário consulta uma célula,
   **então** obtém o código da habilidade, o resultado original, o percentual e a descrição
   pedagógica, com o valor numérico sempre acessível — a cor nunca é a única portadora do
   significado.

---

### User Story 5 - Detalhar uma habilidade (Priority: P2)

Como técnico pedagógico, quero abrir uma habilidade e ver sua descrição, o desempenho consolidado,
a distribuição dos resultados possíveis e quais turmas e estudantes vão pior nela, para entender a
intensidade da dificuldade — e não apenas sua média.

**Why this priority**: a média de uma habilidade de 2 itens esconde a diferença entre uma turma com
todos em `1/2` e uma turma dividida entre `0/2` e `2/2`. A distribuição é informação pedagógica que
o percentual sozinho não fornece.

**Independent Test**: abrir H07 no arquivo de referência e verificar a descrição, o total de itens,
o percentual consolidado e a distribuição de estudantes entre `0/2`, `1/2` e `2/2`.

**Acceptance Scenarios**:

1. **Dado** a tela de uma habilidade, **quando** aberta, **então** exibe o código curto (`H07`), o
   código pedagógico (`4EF14_P`), a descrição completa, a quantidade de itens, os estudantes
   avaliados, o total de acertos, o total de itens possíveis e o percentual de acerto.
2. **Dado** uma habilidade de 2 itens, **quando** a distribuição é exibida, **então** mostra a
   quantidade e o percentual de estudantes em `0 / 2`, `1 / 2` e `2 / 2`, somando exatamente o total
   de estudantes avaliados com resultado nessa habilidade.
3. **Dado** a tela de uma habilidade, **quando** exibida, **então** apresenta o ranking das turmas
   nessa habilidade e a lista dos estudantes com maior dificuldade, respeitando o escopo de acesso
   do usuário.

---

### User Story 6 - Filtrar e recortar a análise (Priority: P2)

Como gestor, quero combinar filtros por avaliação, escola, turma, nível, habilidade, situação de
participação e faixa de percentual, para investigar recortes específicos.

**Why this priority**: multiplica o valor das telas já entregues sem exigir novas análises.

**Independent Test**: aplicar simultaneamente filtro de turma, `Avaliado = Não` e nível, e conferir
que todos os indicadores da tela, e não apenas a tabela, refletem o recorte.

**Acceptance Scenarios**:

1. **Dado** um conjunto de filtros aplicado, **quando** a tela é recalculada, **então** todos os
   indicadores, rankings, gráficos e listas da tela refletem o mesmo recorte, sem exceção.
2. **Dado** o filtro `Avaliado = Não`, **quando** aplicado, **então** o sistema lista os não
   avaliados e não apresenta para eles percentuais de desempenho.
3. **Dado** filtros aplicados, **quando** o usuário exporta ou gera relatório, **então** o
   resultado respeita exatamente os mesmos filtros e os declara no cabeçalho.
4. **Dado** uma combinação de filtros sem resultados, **quando** aplicada, **então** o sistema
   informa a ausência de registros e não exibe indicadores zerados.

---

### User Story 7 - Gerar relatórios e exportar (Priority: P3)

Como gestor, quero gerar os cinco relatórios previstos e exportá-los em CSV, XLSX e PDF, para
distribuir os resultados a quem toma decisão.

**Why this priority**: fecha o ciclo de uso, mas depende de todas as análises anteriores estarem
corretas.

**Independent Test**: gerar o relatório da turma nos três formatos e conferir que os números
coincidem exatamente com os da tela que os originou.

**Acceptance Scenarios**:

1. **Dado** qualquer relatório exportado, **quando** comparado à tela correspondente, **então** os
   valores são idênticos, com o mesmo critério de arredondamento de apresentação.
2. **Dado** um relatório que contém nomes de estudantes, **quando** solicitado por usuário sem a
   permissão de dados nominais, **então** é entregue em versão agregada, sem nomes (FR-007a).
3. **Dado** um relatório exportado, **quando** aberto, **então** identifica avaliação, escola,
   recorte de filtros, data/hora de geração e usuário solicitante.
4. **Dado** uma exportação em CSV, **quando** aberta em ferramenta de planilha configurada para
   português do Brasil, **então** acentos e separadores decimais são exibidos corretamente.

---

### User Story 8 - Parametrizar os critérios analíticos (Priority: P3)

Como administrador, quero configurar as faixas de Fragilidade, Atenção e Satisfatório e a definição
de baixo rendimento, para adequar a leitura analítica à realidade da rede — sem jamais alterar a
classificação oficial.

**Why this priority**: as faixas iniciais são sugestões; fixá-las em código violaria a constituição.
Não bloqueia a entrega das análises, que partem dos valores padrão.

**Independent Test**: alterar o limite de Fragilidade de 60% para 70%, reprocessar e confirmar que
a quantidade de habilidades em Fragilidade muda, que os acertos e itens originais permanecem
idênticos e que os `Nível de aprendizagem` não se alteram.

**Acceptance Scenarios**:

1. **Dado** faixas analíticas em vigor, **quando** o administrador as altera, **então** os
   indicadores derivados são recalculados e nenhum valor original importado é modificado.
2. **Dado** uma alteração de faixa, **quando** efetivada, **então** fica registrada em auditoria com
   autor, data/hora, valor anterior e valor novo.
3. **Dado** qualquer tela que exiba categoria analítica, **quando** apresentada, **então** a
   categoria é rotulada como critério do sistema e é visual e conceitualmente distinta do campo
   `Nível de aprendizagem`.
4. **Dado** um relatório ou exportação, **quando** gerado, **então** declara quais faixas analíticas
   estavam vigentes no momento da geração.

---

### User Story 9 - Rastrear importações e alterações (Priority: P3)

Como administrador, quero consultar o histórico de importações e a trilha de auditoria, para saber
quem carregou, alterou ou excluiu o quê e quando.

**Why this priority**: exigência de LGPD e de rastreabilidade; não bloqueia a análise, mas é
condição para operação em produção.

**Independent Test**: realizar uma importação, uma alteração de parâmetro e uma exclusão, e
confirmar que os três eventos aparecem na auditoria com autor e data/hora.

**Acceptance Scenarios**:

1. **Dado** uma importação confirmada, **quando** consultada no histórico, **então** exibe
   avaliação, escola, nome do arquivo original, data/hora, usuário, total de registros, avaliados,
   não avaliados, turmas, inconsistências e status.
2. **Dado** uma importação excluída, **quando** a auditoria é consultada, **então** o evento de
   exclusão consta com autor e data/hora, e os indicadores afetados são recalculados.
3. **Dado** um reprocessamento de indicadores, **quando** executado, **então** é registrado em
   auditoria e os valores originais importados permanecem inalterados.

---

### User Story 10 - Cadastrar os estudantes antes da avaliação (Priority: P1)

Como gestor da rede, quero cadastrar os estudantes na plataforma antes da aplicação da avaliação —
individualmente ou por nominata em lote — para que cada um receba seu código único e a importação de
resultados apenas reconheça quem já existe, em vez de criar cadastros a partir de um arquivo.

**Why this priority**: precede a US1 na ordem de execução. É o que transforma o código único em
identidade confiável: com a base cadastral montada antes, a importação deixa de ser o momento em que
se decide quem é quem.

**Independent Test**: cadastrar os 111 estudantes do arquivo de referência por nominata em lote,
exportar a relação com os códigos, e verificar que cada estudante recebeu um código único e distinto
e está vinculado à sua escola e turma.

**Acceptance Scenarios**:

1. **Dado** uma nominata em CSV, XLSX ou XLS, **quando** importada, **então** cada estudante é
   cadastrado com código único, vinculado a escola e turma, aplicando as mesmas regras de
   normalização da importação de resultados.
2. **Dado** a base cadastral montada, **quando** o arquivo de resultados é importado, **então** o
   sistema reconcilia as linhas com os cadastros existentes e não cria nenhum estudante
   automaticamente.
3. **Dado** um estudante presente no arquivo de resultados e ausente do cadastro, **quando** a
   pré-visualização é exibida, **então** o sistema o sinaliza como alerta e permite criar o cadastro
   naquele momento, sem bloquear a importação.
4. **Dado** um estudante cadastrado na turma e ausente do arquivo de resultados, **quando** a
   pré-visualização é exibida, **então** ele é listado como ausente, para decisão consciente do
   usuário.
5. **Dado** uma turma com dois estudantes homônimos cadastrados, **quando** o arquivo de resultados
   não trouxer o código único, **então** o sistema exige confirmação individual do usuário e não
   resolve o vínculo por nome.
6. **Dado** um estudante cadastrado na turma errada, **quando** o cadastro é corrigido após a
   importação, **então** seus resultados já confirmados permanecem inalterados e a correção é
   registrada em auditoria.

---

### Edge Cases

**Arquivo e estrutura**

- Arquivo em formato não suportado, corrompido, vazio ou apenas com cabeçalho.
- CSV com separador diferente de `;`, sem BOM, ou em codificação diferente de UTF-8.
- Coluna de habilidade ausente no arquivo; coluna de habilidade presente mas não cadastrada no
  catálogo; ordem das colunas diferente da esperada.
- Arquivo com mais ou menos de 12 habilidades — o sistema não pode presumir 12 nem presumir 22 itens.
- Linhas em branco no meio do arquivo; espaços extras em qualquer campo.

**Conteúdo dos registros**

- Estudante sem nome; `Código da Turma` ausente; nome de turma ausente.
- Valor de habilidade inválido: `2 / 1` (acertos maiores que itens), `-1 / 2`, `1 / 0`, texto livre,
  `120%`, célula com apenas espaços.
- Variações de escrita do valor: `1/2`, ` 2 / 2 `, `1 /2` — devem ser interpretadas corretamente.
- `Avaliado = Não` com resultados de habilidade preenchidos (contradição).
- `Avaliado = Sim` sem nenhum resultado de habilidade.
- `Nível de aprendizagem` vazio em estudante avaliado, ou com valor fora de
  Adequado / Intermediário / Defasagem.
- `Nível de aprendizagem` da fonte divergente do percentual calculado — o sistema exibe a
  divergência e **nunca** reclassifica.
- Denominador de uma mesma habilidade divergente entre linhas da mesma avaliação (por exemplo H03
  com `3` itens na maioria e `2` em uma linha).

**Identidade e duplicidade**

- Mesmo nome de estudante na mesma turma e na mesma avaliação — possível duplicidade real.
- Mesmo nome em turmas diferentes — possível transferência; registros permanecem separados. *(O
  arquivo de referência contém exatamente um caso deste tipo, útil como teste.)*
- Nomes que diferem apenas por acentuação, capitalização ou espaços múltiplos.
- Arquivo com coluna de código único parcialmente preenchida — estudantes novos da rede chegam sem
  código e devem seguir a vinculação assistida.
- Código preenchido no arquivo mas inexistente no sistema (erro de transcrição).
- Código válido pertencente a estudante de outra escola (transferência real ou código trocado).
- Dois registros do mesmo arquivo apontando para o mesmo código único.
- Estudante que muda de turma entre avaliações — o código deve permanecer o mesmo.
- Vinculação confirmada por engano, exigindo desfazimento.
- Estudante presente no arquivo de resultados e ausente da base cadastral — ingresso posterior ao
  cadastro inicial.
- Estudante cadastrado na turma e ausente do arquivo de resultados — transferência, evasão ou
  arquivo parcial.
- Turma com dois homônimos cadastrados: o vínculo por nome torna-se impossível e o código passa a ser
  obrigatório.
- Estudante cadastrado na turma errada e corrigido depois da importação dos resultados.
- Nominata importada em lote contendo estudantes já cadastrados.

**Cálculo e apresentação**

- Turma, escola ou recorte de filtro com zero estudantes avaliados — denominador zero.
- Habilidade sem nenhum resultado válido no recorte.
- Empate de frequência entre dois denominadores da mesma habilidade — a escolha do denominador de
  referência não pode ser arbitrária nem silenciosa.
- Exclusão de importação que altera qual denominador é o predominante de uma habilidade.
- Empate de percentual no ranking de habilidades ou de turmas.
- Percentual periódico (`1/3`) — arredondar apenas na apresentação.

**Operação**

- Reimportação do mesmo arquivo para a mesma avaliação e escola.
- Exclusão de uma importação que já alimenta dashboards.
- Alteração de faixas analíticas enquanto um relatório está sendo gerado.

---

## Requirements *(mandatory)*

### Functional Requirements

#### A. Autenticação, perfis e controle de acesso

- **FR-001**: O sistema DEVE exigir autenticação antes de qualquer acesso a dados de estudantes.
- **FR-002**: O sistema DEVE oferecer os perfis Administrador, Gestor/Analista e Escola.
- **FR-003**: O Administrador DEVE poder administrar usuários, cadastrar escolas e avaliações,
  importar, excluir importações, configurar critérios analíticos, acessar dados nominais e exportar.
- **FR-004**: O Gestor/Analista DEVE poder importar, analisar, filtrar, exportar e visualizar
  apenas as escolas e turmas às quais foi autorizado.
- **FR-005**: O perfil Escola DEVE visualizar exclusivamente dados da própria escola, incluindo
  turmas, estudantes e relatórios dela.
- **FR-006**: O sistema DEVE aplicar o escopo por escola na origem dos dados, de modo que nenhuma
  tela, filtro, busca, exportação, contagem agregada ou mensagem de erro revele existência ou
  conteúdo de escola não autorizada.
- **FR-007**: O acesso a dados nominais DEVE ser controlado por uma **permissão específica por
  usuário**, distinta do perfil e do escopo de escola. O padrão na criação do usuário é: concedida
  para Administrador e para o perfil Escola — que precisa dos nomes para agir pedagogicamente sobre
  a própria escola — e **negada** para Gestor/Analista, que na maior parte do trabalho opera sobre
  agregados. O Administrador PODE alterá-la individualmente.
- **FR-007a**: Usuário sem a permissão de dados nominais **NÃO DEVE** ser bloqueado: ele DEVE receber
  a versão agregada de toda tela, relatório e exportação, sem nomes de estudantes. A ausência da
  permissão restringe o dado, não a função.
- **FR-008**: O Administrador DEVE poder criar, editar, desativar e vincular usuários a perfil e,
  quando aplicável, a uma escola.
- **FR-009**: O sistema NÃO DEVE registrar nome de estudante ou outro dado pessoal em logs além do
  estritamente necessário à operação.
- **FR-010**: O sistema DEVE encerrar sessões inativas e permitir que o usuário encerre a sessão
  explicitamente.

#### B. Cadastros de referência

- **FR-011**: O sistema DEVE permitir cadastrar e selecionar uma avaliação, identificada por nome,
  ano, ciclo, componente curricular e data de aplicação.
- **FR-012**: O sistema DEVE permitir cadastrar escolas com código, nome, rede, município e estado.
- **FR-013**: O sistema DEVE manter um catálogo de habilidades contendo código curto (`H01`…),
  código pedagógico de referência (`2EF08_P`…) e descrição completa.
- **FR-014**: O sistema DEVE permitir que uma avaliação tenha um conjunto de habilidades distinto
  de outra avaliação, sem presumir a quantidade de 12.
- **FR-015**: O sistema DEVE derivar a quantidade de itens de cada habilidade dos denominadores
  presentes no arquivo importado.
- **FR-016**: O sistema NÃO DEVE fixar em código a quantidade de itens de nenhuma habilidade nem o
  total de 22 itens por estudante.
- **FR-017**: O sistema DEVE permitir consultar, por avaliação, a quantidade de itens registrada
  para cada habilidade.
- **FR-018**: O sistema DEVE impedir a exclusão de avaliação, escola ou habilidade que possua
  resultados vinculados, salvo por ação explícita do Administrador registrada em auditoria.

#### C. Importação — fluxo e leitura do arquivo

- **FR-019**: O sistema DEVE conduzir a importação na ordem Avaliação → Escola → Arquivo →
  Validação → Pré-visualização → Confirmação.
- **FR-020**: O sistema DEVE aceitar arquivos nos formatos CSV, XLSX e XLS.
- **FR-021**: O sistema DEVE detectar automaticamente o separador e a codificação de arquivos CSV e
  DEVE permitir que o usuário os ajuste manualmente.
- **FR-022**: O sistema DEVE processar corretamente, sem intervenção manual, arquivos CSV com
  separador `;` e codificação UTF-8 com BOM.
- **FR-023**: O sistema DEVE detectar e remover a marca BOM sem alterar o primeiro nome de coluna.
- **FR-024**: O sistema DEVE preservar integralmente caracteres acentuados em todos os campos
  textuais.
- **FR-025**: O sistema DEVE reconhecer as colunas Rede, Ano Escolar, Componente Curricular, Estado,
  Município, Código da Turma, Turma, Estudante, Avaliado e Nível de aprendizagem.
- **FR-026**: O sistema DEVE reconhecer colunas de habilidade nas variações `H 01`, `H01`, `H_01` e
  `H 01 (2EF08_P)` e associá-las à habilidade correta do catálogo.
- **FR-027**: O sistema DEVE permitir que o usuário revise e corrija manualmente o mapeamento de
  colunas antes da validação.
- **FR-028**: Quando o arquivo não contiver coluna de escola, o sistema DEVE exigir a seleção de uma
  escola e atribuí-la a todos os registros do arquivo; quando contiver, DEVE identificá-la e exigir
  confirmação do usuário.

#### D. Interpretação dos resultados e normalização

- **FR-029**: O sistema DEVE interpretar o valor de habilidade no formato `acertos / itens`,
  tolerando espaços em qualquer posição (`1/2`, ` 2 / 2 `, `1 /2`).
- **FR-030**: Para cada resultado, o sistema DEVE armazenar separadamente o valor original exato, os
  acertos, os itens possíveis e o percentual calculado.
- **FR-031**: O sistema DEVE tratar célula vazia ou contendo apenas espaços como ausência de
  resultado e NÃO DEVE convertê-la em zero em nenhuma circunstância.
- **FR-032**: O sistema DEVE aceitar como válido apenas o resultado que satisfaça simultaneamente
  `acertos >= 0`, `itens > 0` e `acertos <= itens`.
- **FR-033**: O sistema DEVE normalizar o `Código da Turma` removendo espaços das extremidades.
- **FR-034**: O sistema DEVE preservar o nome original do estudante para exibição e DEVE derivar uma
  versão normalizada. O uso da forma normalizada é restrito a três finalidades, e a nenhuma outra:
  **busca**, **detecção de duplicidade** e **sugestão de candidatos na vinculação assistida**
  (FR-141). Ela NÃO DEVE ser exibida ao usuário em nenhuma tela, NÃO DEVE substituir o nome original
  em relatório ou exportação, e NÃO DEVE, por si só, estabelecer vínculo automático entre registros
  (FR-142).
- **FR-035**: O sistema DEVE normalizar os valores `Sim` e `Não` do campo Avaliado sem alterar o
  valor de origem armazenado.
- **FR-036**: O sistema DEVE preservar o valor de `Nível de aprendizagem` exatamente como recebido,
  normalizando apenas para fins de comparação interna.
- **FR-037**: O sistema DEVE remover espaços das extremidades dos campos textuais sem alterar o
  conteúdo interno do nome do estudante.
- **FR-038**: O sistema DEVE reter o arquivo original importado e o registro das transformações
  aplicadas.
- **FR-038a**: A retenção do arquivo original DEVE ter **prazo definido e configurável**, contado da
  confirmação da importação, após o qual o arquivo é **excluído automaticamente**. O padrão é de 90
  dias. O diretório de armazenamento DEVE ter as mesmas restrições de acesso do banco de dados.
- **FR-038b**: A exclusão do arquivo NÃO DEVE reduzir a rastreabilidade: o SHA-256, o nome do
  arquivo, as contagens, o autor e a data/hora permanecem em `Import` e em `AuditLog` por prazo
  indeterminado, por não conterem dado pessoal. O hash continua provando **qual** conteúdo foi
  importado depois que o conteúdo já não existe.
- **FR-038c**: O Administrador DEVE poder excluir o arquivo original antes do prazo, por ação
  registrada em auditoria.

#### E. Validações de consistência

- **FR-039**: O sistema DEVE classificar cada inconsistência detectada como `ERROR` ou `WARNING`.
- **FR-040**: Um `ERROR` DEVE impedir a confirmação da importação; um `WARNING` DEVE permitir a
  confirmação consciente pelo usuário.
- **FR-041**: O sistema DEVE detectar e reportar, no mínimo: estudante sem nome; código da turma
  ausente; turma ausente; valor de habilidade inválido; acertos maiores que itens; estudante
  `Avaliado = Não` com resultados preenchidos; estudante `Avaliado = Sim` sem nenhum resultado;
  nível de aprendizagem vazio em estudante avaliado; possível duplicidade; quantidade de itens
  divergente para a mesma habilidade dentro da mesma avaliação; coluna de habilidade ausente;
  habilidade presente no arquivo e ausente do catálogo.
- **FR-042**: O sistema NÃO DEVE corrigir silenciosamente nenhuma inconsistência.
- **FR-043**: O sistema DEVE apresentar, para cada ocorrência, a linha do arquivo, a coluna, o valor
  encontrado e a descrição do problema.
- **FR-044**: O sistema DEVE detectar possível duplicidade pela combinação Avaliação + Código da
  Turma normalizado + nome normalizado do estudante.
- **FR-045**: O sistema NÃO DEVE consolidar automaticamente estudantes por igualdade de nome;
  registros com mesmo nome em turmas diferentes DEVEM permanecer separados e ser sinalizados como
  "possível estudante duplicado ou transferido".
- **FR-046**: O sistema DEVE sinalizar divergência de denominador de uma habilidade dentro da mesma
  avaliação, identificando a habilidade, o valor predominante e as linhas divergentes.
- **FR-047**: O sistema DEVE reportar valor de `Nível de aprendizagem` fora do conjunto esperado sem
  descartá-lo nem substituí-lo.
- **FR-048**: O sistema DEVE apresentar um resumo com a contagem de `ERROR` e de `WARNING` por tipo.

#### F. Pré-visualização e confirmação

- **FR-049**: Antes da confirmação, o sistema DEVE exibir arquivo, escola e avaliação selecionados,
  registros encontrados, avaliados, não avaliados, turmas identificadas, habilidades identificadas,
  quantidade de inconsistências críticas e quantidade de alertas.
- **FR-050**: O sistema DEVE exibir uma amostra dos registros interpretados, mostrando o valor
  original e o valor interpretado lado a lado.
- **FR-051**: O sistema NÃO DEVE persistir nenhum resultado antes da confirmação explícita do
  usuário.
- **FR-052**: O sistema DEVE permitir cancelar a importação em qualquer etapa anterior à
  confirmação, sem efeito colateral.
- **FR-053**: Após a confirmação, o sistema DEVE calcular os indicadores derivados e disponibilizá-los
  nas telas de análise.
- **FR-054**: O sistema DEVE informar o resultado final da importação: quantidade persistida,
  rejeitada e sinalizada.

#### G. Cálculos

- **FR-055**: Percentual da habilidade do estudante = `acertos ÷ itens possíveis × 100`.
- **FR-056**: Percentual geral do estudante = `Σ acertos válidos ÷ Σ itens possíveis válidos × 100`.
- **FR-057**: Percentual consolidado de uma habilidade em qualquer recorte =
  `Σ acertos ÷ Σ itens possíveis`, considerando apenas estudantes avaliados, `× 100`.
- **FR-058**: O sistema NÃO DEVE usar a média simples dos percentuais das habilidades como indicador
  principal em nenhuma tela, relatório ou exportação; ela PODE ser exibida como indicador secundário
  explicitamente rotulado.
- **FR-059**: Estudantes com `Avaliado = Não` NÃO DEVEM compor numeradores nem denominadores de
  cálculos de desempenho.
- **FR-060**: Estudantes com `Avaliado = Não` DEVEM compor os indicadores de participação.
- **FR-061**: Taxa de participação = `avaliados ÷ total de registros importados × 100`.
- **FR-062**: A distribuição por `Nível de aprendizagem` DEVE ter como denominador apenas os
  estudantes avaliados; não avaliados NUNCA DEVEM ser contabilizados como Defasagem.
- **FR-063**: O sistema NÃO DEVE arredondar valores em cálculos intermediários; o arredondamento
  DEVE ocorrer apenas na apresentação.
- **FR-064**: Todo percentual exibido DEVE ser rastreável até o numerador e o denominador que o
  originaram, disponíveis ao usuário.
- **FR-065**: Quando o denominador de um cálculo for zero, o sistema DEVE indicar ausência de dado e
  NÃO DEVE exibir 0%.

#### H. Dashboard geral da avaliação

- **FR-066**: DEVE exibir estudantes importados, avaliados, não avaliados e taxa de participação.
- **FR-067**: DEVE exibir o percentual geral de acertos do recorte.
- **FR-068**: DEVE exibir quantidade e percentual em Adequado, Intermediário e Defasagem.
- **FR-069**: DEVE exibir a habilidade mais frágil e a de melhor desempenho.
- **FR-070**: DEVE exibir o ranking completo das habilidades com acertos, itens possíveis, percentual
  e posição.
- **FR-071**: DEVE exibir o ranking das turmas, indicando a turma de menor desempenho geral e a de
  maior percentual em Defasagem.
- **FR-072**: DEVE permitir ordenar o ranking de habilidades por menor percentual de acerto (padrão),
  maior percentual de estudantes em fragilidade, maior quantidade de estudantes em fragilidade e
  maior quantidade de pontos possíveis não atingidos, indicando o critério ativo.
- **FR-073**: DEVE oferecer, como visão opcional e explicitamente rotulada como analítica, o
  agrupamento "Abaixo do adequado" = Defasagem + Intermediário.

#### I. Dashboard da escola

- **FR-074**: DEVE exibir total de turmas, total de estudantes, taxa de participação e percentual
  geral de acertos da escola.
- **FR-075**: DEVE exibir a distribuição por nível, o ranking de habilidades e o ranking de turmas
  da escola.
- **FR-076**: DEVE listar os estudantes em Defasagem, em Intermediário e os não avaliados,
  respeitando a autorização de dados nominais.

#### J. Dashboard da turma

- **FR-077**: DEVE exibir escola, turma, código da turma, ano escolar e componente curricular.
- **FR-078**: DEVE exibir total de estudantes, avaliados, não avaliados, taxa de participação e
  percentual geral.
- **FR-079**: DEVE exibir a distribuição por nível, a habilidade mais frágil e a de melhor
  desempenho da turma.
- **FR-080**: DEVE exibir a tabela de habilidades da turma com código, acertos, itens possíveis,
  percentual e posição, ordenada por padrão da maior fragilidade para o melhor desempenho.
- **FR-081**: DEVE exibir a lista de estudantes com situação de participação, nível, acertos, itens,
  percentual geral e quantidade de fragilidades, permitindo ordenar e filtrar.
- **FR-082**: DEVE ordenar os estudantes por padrão na sequência Defasagem, Intermediário, Adequado
  e, em lista própria, Não avaliado; dentro de cada grupo, do menor para o maior percentual geral.

#### K. Tela por habilidade

- **FR-083**: DEVE exibir código curto, código pedagógico e descrição da habilidade.
- **FR-084**: DEVE exibir quantidade de itens, estudantes avaliados, total de acertos, total de itens
  possíveis e percentual de acerto no recorte.
- **FR-085**: DEVE exibir a distribuição dos estudantes por resultado possível (`0/n`, `1/n`, …,
  `n/n`), com quantidade e percentual.
- **FR-086**: DEVE exibir o ranking das turmas na habilidade.
- **FR-087**: DEVE listar os estudantes com maior dificuldade na habilidade, respeitando a
  autorização de dados nominais.

#### L. Ficha individual do estudante

- **FR-088**: DEVE exibir nome, escola, turma, código da turma e ano escolar.
- **FR-089**: DEVE exibir a situação de participação e o `Nível de aprendizagem` recebido da fonte.
- **FR-090**: DEVE exibir acertos totais, itens possíveis e percentual geral.
- **FR-091**: DEVE exibir, por habilidade, o código, o resultado original, o percentual e a situação
  analítica.
- **FR-092**: DEVE exibir a quantidade de habilidades em Fragilidade e em Atenção, rotuladas como
  critério analítico do sistema.
- **FR-093**: Para estudante não avaliado, DEVE indicar a ausência de resultados sem exibir zeros.

#### M. Mapa de calor

- **FR-094**: DEVE apresentar a matriz estudante × habilidade do recorte selecionado.
- **FR-095**: Cada célula DEVE disponibilizar código da habilidade, resultado original, percentual e
  descrição pedagógica.
- **FR-096**: A cor DEVE refletir a faixa analítica vigente, e o valor numérico DEVE permanecer
  visível ou acessível — a cor NÃO DEVE ser o único portador de significado.
- **FR-097**: Células sem resultado DEVEM ser visualmente distintas de células com resultado zero.

#### N. Filtros

- **FR-098**: O sistema DEVE oferecer filtros combináveis por avaliação, rede, estado, município,
  escola, ano escolar, componente curricular, turma, código da turma, situação de participação,
  nível de aprendizagem, habilidade, estudante, faixa de percentual geral e situação analítica.
- **FR-099**: Os filtros aplicados DEVEM afetar todos os indicadores, rankings, gráficos e listas da
  tela de forma consistente.
- **FR-100**: O sistema DEVE exibir os filtros ativos de forma legível e permitir limpá-los.
- **FR-101**: Os filtros DEVEM ser propagados a relatórios e exportações geradas a partir da tela.

#### O. Relatórios e exportações

- **FR-102**: O sistema DEVE gerar relatório geral da avaliação, por escola, por turma, por
  habilidade e individual.
- **FR-103**: O sistema DEVE exportar em CSV, XLSX e PDF.
- **FR-104**: As exportações DEVEM respeitar os filtros aplicados e o escopo de acesso do usuário.
- **FR-105**: Relatórios nominais DEVEM exigir a permissão específica de dados nominais definida em
  FR-007. Solicitação vinda de usuário sem essa permissão DEVE ser atendida em **versão agregada**,
  nunca negada (FR-007a). Solicitação referente a escola fora do escopo do usuário é caso distinto e
  retorna `404`, conforme FR-006.
- **FR-106**: Todo relatório DEVE identificar avaliação, escola, recorte de filtros, faixas
  analíticas vigentes, data/hora de geração e usuário solicitante.
- **FR-107**: Os valores dos relatórios DEVEM coincidir exatamente com os da tela de origem.
- **FR-108**: As exportações DEVEM preservar acentuação e usar formatação numérica pt-BR.

#### P. Critérios analíticos configuráveis

- **FR-109**: O sistema DEVE permitir ao Administrador configurar as faixas de situação analítica por
  habilidade, com os valores iniciais `< 60%` Fragilidade, `60%` a `79,99%` Atenção e `>= 80%`
  Satisfatório.
- **FR-110**: O sistema DEVE permitir configurar quais níveis compõem a visão de baixo rendimento.
- **FR-111**: O sistema NÃO DEVE fixar essas faixas em código.
- **FR-112**: As categorias analíticas NÃO DEVEM substituir, sobrescrever ou reordenar o campo
  `Nível de aprendizagem`, e DEVEM ser visual e conceitualmente distintas dele em toda a interface.
- **FR-113**: Alterar parâmetros analíticos DEVE recalcular os indicadores derivados sem alterar
  nenhum valor original importado.
- **FR-114**: O sistema DEVE registrar as faixas vigentes no momento de cada geração de relatório.

#### Q. Histórico e auditoria

- **FR-115**: O sistema DEVE registrar cada importação com identificador, avaliação, escola, nome do
  arquivo original, data/hora, usuário, quantidade de registros, avaliados, não avaliados, turmas,
  inconsistências e status.
- **FR-116**: O sistema DEVE permitir consultar e filtrar o histórico de importações.
- **FR-117**: O sistema DEVE registrar em auditoria: importação, exclusão de importação, alteração de
  parâmetros analíticos e reprocessamento, com autor, data/hora e escopo afetado.
- **FR-118**: A exclusão de uma importação DEVE recalcular os indicadores afetados e permanecer
  registrada na auditoria.
- **FR-119**: O sistema DEVE permitir reprocessar os indicadores de uma avaliação sem alterar os
  valores originais importados.
- **FR-120**: Os registros de auditoria NÃO DEVEM ser editáveis pela interface.

#### R. Apresentação, acessibilidade e desempenho

- **FR-121**: A interface DEVE estar integralmente em português do Brasil.
- **FR-122**: Datas e números DEVEM seguir o padrão pt-BR, com vírgula como separador decimal.
- **FR-123**: A interface DEVE ser utilizável em desktop, tablet e smartphone.
- **FR-124**: Nenhum significado DEVE ser transmitido exclusivamente por cor; rótulo, texto ou ícone
  DEVEM acompanhar toda codificação cromática.
- **FR-125**: As telas DEVEM privilegiar interpretação pedagógica, evitando gráficos decorativos ou
  redundantes.
- **FR-126**: Todo acesso ao sistema DEVE ocorrer por canal cifrado.
- **FR-127**: O sistema DEVE exibir o resultado original ao lado do percentual sempre que apresentar
  o desempenho de um estudante em uma habilidade.

#### S. Identidade do estudante

- **FR-128**: O sistema DEVE atribuir a cada estudante um **código único** no momento do primeiro
  cadastro, gerado pelo próprio sistema.
- **FR-129**: O código único DEVE ser permanente e estável: uma vez atribuído, NÃO DEVE ser alterado,
  reutilizado por outro estudante nem regenerado a cada importação.
- **FR-130**: O código único DEVE identificar o estudante na avaliação atual e nas avaliações
  seguintes, servindo de base para o acompanhamento longitudinal futuro.
- **FR-131**: O código único NÃO DEVE ser derivado do nome, da turma ou de qualquer dado pessoal, de
  modo que sua exibição não revele informação sobre o estudante.
- **FR-132**: O código único DEVE ser exibido no cadastro do estudante e na ficha individual, e DEVE
  ser incluído nas exportações e relatórios que o usuário esteja autorizado a gerar.
- **FR-133**: O sistema DEVE permitir buscar um estudante pelo seu código único.
- **FR-134**: O código único NÃO DEVE substituir o nome original do estudante nas telas de análise
  pedagógica, onde o nome permanece a identificação principal para o usuário autorizado.
- **FR-135**: O sistema DEVE manter separado do código único o campo de código externo da rede,
  preenchido apenas quando o arquivo ou outra fonte oficial o fornecer.
- **FR-136**: A atribuição de um código único a um novo estudante DEVE ser registrada em auditoria,
  vinculada à importação que a originou.

**Vinculação do código nas avaliações seguintes**

- **FR-137**: O sistema DEVE reconhecer, quando presente no arquivo importado, uma coluna opcional
  contendo o código único do estudante, e DEVE permitir mapeá-la explicitamente.
- **FR-138**: Quando a linha trouxer um código único válido e conhecido, o sistema DEVE vincular o
  registro ao estudante correspondente sem exigir intervenção do usuário.
- **FR-139**: Quando a linha trouxer um código preenchido e desconhecido pelo sistema, essa
  ocorrência DEVE ser tratada como `ERROR`, impedindo a confirmação. O sistema NÃO DEVE criar um
  novo estudante nesse caso, para que a falha de vinculação nunca passe despercebida.
- **FR-140**: Quando a linha trouxer um código válido pertencente a estudante de outra escola, a
  ocorrência DEVE ser tratada como `WARNING`, exigindo confirmação consciente do usuário, e o
  vínculo do estudante DEVE ser atualizado para a escola da importação com registro em auditoria.
- **FR-141**: Quando a linha não trouxer código — arquivo sem a coluna, ou célula vazia — o sistema
  DEVE oferecer **vinculação assistida**: apresentar, na pré-visualização, os estudantes já
  cadastrados na mesma escola cujo nome normalizado seja igual ou semelhante, para que o usuário
  confirme o vínculo.
- **FR-142**: O sistema NÃO DEVE vincular automaticamente um registro a um estudante existente com
  base apenas em nome, ainda que a coincidência seja exata.
- **FR-143**: Registro sem código e sem vínculo confirmado pelo usuário DEVE originar um novo
  estudante, com novo código único, apenas mediante criação explícita do cadastro pelo usuário na
  pré-visualização (FR-172). O sistema NÃO DEVE criar estudantes de forma automática.
- **FR-144**: Toda vinculação confirmada pelo usuário DEVE ser registrada em auditoria, com autor,
  data/hora, código do estudante e importação de origem.
- **FR-145**: O sistema DEVE permitir exportar a relação de estudantes com seus códigos únicos, para
  que a rede possa incluí-los no arquivo da avaliação seguinte. A exportação DEVE respeitar o escopo
  de acesso e a autorização para dados nominais.
- **FR-146**: O sistema DEVE permitir desfazer uma vinculação incorreta, restaurando o registro a
  estudante próprio com novo código, mediante ação do Administrador registrada em auditoria.

**Colisão de chave dentro da mesma avaliação** *(regra que antecede FR-137 a FR-146: é o momento em
que a identidade nasce, antes de existir código)*

- **FR-147**: Dois registros do mesmo arquivo com a mesma chave — avaliação + código da turma
  normalizado + nome normalizado — DEVEM ser tratados como `ERROR`, impedindo a confirmação.
- **FR-148**: Registro cuja chave já exista em importação anterior da mesma avaliação DEVE ser
  tratado como `ERROR`, impedindo a confirmação.
- **FR-149**: Para cada colisão, o sistema DEVE identificar as linhas envolvidas com número da linha,
  turma e nome, permitindo ao operador corrigir o arquivo de origem.
- **FR-150**: O sistema NÃO DEVE fundir automaticamente os registros colidentes nem descartar
  automaticamente qualquer uma das linhas. A decisão pertence a quem gera o arquivo.
- **FR-151**: Mesmo nome em turmas diferentes NÃO constitui colisão de chave: permanece `WARNING` de
  "possível estudante duplicado ou transferido", não impede a confirmação e mantém os registros
  separados, conforme FR-045.
- **FR-152**: Dois registros do mesmo arquivo apontando para o mesmo código único DEVEM ser tratados
  como `ERROR`, impedindo a confirmação.
- **FR-153**: Em consequência de FR-148, reenviar um arquivo já importado para a mesma avaliação e
  escola é bloqueado. Para substituir uma carga, o usuário DEVE excluir a importação anterior — ação
  privativa do Administrador e registrada em auditoria — e importar o arquivo corrigido.
- **FR-154**: O sistema NÃO DEVE permitir edição de resultados de habilidade já confirmados. A
  correção de qualquer dado importado ocorre exclusivamente pela exclusão da importação e reenvio do
  arquivo corrigido, preservando o arquivo como fonte única de verdade.

#### T. Denominador de referência da habilidade

- **FR-155**: O sistema DEVE determinar, para cada habilidade dentro de cada avaliação, um
  **denominador de referência** igual ao denominador mais frequente entre os registros válidos.
- **FR-156**: O denominador de referência DEVE ser o valor apresentado como quantidade de itens da
  habilidade (FR-084) e a base da distribuição de resultados `0/n` a `n/n` (FR-085).
- **FR-157**: O percentual consolidado da habilidade DEVE permanecer `Σ acertos ÷ Σ itens possíveis`
  incluindo os registros de denominador divergente. O denominador de referência é recurso de
  apresentação e NÃO DEVE alterar nenhum cálculo.
- **FR-158**: Registros cujo denominador difira do de referência NÃO DEVEM compor a distribuição por
  resultado; DEVEM ser listados à parte, identificando estudante, turma, denominador encontrado e
  resultado original.
- **FR-159**: Toda tela e todo relatório que apresentem a distribuição de uma habilidade com
  denominadores divergentes DEVEM informar quantos registros ficaram fora da distribuição e por quê.
- **FR-160**: Havendo empate na frequência entre denominadores, o sistema DEVE adotar o maior deles
  como referência e sinalizar o empate, para que a escolha nunca seja arbitrária nem silenciosa.
- **FR-161**: O denominador de referência DEVE ser recalculado sempre que importações forem
  acrescentadas ou excluídas da avaliação.

#### U. Abrangência e versionamento dos critérios analíticos

- **FR-162**: A configuração dos critérios analíticos DEVE ser única para todo o sistema, de modo que
  a mesma situação analítica signifique a mesma coisa em qualquer escola, turma ou avaliação.
- **FR-163**: A configuração DEVE ser versionada, registrando valores, autor e data/hora de início de
  vigência de cada versão.
- **FR-164**: Alterar a configuração DEVE recalcular a leitura analítica de todas as avaliações, sem
  alterar nenhum valor original importado e sem alterar o campo `Nível de aprendizagem`.
- **FR-165**: O sistema DEVE permitir consultar o histórico de versões das faixas e o período em que
  cada uma vigorou.
- **FR-166**: Relatórios e exportações DEVEM registrar a versão das faixas vigente no momento da
  geração, complementando FR-114.
- **FR-167**: O sistema NÃO DEVE oferecer configuração de critérios analíticos por escola nem por
  avaliação no MVP, para preservar a comparabilidade dos rankings de turma e de escola.

#### V. Cadastro prévio de estudantes

O cadastro dos estudantes é realizado na plataforma **antes** da avaliação. A base cadastral é a
autoridade sobre quem existe; a importação de resultados passa a reconhecer estudantes, não a
criá-los.

- **FR-168**: O sistema DEVE permitir cadastrar estudantes antes da realização das avaliações,
  vinculando cada um a uma escola e a uma turma.
- **FR-169**: O código único DEVE ser atribuído no momento do cadastro do estudante, e não na
  importação de resultados.
- **FR-170**: O sistema DEVE permitir cadastro individual e cadastro em lote a partir de arquivo de
  nominata em CSV, XLSX ou XLS, aplicando as mesmas regras de normalização e as mesmas severidades de
  validação da importação de resultados.
- **FR-171**: Ao importar resultados, o sistema DEVE reconciliar cada linha com a base cadastral,
  pela ordem: código único presente no arquivo (FR-138); vínculo assistido confirmado pelo usuário
  (FR-141); e, na ausência de ambos, tratamento como estudante não cadastrado.
- **FR-172**: Linha cujo estudante não conste da base cadastral DEVE gerar `WARNING`, permitindo ao
  usuário, na pré-visualização, criar o cadastro naquele momento — o que gera um código único novo —
  ou corrigir o arquivo. A importação NÃO DEVE ser bloqueada por esse motivo, para não impedir o
  registro de estudante que ingressou após o cadastro inicial.
- **FR-173**: Estudante cadastrado na turma e ausente do arquivo de resultados DEVE ser reportado
  como `WARNING` na pré-visualização, com a lista dos ausentes, para que a diferença seja uma decisão
  consciente e não um dado perdido em silêncio.
- **FR-174**: O sistema DEVE permitir exportar a nominata de uma turma ou escola com os códigos
  únicos, para que a rede a utilize na geração do arquivo de resultados (FR-145).
- **FR-175**: Dois estudantes com o mesmo nome normalizado na mesma turma DEVEM poder coexistir no
  cadastro, desde que criados por decisão explícita do usuário, cada um com seu código único.
- **FR-176**: Quando a turma contiver homônimos cadastrados, a importação de resultados NÃO DEVE
  tentar resolver o vínculo por nome: DEVE exigir o código único no arquivo ou confirmação
  individual do usuário para cada registro envolvido.
- **FR-177**: Alterações no cadastro de estudante — criação, edição de nome, mudança de turma ou de
  escola, inativação — DEVEM ser registradas em auditoria e NÃO DEVEM alterar resultados de
  avaliações já importadas.
- **FR-178**: O sistema DEVE permitir corrigir dados cadastrais do estudante (nome, turma) sem
  afetar seus resultados já confirmados, preservando a distinção entre dado cadastral e dado de
  avaliação estabelecida em FR-154.

---

### Key Entities

- **Avaliação**: ciclo avaliativo aplicado. Nome, ano, ciclo, componente curricular, data de
  aplicação, status. Agrupa importações, turmas e resultados.
- **Escola**: unidade de ensino. Código, nome, rede, município, estado. Define o escopo de acesso do
  perfil Escola. Atribuída na importação quando ausente do arquivo.
- **Turma**: agrupamento de estudantes em uma escola. Código externo normalizado (identificador
  vindo do arquivo), nome, ano escolar.
- **Estudante**: pessoa avaliada. **Código único do estudante** gerado pelo sistema, estável e
  permanente, é o identificador do cadastro e acompanha o estudante nesta e nas próximas avaliações.
  Além dele: nome original preservado, nome normalizado para busca e detecção de duplicidade e
  código externo opcional (identificador oficial da rede, quando disponível). O cadastro é feito na
  plataforma **antes** da avaliação e é a autoridade sobre quem existe; o código é atribuído nesse
  momento. A importação de resultados reconcilia com essa base, não a cria.
- **Resultado do Estudante na Avaliação**: vínculo estudante × avaliação. Situação de participação,
  nível de aprendizagem original, acertos totais, itens totais, percentual geral.
- **Habilidade**: competência avaliada. Código curto, código pedagógico de referência, descrição.
- **Resultado por Habilidade**: desempenho de um estudante em uma habilidade. Valor original,
  acertos, itens possíveis, percentual. Pode ser ausente.
- **Importação**: evento de carga de um arquivo. Avaliação, escola, arquivo original, identificação
  do conteúdo, usuário, data/hora, contagens e status.
- **Inconsistência**: ocorrência detectada na validação. Tipo, severidade (`ERROR`/`WARNING`),
  linha, coluna, valor encontrado, descrição.
- **Usuário**: operador do sistema. Perfil, escola vinculada quando aplicável, situação.
- **Parâmetro Analítico**: configuração de faixas e de baixo rendimento, com vigência e histórico.
- **Registro de Auditoria**: evento sensível. Autor, data/hora, ação, escopo, valores anterior e novo.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O arquivo de referência é importado com zero correções manuais e produz exatamente
  111 registros, 106 avaliados, 5 não avaliados, 4 turmas e 12 habilidades.
- **SC-002**: A distribuição de níveis apurada é exatamente 96 Adequado, 7 Intermediário e
  3 Defasagem, sobre um denominador de 106.
- **SC-003**: O ranking consolidado das 12 habilidades reproduz a ordem de fragilidade do PRD §38.1,
  com diferença máxima de 0,01 ponto percentual em cada valor.
- **SC-004**: Nenhum estudante não avaliado aparece com valor 0 em qualquer tela, relatório ou
  exportação; em 100% dos casos aparece como ausência de resultado.
- **SC-005**: 100% dos valores de `Nível de aprendizagem` exibidos coincidem com o valor recebido no
  arquivo.
- **SC-006**: Um coordenador que abre uma turma pela primeira vez identifica a habilidade mais
  frágil e os três estudantes de maior prioridade em até 30 segundos, sem treinamento prévio.
- **SC-007**: O tempo entre a confirmação da importação e a disponibilidade do dashboard é inferior
  a 60 segundos para um arquivo de até 5.000 registros.
- **SC-008**: Dashboards já processados são apresentados em até 3 segundos em condições normais de
  rede.
- **SC-009**: Nenhuma tentativa de acesso a dados de escola não autorizada retorna dado, contagem ou
  indício de existência — verificado em 100% das telas, filtros, relatórios e exportações.
- **SC-010**: 100% dos eventos de importação, exclusão, alteração de parâmetro e reprocessamento
  possuem registro de auditoria com autor e data/hora.
- **SC-011**: Alterar as faixas analíticas e reprocessar não altera nenhum valor original importado —
  verificado por comparação integral antes e depois.
- **SC-012**: Os valores de qualquer relatório exportado coincidem com os da tela de origem em 100%
  dos campos comparáveis.
- **SC-013**: Toda inconsistência introduzida propositalmente em um arquivo de teste é detectada e
  classificada, e nenhuma é corrigida silenciosamente.
- **SC-014**: A consolidação que hoje é feita manualmente em planilha passa a ser obtida sem
  intervenção manual após a confirmação da importação.
- **SC-015**: Todo estudante importado possui código único, e nenhum código é reutilizado ou alterado
  — verificado por conferência integral do cadastro após duas importações consecutivas.
- **SC-016**: Nenhum estudante é vinculado a um cadastro existente sem código no arquivo ou sem
  confirmação humana registrada — verificado em 100% dos vínculos da trilha de auditoria.
- **SC-017**: Reimportando o arquivo de referência acrescido da coluna de código exportada pelo
  sistema, 100% dos 111 registros vinculam-se aos cadastros existentes e nenhum código novo é
  gerado.
- **SC-018**: O mesmo percentual em uma habilidade produz a mesma situação analítica em qualquer
  escola, turma ou avaliação do sistema — verificado por amostragem entre escolas distintas.
- **SC-019**: Em um arquivo com denominador divergente introduzido propositalmente, o percentual
  consolidado da habilidade permanece igual a `Σ acertos ÷ Σ itens` de todos os registros, e a
  quantidade de registros excluídos da distribuição é informada na tela.
- **SC-020**: Com os 111 estudantes do arquivo de referência previamente cadastrados e a nominata
  exportada com códigos, a importação dos resultados reconcilia 100% das linhas sem intervenção
  manual e sem gerar nenhum código novo.
- **SC-021**: Nenhum estudante é criado pelo sistema sem ação explícita do usuário — verificado em
  100% dos cadastros pela trilha de auditoria.
- **SC-022**: Toda divergência entre a base cadastral e o arquivo de resultados — estudante a mais ou
  a menos — é apresentada na pré-visualização antes da confirmação, em 100% dos casos.

---

## Assumptions

Decisões tomadas na ausência de definição explícita no PRD ou na descrição da feature. Cada uma
pode ser revista em `/speckit-clarify` sem alterar a estrutura desta especificação.

1. **Localização do PRD**: a descrição da feature indicou `docs/PRD_..._v2.md`; o arquivo encontra-se
   na raiz do repositório e foi essa a versão lida integralmente. Não há divergência de conteúdo,
   apenas de caminho.
2. **Severidade das inconsistências**: adotou-se como padrão `ERROR` para o que impediria cálculo
   correto — estudante sem nome, código da turma ausente, valor de habilidade inválido, acertos
   maiores que itens, coluna de habilidade ausente. E `WARNING` para o que é informativo ou
   contraditório mas não corrompe o cálculo — nome repetido em turmas diferentes (possível
   transferência), divergência de denominador, nível vazio em avaliado, `Avaliado = Sim` sem
   resultados, `Avaliado = Não` com resultados, habilidade extra não cadastrada. A severidade DEVE
   ser revisável por configuração, com exceção das colisões de chave e de código, que são `ERROR`
   por decisão registrada em *Clarifications* (FR-147, FR-148, FR-152).
   *Verificação:* nenhuma dessas condições ocorre no arquivo de referência, de modo que a escolha
   não impede sua importação.
3. **Escopo de múltiplas escolas**: o MVP contempla cadastro de várias escolas, importação vinculada
   a uma escola por arquivo, análise por escola e escopo de acesso por escola. **Não** contempla
   comparação entre escolas, painéis municipais nem importação em lote de vários arquivos — itens
   que o PRD situa na Fase 2 e que a lista de MVP não inclui.
4. **Autenticação**: método padrão de usuário e senha com sessão, criação de usuários pelo
   Administrador. Não há autocadastro público.
5. **Média simples dos percentuais**: mantida como indicador secundário opcional, conforme PRD §8.1,
   sempre rotulada e nunca em posição de destaque.
6. **Índice de Prioridade Pedagógica (IPP)**: a ordenação de estudantes do MVP usa os critérios de
   agrupamento por nível e percentual geral. O IPP numérico do PRD §11.3 é tratado como refinamento
   posterior, por não ser necessário para atender à pergunta "quem precisa de atenção".
7. **Retenção de dados**: *(revista em 2026-08-27, após `/speckit-analyze`)* o **arquivo original**,
   que contém nomes de crianças, é retido por prazo configurável de **90 dias** após a confirmação e
   depois excluído automaticamente (FR-038a a FR-038c). O prazo separa duas necessidades que antes
   estavam confundidas: conferir uma importação recente contra a fonte, o que se resolve em semanas,
   e provar o que foi importado, o que o SHA-256 resolve para sempre sem guardar nome algum. Os
   **resultados** derivados são retidos enquanto a avaliação estiver ativa, com exclusão sob ação
   explícita do Administrador registrada em auditoria. **O prazo de 90 dias é um padrão técnico
   defensável, não um parecer jurídico** — cabe à rede confirmá-lo à luz da sua política de dados.
8. **Volume**: dimensionamento para arquivos de até alguns milhares de registros por importação,
   compatível com a realidade de uma rede municipal.
9. **Idioma dos dados**: os arquivos chegam em português do Brasil; não há requisito de
   internacionalização.
10. **Alcance do código único no MVP**: o código único cria e preserva a *identidade* do estudante
    entre avaliações. A *análise* longitudinal — comparação de evolução entre ciclos — permanece
    fora do MVP, conforme PRD §43 (Fase 3). O MVP entrega o código, a vinculação e o histórico de
    vínculos; não entrega telas de evolução.
11. **Semelhança de nomes na vinculação assistida**: a sugestão de candidatos considera nome
    normalizado igual ou próximo dentro da mesma escola. O critério de proximidade é decisão de
    implementação; o requisito inegociável é que nenhuma sugestão seja aplicada sem confirmação
    humana (FR-142).

Padrões simples adotados para o MVP em pontos de baixo risco, revisados na sessão de clarificação de
2026-08-27 e mantidos deliberadamente enxutos para não ampliar escopo:

12. **Autorização de dados nominais**: *(revista em 2026-08-27, após `/speckit-analyze`)* é uma
    **permissão específica por usuário**, e não uma consequência do perfil. O PRD §30 pede
    "permissão específica" e o Princípio IV da constituição exige menor privilégio — um analista
    municipal que trabalha sobre agregados não precisa do nome de milhares de crianças. Padrão na
    criação: concedida a Administrador e ao perfil Escola, negada a Gestor/Analista, alterável pelo
    Administrador. Quem não a possui **recebe a versão agregada**, nunca uma negação (FR-007,
    FR-007a, FR-105). O escopo de escola é controle separado e independente deste.
13. **Exclusão de importação**: remove os resultados dos cálculos e de todas as telas. O registro de
    auditoria e os metadados da importação — arquivo, autor, data/hora, contagens — permanecem, por
    não conterem dado pessoal (FR-009).
14. **Planilhas com múltiplas abas**: a primeira aba é usada por padrão, e o usuário pode escolher
    outra antes da validação.
15. **Mapeamento de colunas**: o mapeamento é revisado a cada importação. Não há modelo de
    mapeamento salvo e reutilizável no MVP.
16. **Persistência de filtros**: os filtros valem durante a navegação e não são preservados entre
    sessões.
17. **Escopo do mapa de calor**: apresentado no nível de turma e em recortes filtrados equivalentes.
    Não há mapa de calor de avaliação inteira no MVP, por perder legibilidade em centenas de linhas.
18. **Geração de relatórios**: síncrona, com retorno imediato ao usuário. Processamento em fila fica
    para quando o volume justificar.
19. **Ordem de operação**: o cadastro dos estudantes precede a aplicação e a importação da avaliação.
    A importação de resultados reconcilia com a base cadastral; ela não é mais o momento em que a
    identidade nasce. Isso reduz a frequência das colisões de chave, mas não elimina a regra:
    FR-147, FR-148 e FR-152 continuam valendo e passam a proteger a base cadastral, não o arquivo.
20. **Homônimos e obrigatoriedade do código**: como o cadastro permite dois estudantes de mesmo nome
    na mesma turma (FR-175), a coluna de código único deixa de ser conveniência e passa a ser
    necessária no arquivo de resultados sempre que houver homônimos naquela turma (FR-176).
21. **Estudante fora do cadastro**: tratado como `WARNING` com criação assistida na pré-visualização,
    e não como `ERROR`, para não impedir o registro de quem ingressou depois do cadastro inicial. É
    o único ponto desta revisão em que se optou por não bloquear.

---

## Dependências e Restrições

- Esta especificação é governada pela constituição do projeto v1.0.0. Em caso de conflito, prevalece
  a constituição — em especial os Princípios I (fidelidade), II (cálculo por itens), III
  (classificação oficial) e X (teste de referência).
- O arquivo de referência do II Ciclo é dependência de teste obrigatória e deve permanecer
  disponível ao time de desenvolvimento, sob as mesmas restrições de acesso dos demais dados
  nominais.
- Nenhuma decisão de tecnologia é feita nesta etapa; ela pertence a `/speckit-plan`.

---

## Fora do Escopo desta Feature

Confirmando o PRD §42 e o Princípio IX da constituição, o MVP **não** inclui: aplicação da prova;
geração de questões; lançamento de respostas item a item; diário escolar; substituição da
classificação oficial; diagnóstico automático por IA; plano de aula automático; **vinculação
automática de estudantes por semelhança de nome** (a vinculação existe, mas sempre por código ou com
confirmação humana — FR-137 a FR-143); **telas de comparação de evolução entre ciclos** (o código
único torna a análise possível no futuro, mas ela não faz parte deste MVP); comparação entre escolas;
painéis municipais; importação em lote; registro de intervenções e metas de recuperação.

---

## Questões em Aberto

Nenhuma. As duas questões que permaneciam abertas — comportamento na reimportação e correção pontual
após a confirmação — foram resolvidas na sessão de clarificação de 2026-08-27 e estão registradas em
*Clarifications*, com os requisitos correspondentes em FR-153 e FR-154.
