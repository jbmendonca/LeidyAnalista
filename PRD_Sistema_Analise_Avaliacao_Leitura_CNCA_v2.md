# PRD — Sistema Web de Análise e Consolidação das Avaliações de Leitura

**Produto:** Painel de Análise de Leitura — II Ciclo do Compromisso Nacional Criança Alfabetizada  
**Versão:** 2.0 — revisada a partir da estrutura real da planilha de resultados  
**Componente Curricular:** Língua Portuguesa — Leitura

---

## 1. Visão Geral

### 1.1 Contexto

Os resultados das avaliações de Leitura do II Ciclo do Compromisso Nacional Criança Alfabetizada são recebidos em arquivos tabulares sem consolidação pedagógica suficiente para apoiar a tomada de decisão.

A planilha real analisada contém, por estudante:

- rede;
- ano escolar;
- componente curricular;
- estado;
- município;
- código da turma;
- turma;
- estudante;
- situação de participação na avaliação;
- nível de aprendizagem;
- resultados de H01 a H12.

Os resultados das habilidades **não são percentuais prontos**. Eles são apresentados no formato:

```text
acertos / quantidade de itens
```

Exemplos:

```text
H01 = 1 / 1
H03 = 2 / 3
H05 = 1 / 2
```

O sistema deverá transformar automaticamente esses valores em percentuais e consolidá-los por estudante, turma, escola, habilidade e avaliação.

### 1.2 Problema

A planilha permite visualizar resultados individuais, mas exige trabalho manual para responder perguntas essenciais, como:

1. Quais habilidades apresentaram maior fragilidade em cada turma?
2. Quais habilidades apresentam maior fragilidade no conjunto analisado?
3. Quais estudantes estão em nível de aprendizagem que exige maior atenção?
4. Em quais habilidades cada estudante apresenta dificuldade?
5. Qual turma concentra maior percentual de estudantes em Defasagem ou Intermediário?
6. Quantos estudantes não foram avaliados?
7. Quais fragilidades aparecem de forma recorrente entre diferentes turmas?

---

## 2. Objetivo do Produto

Desenvolver um sistema web responsivo capaz de:

1. importar a planilha real de resultados;
2. reconhecer e tratar automaticamente sua estrutura;
3. converter resultados no formato `acertos / total de itens` em percentuais;
4. preservar a classificação de **Nível de aprendizagem** recebida na fonte;
5. identificar habilidades com maior fragilidade por turma;
6. identificar estudantes que necessitam de atenção pedagógica;
7. apresentar análises consolidadas por turma, estudante, habilidade, escola e avaliação;
8. gerar dashboards e relatórios de fácil interpretação;
9. manter histórico das avaliações importadas.

---

# 3. Estrutura Real da Fonte de Dados

## 3.1 Formato identificado

A planilha real recebida possui as seguintes características:

- formato do arquivo: CSV;
- separador identificado: `;`;
- codificação: UTF-8 com BOM;
- uma linha por estudante/turma;
- resultados das habilidades apresentados como fração de acertos;
- existência de estudantes não avaliados com habilidades vazias;
- ausência de coluna de escola;
- ausência de identificador único do estudante.

O sistema não deverá depender exclusivamente dessas características, mas deverá suportá-las nativamente.

## 3.2 Colunas reais

| Campo na planilha | Tipo | Tratamento |
|---|---|---|
| Rede | Texto | Preservar |
| Ano Escolar | Texto | Preservar e normalizar para filtros |
| Componente Curricular | Texto | Preservar |
| Estado | Texto | Preservar |
| Município | Texto | Preservar |
| Código da Turma | Texto | Remover espaços extras nas extremidades |
| Turma | Texto | Preservar |
| Estudante | Texto | Preservar nome original |
| Avaliado | Sim/Não | Usar para controle de participação |
| Nível de aprendizagem | Texto | Preservar classificação da fonte |
| H 01 | Acertos / Itens | Converter para percentual |
| H 02 | Acertos / Itens | Converter para percentual |
| H 03 | Acertos / Itens | Converter para percentual |
| H 04 | Acertos / Itens | Converter para percentual |
| H 05 | Acertos / Itens | Converter para percentual |
| H 06 | Acertos / Itens | Converter para percentual |
| H 07 | Acertos / Itens | Converter para percentual |
| H 08 | Acertos / Itens | Converter para percentual |
| H 09 | Acertos / Itens | Converter para percentual |
| H 10 | Acertos / Itens | Converter para percentual |
| H 11 | Acertos / Itens | Converter para percentual |
| H 12 | Acertos / Itens | Converter para percentual |

---

# 4. Catálogo de Habilidades

O sistema deverá possuir o catálogo das habilidades da avaliação.

| Habilidade | Código | Itens observados na planilha | Descrição |
|---|---|---:|---|
| H01 | 2EF08_P | 1 | Localizar informações explícitas em textos, recuperadas por meio de paráfrase. |
| H02 | 2EF14_P | 1 | Inferir o sentido de palavra ou expressão idiomática própria da linguagem informal, com base em pistas co-textuais, como sinonímia ou palavra do mesmo campo semântico. |
| H03 | 3EF17_P | 3 | Reconhecer o gênero de um texto do campo da vida pública. |
| H04 | 4EF08_P | 1 | Reconhecer o assunto de notícias quando o assunto é apontado indiretamente pela manchete e/ou é tópico do primeiro parágrafo do texto. |
| H05 | 4EF10_P | 2 | Inferir informação em texto exclusivamente verbal com base numa paráfrase, na dedução a partir de um enunciado ou na conexão entre enunciados. |
| H06 | 4EF12_P | 2 | Inferir o sentido de palavra pouco usual ou expressão metafórica, com base em pistas co-textuais em textos de qualquer campo de atuação. |
| H07 | 4EF14_P | 2 | Inferir efeitos de humor em textos que conjugam linguagem verbal e não verbal. |
| H08 | 4EF16_P | 2 | Reconhecer o narrador em narrativas ficcionais, quando se trata do narrador em primeira pessoa. |
| H09 | 4EF19_P | 2 | Identificar a finalidade de textos do campo da vida pública, como cartazes de conscientização e regras de convivência. |
| H10 | 4EF22_P | 1 | Reconhecer relações lógico-discursivas de causalidade marcadas por conjunções mais usuais em textos do campo da vida cotidiana e do campo artístico-literário. |
| H11 | 4EF24_P | 2 | Identificar o referente de pronomes pessoais do caso reto, em relação anafórica com referente próximo, em textos do campo da vida cotidiana e artístico-literário. |
| H12 | 5EF04_P | 3 | Reconhecer o assunto de textos de qualquer campo de atuação quando o assunto é indicado indiretamente pelo título e/ou é tópico do primeiro parágrafo do texto. |

### 4.1 Total de itens observado

Na planilha real, a soma dos denominadores das habilidades corresponde a:

```text
1 + 1 + 3 + 1 + 2 + 2 + 2 + 2 + 2 + 1 + 2 + 3 = 22 itens
```

O sistema **não deverá fixar 22 itens no código**.

A quantidade de itens deverá ser lida do denominador existente no arquivo e validada durante a importação, permitindo que futuras avaliações utilizem quantitativos diferentes.

---

# 5. Regra de Conversão das Habilidades

Para cada estudante e habilidade:

```text
Percentual da habilidade =
Quantidade de acertos
÷
Quantidade de itens da habilidade
× 100
```

Exemplos:

```text
1 / 1 = 100%
0 / 1 = 0%

1 / 2 = 50%
2 / 2 = 100%

1 / 3 = 33,33%
2 / 3 = 66,67%
3 / 3 = 100%
```

O sistema deverá armazenar separadamente:

- quantidade de acertos;
- quantidade de itens possíveis;
- percentual calculado.

Exemplo:

```text
H03_original = "2 / 3"
H03_acertos = 2
H03_total_itens = 3
H03_percentual = 66,67
```

---

# 6. Regra para Estudantes Não Avaliados

A planilha possui o campo:

```text
Avaliado
```

com valores:

```text
Sim
Não
```

Quando:

```text
Avaliado = Não
```

o sistema deverá:

1. classificar o estudante como **Não avaliado**;
2. manter as habilidades sem resultado como `null`;
3. não transformar células vazias em zero;
4. não incluir o estudante no denominador dos cálculos de desempenho;
5. incluir o estudante nos indicadores de participação;
6. permitir filtro específico de não avaliados.

### Exemplo

```text
Matriculados/importados: 30
Avaliados: 27
Não avaliados: 3

Taxa de participação = 90%
```

---

# 7. Nível de Aprendizagem

A planilha real já fornece o campo:

```text
Nível de aprendizagem
```

com as categorias observadas:

```text
Defasagem
Intermediário
Adequado
-
```

## 7.1 Regra principal

O sistema deverá **preservar e utilizar a classificação recebida na fonte**.

Não deverá substituir automaticamente essa classificação por faixas próprias sem que exista uma regra oficial devidamente cadastrada.

## 7.2 Tratamento

| Valor da fonte | Situação no sistema |
|---|---|
| Defasagem | Prioridade pedagógica elevada |
| Intermediário | Necessita atenção/acompanhamento |
| Adequado | Desempenho adequado segundo a classificação da fonte |
| `-` com Avaliado = Não | Não avaliado |

A expressão "prioridade pedagógica" é um indicador operacional do sistema e não altera a classificação oficial recebida.

## 7.3 Baixo rendimento

Para fins de filtros e painéis, o administrador deverá poder definir quais níveis serão considerados como **baixo rendimento**.

Configuração inicial sugerida:

```text
Defasagem = baixo rendimento / prioridade alta
Intermediário = atenção pedagógica
Adequado = adequado
```

O sistema também deverá disponibilizar uma visão opcional:

```text
Abaixo do adequado = Defasagem + Intermediário
```

Essa visão deverá ser claramente identificada como regra analítica do sistema, e não como nova classificação oficial.

---

# 8. Cálculo do Desempenho Geral do Estudante

O PRD anterior considerava a média simples dos percentuais H01 a H12.

A estrutura real demonstra que isso não é adequado como indicador principal, pois cada habilidade possui quantidade diferente de itens.

O cálculo principal deverá ser:

```text
Percentual geral do estudante =
Soma dos acertos em todas as habilidades válidas
÷
Soma dos itens possíveis das habilidades válidas
× 100
```

### Exemplo

```text
Acertos totais = 15
Itens possíveis = 22

Desempenho geral = 15 / 22 × 100
Desempenho geral = 68,18%
```

## 8.1 Regra de ponderação

Esse cálculo pondera naturalmente cada habilidade pela quantidade de itens que efetivamente compõem a avaliação.

O sistema poderá apresentar, como indicador secundário e opcional:

```text
Média simples dos percentuais das habilidades
```

Porém, essa média **não deverá substituir o percentual geral por itens**.

## 8.2 Relação com o Nível de Aprendizagem

O percentual geral calculado deverá ser utilizado para análise quantitativa.

O campo `Nível de aprendizagem` recebido da fonte deverá continuar sendo a classificação principal.

O sistema não deverá inferir automaticamente as faixas oficiais de Defasagem, Intermediário e Adequado apenas observando os resultados da planilha.

Se futuramente forem fornecidos os pontos de corte oficiais, eles poderão ser cadastrados e utilizados para validação.

---

# 9. Cálculo da Fragilidade por Habilidade

Para uma turma, escola ou conjunto filtrado:

```text
Percentual de acerto da habilidade =
Soma dos acertos obtidos na habilidade
÷
Soma dos itens possíveis da habilidade entre os alunos avaliados
× 100
```

### Exemplo

Se H03 possui 3 itens e há 20 estudantes avaliados:

```text
Itens possíveis = 20 × 3 = 60
Acertos obtidos = 37

Percentual de acerto da habilidade = 37 / 60 × 100
Percentual = 61,67%
```

## 9.1 Ranking de fragilidade

As habilidades deverão poder ser ordenadas:

1. menor percentual de acerto;
2. maior percentual de estudantes com desempenho inferior ao limite configurado;
3. maior quantidade de estudantes com dificuldade;
4. maior perda de pontos possíveis.

O ranking padrão será:

```text
menor percentual de acerto → maior fragilidade
```

---

# 10. Critério de Fragilidade Individual por Habilidade

Como cada habilidade possui 1, 2 ou 3 itens, uma classificação excessivamente granular pode gerar interpretações artificiais.

O sistema deverá sempre exibir primeiro o resultado original:

```text
1 / 2
```

e o percentual correspondente:

```text
50%
```

O administrador poderá definir um limite analítico para sinalização de fragilidade.

Configuração inicial sugerida:

```text
Percentual < 60% = Fragilidade
Percentual entre 60% e 79,99% = Atenção
Percentual >= 80% = Desempenho satisfatório na habilidade
```

Essas faixas deverão ser:

- configuráveis;
- identificadas como critérios analíticos do sistema;
- distintas do campo oficial `Nível de aprendizagem`.

---

# 11. Priorização dos Estudantes

A tela da turma deverá priorizar estudantes utilizando múltiplos sinais.

## 11.1 Critérios principais

1. Nível de aprendizagem da fonte;
2. percentual geral por itens;
3. quantidade de habilidades em fragilidade;
4. quantidade de habilidades em atenção;
5. presença de ausência de dados;
6. quantidade de acertos totais.

## 11.2 Ordenação sugerida

```text
1. Defasagem
2. Intermediário
3. Adequado
4. Não avaliado em lista própria
```

Dentro de cada grupo, ordenar do menor para o maior percentual geral.

## 11.3 Índice auxiliar de prioridade

O sistema poderá gerar um **Índice de Prioridade Pedagógica — IPP**, sem substituir o nível oficial.

Exemplo inicial:

```text
Nível Defasagem = +5 pontos
Nível Intermediário = +3 pontos
Cada habilidade em fragilidade = +2 pontos
Cada habilidade em atenção = +1 ponto
```

A regra deverá ser configurável.

---

# 12. Identificação do Estudante

A planilha real **não possui ID único do estudante**.

Portanto, o sistema não deverá usar apenas o nome como identificador global.

## 12.1 Chave do registro na avaliação

Para evitar duplicidades dentro de uma importação:

```text
Avaliação
+ Código da Turma normalizado
+ Nome do estudante normalizado
```

## 12.2 Nome repetido em turmas diferentes

Se o mesmo nome aparecer em turmas diferentes, os registros deverão permanecer separados.

O sistema deverá sinalizar:

```text
Possível estudante duplicado ou transferido
```

mas não poderá consolidar automaticamente os registros sem identificador confiável.

## 12.3 Evolução futura

Para comparação longitudinal do mesmo estudante entre ciclos, deverá existir um mecanismo de:

- importação de ID oficial, caso disponível em outra fonte; ou
- vinculação manual assistida.

---

# 13. Identificação da Escola

A planilha real analisada não possui coluna de escola.

Como o produto deverá permitir consolidação por escola, o sistema deverá exigir o vínculo da importação com uma escola quando essa informação não estiver no arquivo.

## 13.1 Fluxo

Antes ou imediatamente após o upload:

```text
Escola da importação: [selecionar]
Avaliação: [selecionar]
Arquivo: [enviar]
```

## 13.2 Regra

Se a coluna de escola existir em futuras versões da planilha:

```text
Sistema identifica automaticamente
↓
Usuário confirma
```

Se não existir:

```text
Usuário seleciona a escola
↓
Todos os registros daquele arquivo recebem escola_id
```

## 13.3 Importação em lote

O sistema poderá permitir vários arquivos no mesmo lote, desde que cada arquivo seja vinculado à escola correspondente.

---

# 14. Importação do Arquivo

## 14.1 Formatos

O sistema deverá aceitar:

- CSV;
- XLSX;
- XLS.

## 14.2 Detecção automática

Para CSV, deverá detectar ou permitir configurar:

- separador;
- codificação;
- cabeçalho.

A estrutura real deverá funcionar diretamente com:

```text
Separador = ;
Codificação = UTF-8 BOM
```

## 14.3 Mapeamento de colunas

O sistema deverá reconhecer variações como:

```text
H 01
H01
H_01
H 01 (2EF08_P)
```

e associá-las à habilidade correta.

---

# 15. Parser do Campo `acertos / itens`

O sistema deverá interpretar padrões como:

```text
1 / 1
0 / 1
2 / 3
1/2
 2 / 2
```

## 15.1 Validações

São inválidos:

```text
2 / 1
-1 / 2
1 / 0
texto
120%
```

quando a coluna estiver sendo interpretada no formato de fração.

## 15.2 Regras

Deve ser garantido:

```text
acertos >= 0
total_itens > 0
acertos <= total_itens
```

---

# 16. Normalização

Durante a importação:

- remover BOM;
- preservar UTF-8 e acentos;
- remover espaços extras nas extremidades;
- preservar o nome original para exibição;
- criar versões normalizadas apenas para busca e comparação;
- remover espaços externos de `Código da Turma`;
- tratar campos vazios como `null`;
- normalizar `Sim` e `Não`;
- normalizar nomes de níveis sem alterar o valor de origem armazenado;
- não transformar ausência em zero.

---

# 17. Validações de Consistência

O sistema deverá verificar:

1. estudante sem nome;
2. código da turma ausente;
3. turma ausente;
4. valor de habilidade inválido;
5. numerador maior que denominador;
6. estudante marcado como `Não` avaliado com resultados preenchidos;
7. estudante marcado como `Sim` avaliado sem resultados;
8. nível de aprendizagem vazio em aluno avaliado;
9. possível duplicidade;
10. quantidade de itens diferente da esperada para a mesma habilidade dentro da mesma avaliação;
11. coluna de habilidade ausente;
12. habilidades extras não cadastradas.

## 17.1 Validação dos denominadores

Dentro da mesma avaliação, se H03 aparecer como:

```text
3 itens para a maioria dos alunos
```

e em uma linha aparecer:

```text
1 / 2
```

o sistema deverá sinalizar:

```text
Quantidade de itens divergente em H03.
```

Não corrigir silenciosamente.

---

# 18. Pré-visualização da Importação

Antes de salvar os dados:

```text
Arquivo: resultados.csv
Escola: Escola X
Avaliação: II Ciclo — Leitura

Registros encontrados: 111
Registros avaliados: 106
Registros não avaliados: 5
Turmas identificadas: 4
Habilidades identificadas: 12
Inconsistências críticas: 0
Alertas: X
```

O usuário deverá confirmar a importação.

---

# 19. Dashboard Geral

O dashboard da avaliação deverá exibir:

### Participação

- estudantes importados;
- avaliados;
- não avaliados;
- taxa de participação.

### Desempenho

- percentual geral de acertos;
- distribuição por Nível de aprendizagem;
- quantidade em Defasagem;
- quantidade em Intermediário;
- quantidade em Adequado;
- percentual abaixo do adequado, quando essa visão estiver habilitada.

### Habilidades

- habilidade com menor percentual;
- habilidade com maior percentual;
- ranking completo H01 a H12;
- percentual de acerto de cada habilidade.

### Turmas

- turma com menor desempenho geral;
- turma com maior percentual de Defasagem;
- turma com maior percentual abaixo do adequado;
- habilidade mais frágil por turma.

---

# 20. Dashboard por Turma

Ao abrir uma turma, apresentar:

```text
Turma
Código da turma
Escola
Ano Escolar
Componente Curricular
Total de estudantes
Avaliados
Não avaliados
Taxa de participação
Percentual geral de acertos
Distribuição por nível
Habilidade mais frágil
Habilidade com melhor desempenho
```

## 20.1 Tabela de habilidades

| Habilidade | Código | Acertos | Itens possíveis | % de acerto | Posição |
|---|---|---:|---:|---:|---:|
| H07 | 4EF14_P | 31 | 52 | 59,62% | 1 |
| H05 | 4EF10_P | 48 | 52 | 92,31% | 2 |

A ordenação padrão será da maior fragilidade para o melhor desempenho.

---

# 21. Tabela de Estudantes da Turma

| Estudante | Avaliado | Nível | Acertos | Itens | % Geral | Fragilidades |
|---|---|---|---:|---:|---:|---:|
| Estudante A | Sim | Defasagem | 8 | 22 | 36,36% | 7 |
| Estudante B | Sim | Intermediário | 13 | 22 | 59,09% | 4 |
| Estudante C | Sim | Adequado | 20 | 22 | 90,91% | 1 |
| Estudante D | Não | Não avaliado | — | — | — | — |

Permitir ordenar e filtrar.

---

# 22. Mapa de Calor

O mapa de calor deverá exibir:

| Estudante | Nível | H01 | H02 | H03 | H04 | H05 | H06 | H07 | H08 | H09 | H10 | H11 | H12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

Cada célula deverá exibir, em tooltip ou detalhe:

```text
H03
Resultado: 2 / 3
Percentual: 66,67%
Descrição: Reconhecer o gênero de um texto do campo da vida pública.
```

A cor será baseada na faixa analítica configurada, mas o valor numérico deverá permanecer visível/acessível.

---

# 23. Tela por Habilidade

Ao selecionar uma habilidade:

```text
H07 — 4EF14_P
Inferir efeitos de humor em textos que conjugam linguagem verbal e não verbal.
```

Exibir:

- quantidade de itens da habilidade;
- estudantes avaliados;
- total de acertos;
- total de itens possíveis;
- percentual de acerto;
- distribuição dos estudantes pelos resultados possíveis;
- comparação entre turmas;
- estudantes com maior dificuldade;
- ranking das turmas.

### Exemplo para habilidade com 2 itens

```text
0 / 2
1 / 2
2 / 2
```

Além do percentual médio, essa distribuição deverá ser apresentada porque fornece informação pedagógica relevante.

---

# 24. Ficha Individual do Estudante

A ficha deverá apresentar:

### Identificação

- estudante;
- escola;
- turma;
- código da turma;
- ano escolar.

### Participação

- avaliado: Sim/Não.

### Resultado geral

- nível de aprendizagem da fonte;
- acertos totais;
- itens possíveis;
- percentual geral;
- quantidade de habilidades com fragilidade;
- quantidade de habilidades em atenção.

### Resultado detalhado

| Habilidade | Código | Resultado | Percentual | Situação analítica |
|---|---|---|---:|---|
| H01 | 2EF08_P | 1 / 1 | 100% | Satisfatório |
| H03 | 3EF17_P | 1 / 3 | 33,33% | Fragilidade |
| H05 | 4EF10_P | 1 / 2 | 50% | Fragilidade |

---

# 25. Distribuição por Nível de Aprendizagem

O sistema deverá apresentar gráfico e tabela:

```text
Adequado
Intermediário
Defasagem
Não avaliado
```

O denominador da distribuição de nível deverá ser configurado corretamente:

### Distribuição de aprendizagem

```text
Somente alunos avaliados
```

### Participação

```text
Todos os registros importados
```

Nunca incluir alunos não avaliados como se estivessem em Defasagem.

---

# 26. Análise por Escola

Como a escola será associada à importação, permitir:

- total de turmas;
- total de estudantes;
- taxa de participação;
- percentual geral de acertos;
- distribuição por nível;
- ranking de habilidades;
- ranking de turmas;
- estudantes em Defasagem;
- estudantes em Intermediário;
- não avaliados.

---

# 27. Consolidação de Múltiplas Escolas

Quando houver várias escolas importadas na mesma avaliação:

```text
Avaliação
 ├── Escola A
 │   ├── Turma A
 │   ├── Turma B
 │   └── Turma C
 ├── Escola B
 │   ├── Turma A
 │   └── Turma B
 └── Escola C
```

O sistema deverá permitir análise:

- geral;
- por escola;
- por turma;
- por habilidade;
- por estudante.

---

# 28. Filtros

Filtros principais:

- avaliação;
- rede;
- estado;
- município;
- escola;
- ano escolar;
- componente curricular;
- turma;
- código da turma;
- avaliado;
- nível de aprendizagem;
- habilidade;
- estudante;
- faixa de percentual geral;
- situação analítica da habilidade.

---

# 29. Relatórios

## 29.1 Relatório Geral da Avaliação

- participação;
- distribuição por nível;
- desempenho geral;
- ranking das habilidades;
- comparação das escolas;
- comparação das turmas;
- estudantes em prioridade pedagógica.

## 29.2 Relatório da Escola

- resumo;
- participação;
- distribuição por nível;
- ranking das habilidades;
- ranking das turmas;
- estudantes em Defasagem e Intermediário;
- não avaliados.

## 29.3 Relatório da Turma

- resumo da turma;
- desempenho geral;
- distribuição por nível;
- ranking H01 a H12;
- mapa de calor;
- lista de estudantes;
- habilidades frágeis.

## 29.4 Relatório da Habilidade

- descrição;
- total de itens;
- percentual geral;
- comparação entre turmas;
- distribuição `0/n`, `1/n`, etc.;
- estudantes com dificuldade.

## 29.5 Relatório Individual

- identificação;
- nível;
- acertos totais;
- percentual;
- H01 a H12;
- fragilidades individuais.

---

# 30. Exportações

Permitir:

- XLSX;
- CSV;
- PDF.

As exportações deverão respeitar os filtros aplicados.

Para proteção de dados, relatórios nominais deverão exigir permissão específica.

---

# 31. Histórico

Cada importação deverá registrar:

```text
id
avaliação
escola
arquivo original
data/hora
usuário
quantidade de registros
quantidade de avaliados
quantidade de não avaliados
quantidade de turmas
inconsistências
status
```

---

# 32. Auditoria

Registrar:

- usuário que importou;
- usuário que excluiu;
- data/hora;
- alterações de parametrização;
- regras de faixa vigentes;
- reprocessamentos.

---

# 33. Modelo de Dados

## 33.1 Avaliação

```text
id
nome
ano
ciclo
componente_curricular
data_aplicacao
status
```

## 33.2 Escola

```text
id
codigo
nome
rede
municipio
estado
```

## 33.3 Turma

```text
id
escola_id
codigo_externo
nome
ano_escolar
```

## 33.4 Estudante

```text
id
nome_original
nome_normalizado
codigo_externo nullable
```

## 33.5 Resultado do Estudante na Avaliação

```text
id
avaliacao_id
escola_id
turma_id
estudante_id
avaliado
nivel_aprendizagem_original
acertos_totais
itens_totais
percentual_geral
```

## 33.6 Habilidade

```text
id
codigo_curto
codigo_referencia
descricao
```

## 33.7 Resultado por Habilidade

```text
id
resultado_estudante_id
habilidade_id
valor_original
acertos
itens_possiveis
percentual
```

## 33.8 Importação

```text
id
avaliacao_id
escola_id
nome_arquivo
hash_arquivo
usuario_id
data_importacao
registros_total
registros_validos
registros_alerta
registros_erro
```

---

# 34. Requisitos Funcionais

## RF-001 — Autenticação
Permitir autenticação de usuários.

## RF-002 — Cadastro de avaliação
Permitir criar e selecionar uma avaliação.

## RF-003 — Cadastro/seleção da escola
Exigir escola quando ela não estiver presente no arquivo.

## RF-004 — Upload
Aceitar CSV, XLSX e XLS.

## RF-005 — CSV com ponto e vírgula
Processar corretamente arquivos separados por `;`.

## RF-006 — UTF-8
Preservar caracteres acentuados.

## RF-007 — Mapeamento
Reconhecer ou permitir mapear as colunas.

## RF-008 — Parser de habilidades
Converter `acertos / itens` em estrutura numérica.

## RF-009 — Não avaliados
Excluir não avaliados dos cálculos de desempenho.

## RF-010 — Nível de aprendizagem
Preservar o nível recebido na fonte.

## RF-011 — Percentual geral
Calcular percentual geral por soma de acertos / soma de itens.

## RF-012 — Percentual por habilidade
Calcular percentual consolidado de cada habilidade.

## RF-013 — Ranking de fragilidade
Ordenar habilidades da menor para a maior taxa de acerto.

## RF-014 — Análise por turma
Apresentar desempenho da turma.

## RF-015 — Análise por estudante
Apresentar ficha individual.

## RF-016 — Análise por habilidade
Apresentar detalhamento da habilidade.

## RF-017 — Distribuição por nível
Apresentar Defasagem, Intermediário e Adequado.

## RF-018 — Participação
Apresentar avaliados e não avaliados.

## RF-019 — Mapa de calor
Apresentar matriz estudante × habilidade.

## RF-020 — Filtros
Permitir filtros combinados.

## RF-021 — Exportação
Exportar relatórios.

## RF-022 — Histórico
Manter histórico das importações.

## RF-023 — Duplicidade
Detectar registros duplicados sem consolidar automaticamente nomes iguais em turmas diferentes.

## RF-024 — Validação de denominadores
Detectar divergência no total de itens de uma habilidade.

## RF-025 — Parametrização
Permitir configurar critérios analíticos de fragilidade e baixo rendimento.

---

# 35. Requisitos Não Funcionais

## RNF-001 — Responsividade
Desktop, tablet e smartphone.

## RNF-002 — Desempenho
Dashboards já processados deverão carregar rapidamente, preferencialmente em até 3 segundos em condições normais.

## RNF-003 — Privacidade
Os dados nominais dos estudantes deverão possuir acesso restrito.

## RNF-004 — LGPD
Observar princípios de finalidade, necessidade, segurança, controle de acesso, rastreabilidade e retenção.

## RNF-005 — Segurança
Utilizar HTTPS, autenticação, autorização por perfil e proteção contra vulnerabilidades comuns.

## RNF-006 — Acessibilidade
Não utilizar somente cores para representar níveis ou fragilidades.

## RNF-007 — Rastreabilidade
Manter o arquivo original e o log de transformação.

## RNF-008 — Reprocessamento
Permitir recalcular os indicadores caso parâmetros analíticos sejam alterados, sem alterar os valores originais importados.

---

# 36. Perfis de Usuário

## Administrador

Pode:

- administrar usuários;
- cadastrar escolas;
- cadastrar avaliações;
- importar;
- excluir;
- configurar regras analíticas;
- acessar dados nominais;
- exportar.

## Gestor/Analista

Pode:

- importar;
- analisar;
- filtrar;
- visualizar escolas e turmas autorizadas;
- exportar.

## Escola

Pode:

- visualizar apenas a própria escola;
- analisar turmas;
- consultar estudantes;
- gerar relatórios autorizados.

---

# 37. Critérios de Aceitação Baseados na Planilha Real

O MVP deverá ser considerado compatível quando processar corretamente um arquivo com a mesma estrutura do arquivo real analisado.

## Importação

- [ ] Reconhece 22 colunas da estrutura atual.
- [ ] Reconhece H 01 a H 12.
- [ ] Processa CSV separado por `;`.
- [ ] Preserva caracteres acentuados.
- [ ] Remove espaços externos do Código da Turma.
- [ ] Reconhece `Sim` e `Não` em Avaliado.
- [ ] Reconhece `Adequado`, `Intermediário`, `Defasagem` e `-`.
- [ ] Converte valores como `1 / 1`, `1 / 2` e `2 / 3`.
- [ ] Mantém células vazias como ausência de resultado.
- [ ] Não atribui zero aos estudantes não avaliados.

## Cálculos

- [ ] Soma numeradores corretamente.
- [ ] Soma denominadores corretamente.
- [ ] Calcula percentual geral por itens.
- [ ] Calcula percentual consolidado por habilidade.
- [ ] Exclui não avaliados do denominador de desempenho.
- [ ] Inclui não avaliados no indicador de participação.
- [ ] Mantém o nível de aprendizagem da fonte sem substituí-lo.

## Estrutura

- [ ] Utiliza Código da Turma como identificador externo da turma.
- [ ] Não depende de ID de estudante inexistente no arquivo.
- [ ] Não une automaticamente estudantes com mesmo nome em turmas diferentes.
- [ ] Permite informar a escola antes da importação quando ela não vier no arquivo.

---

# 38. Teste de Referência com o Arquivo Analisado

O arquivo utilizado para revisão deste PRD apresentou:

```text
111 registros de estudantes
4 turmas
106 estudantes marcados como Avaliado = Sim
5 estudantes marcados como Avaliado = Não
12 habilidades
22 itens possíveis por estudante avaliado
```

Distribuição de nível entre os **106 avaliados**:

```text
Adequado: 96
Intermediário: 7
Defasagem: 3
```

Esses números deverão ser utilizados como teste técnico de regressão do parser para este arquivo específico.

## 38.1 Resultado de referência das habilidades

No arquivo analisado, o cálculo consolidado por itens produz a seguinte ordem de fragilidade:

| Posição | Habilidade | Percentual aproximado |
|---:|---|---:|
| 1 | H07 | 70,75% |
| 2 | H05 | 75,94% |
| 3 | H06 | 79,25% |
| 4 | H10 | 83,96% |
| 5 | H12 | 84,59% |
| 6 | H11 | 84,91% |
| 7 | H09 | 86,32% |
| 8 | H03 | 87,42% |
| 9 | H04 | 88,68% |
| 10 | H01 | 89,62% |
| 11 | H02 | 90,57% |
| 12 | H08 | 91,98% |

Esses valores não são metas ou pontos de corte. Servem somente para validar se o sistema está calculando corretamente o arquivo de referência.

---

# 39. Fluxo Principal Atualizado

```text
Login
  ↓
Selecionar/Criar Avaliação
  ↓
Selecionar Escola
  ↓
Upload do CSV/XLSX
  ↓
Detectar estrutura
  ↓
Mapear colunas
  ↓
Interpretar H01:H12 como acertos / itens
  ↓
Validar Avaliado e Nível de aprendizagem
  ↓
Normalizar dados
  ↓
Pré-visualizar importação
  ↓
Confirmar
  ↓
Calcular indicadores
  ↓
Dashboard
  ├── Geral
  ├── Escola
  ├── Turma
  ├── Habilidade
  └── Estudante
```

---

# 40. User Stories Prioritárias

## US-001 — Importar a planilha real

**Como** analista educacional,  
**quero** enviar o CSV recebido da avaliação,  
**para** que o sistema trate automaticamente os dados.

### Aceite

```text
Dado um CSV com H01 a H12 no formato acertos / itens
Quando o usuário realizar o upload
Então o sistema deverá converter os valores em acertos, itens possíveis e percentual.
```

## US-002 — Não distorcer não avaliados

**Como** gestor,  
**quero** que estudantes não avaliados sejam separados dos resultados,  
**para** que a ausência não reduza artificialmente a média da turma.

### Aceite

```text
Dado Avaliado = Não
Quando os indicadores forem calculados
Então o estudante não deverá participar do denominador de desempenho.
```

## US-003 — Identificar habilidade frágil

**Como** coordenador pedagógico,  
**quero** ver as habilidades ordenadas pelo percentual de acerto da turma,  
**para** identificar rapidamente as maiores fragilidades.

## US-004 — Identificar estudantes prioritários

**Como** professor ou coordenador,  
**quero** visualizar primeiro estudantes em Defasagem e Intermediário,  
**para** planejar o acompanhamento.

## US-005 — Consultar detalhe da habilidade

**Como** técnico pedagógico,  
**quero** ver a distribuição dos resultados `0/n`, `1/n`, `2/n`,  
**para** compreender melhor a intensidade da dificuldade.

## US-006 — Trabalhar sem coluna de escola

**Como** analista,  
**quero** vincular o arquivo a uma escola no momento da importação,  
**para** consolidar resultados mesmo quando o CSV não informa a escola.

---

# 41. Métricas de Sucesso

- redução do tempo de consolidação manual;
- percentual de arquivos importados sem correções manuais;
- taxa de erros de importação;
- tempo entre upload e dashboard;
- número de turmas analisadas;
- número de relatórios gerados;
- frequência de consulta às habilidades frágeis;
- frequência de consulta aos estudantes em Defasagem e Intermediário.

---

# 42. Fora do Escopo do MVP

- aplicação da prova;
- geração de questões;
- lançamento de respostas questão por questão;
- diário escolar;
- substituição da classificação oficial da avaliação;
- diagnóstico automático por IA;
- plano de aula automático;
- vinculação automática de estudantes entre ciclos sem identificador confiável.

---

# 43. Roadmap

## Fase 1 — MVP

- autenticação;
- cadastro da avaliação;
- cadastro/seleção de escola;
- importação da estrutura real;
- parser `acertos / itens`;
- participação;
- nível de aprendizagem;
- análise de habilidades;
- análise de turma;
- análise individual;
- mapa de calor;
- filtros;
- exportações.

## Fase 2 — Consolidação ampliada

- múltiplas escolas;
- comparações entre escolas;
- importação em lote;
- painéis municipais;
- permissões por escola.

## Fase 3 — Evolução temporal

- comparação entre ciclos;
- evolução por estudante quando houver identificador confiável;
- evolução da turma;
- evolução da escola.

## Fase 4 — Gestão pedagógica

- registro de intervenções;
- metas de recuperação;
- acompanhamento das habilidades;
- plano de ação;
- alertas de recorrência.

---

# 44. Princípio Central do Produto

O sistema não deverá apenas reproduzir a planilha.

A principal entrega deverá ser transformar:

```text
1 / 2
2 / 3
0 / 1
```

em informação pedagógica acionável.

Ao abrir uma turma, o usuário deverá responder imediatamente:

> **Quais habilidades apresentaram as maiores fragilidades?**

e:

> **Quais estudantes precisam de maior atenção e em quais habilidades?**

Ao abrir uma avaliação, deverá responder:

> **Onde estão concentradas as principais fragilidades de aprendizagem e como elas se distribuem entre as turmas?**
