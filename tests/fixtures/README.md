# Fixtures de teste — Painel de Análise de Leitura

## Por que estas fixtures são anonimizadas

O arquivo de referência real do II Ciclo CNCA
(`HABILIDADES_DESEMPENHO_ESTUDANTE 26-08-2026 4-25-38.csv`, na raiz do projeto)
contém o **nome completo de 111 crianças**. Ele está no `.gitignore` e **nunca**
pode ser versionado.

`resultados-referencia.csv` é a cópia anonimizada desse arquivo: **apenas a
coluna `Estudante` foi substituída** por nomes sintéticos brasileiros. As outras
21 colunas — `Rede`, `Ano Escolar`, `Componente Curricular`, `Estado`,
`Município`, `Código da Turma` (com os espaços nas extremidades), `Turma`,
`Avaliado`, `Nível de aprendizagem` e as 12 colunas de habilidade — são
reproduzidas byte a byte, incluindo o formato ` 1 / 1` das células, o
separador `;`, o BOM UTF-8 e as quebras de linha.

**Todos os números foram preservados.** O teste de regressão que compara o
resultado do pipeline com os números do relatório oficial continua válido sobre
esta fixture.

## Como regenerar

```bash
PYTHONIOENCODING=utf-8 python scripts/gerar-fixtures.py
```

O mapeamento nome real → nome sintético é determinístico (nomes reais ordenados
recebem, em ordem, os nomes da lista sintética), então reexecutar o script
produz exatamente os mesmos arquivos. O script exige o arquivo real presente na
raiz; ele não é necessário para rodar os testes, apenas para regenerar.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `resultados-referencia.csv` | 111 registros anonimizados, 22 colunas, `;`, UTF-8 com BOM |
| `nominata-referencia.csv` | nominata de cadastro prévio derivada da fixture (111 linhas) |
| `casos-invalidos/` | CSVs pequenos, um por regra de validação do pipeline |

## Números esperados (contrato do teste de regressão)

| Indicador | Valor |
|---|---|
| Registros | 111 |
| Avaliados (`Avaliado = Sim`) | 106 |
| Não avaliados (`Avaliado = Não`) | 5 |
| Turmas distintas (`Código da Turma`) | 4 |
| Habilidades | 12 |

Distribuição do `Nível de aprendizagem` **entre os 106 avaliados**:

| Nível | Estudantes |
|---|---|
| Adequado | 96 |
| Intermediário | 7 |
| Defasagem | 3 |

Os 5 não avaliados trazem `` - `` no `Nível de aprendizagem` da fonte e ficam **fora** de todo
denominador de desempenho — ausência nunca vira zero.

### Itens por habilidade

| Habilidade | Itens |
|---|---|
| H 01 | 1 |
| H 02 | 1 |
| H 03 | 3 |
| H 04 | 1 |
| H 05 | 2 |
| H 06 | 2 |
| H 07 | 2 |
| H 08 | 2 |
| H 09 | 2 |
| H 10 | 1 |
| H 11 | 2 |
| H 12 | 3 |

### Desempenho por habilidade (Σ acertos ÷ Σ itens)

Nunca a média simples dos percentuais. Este é o ranking que o teste de regressão
reproduz:

| Posição | Habilidade | Acertos | Itens | Desempenho |
|---|---|---|---|---|
| 1 | H 07 | 150 | 212 | 70.75% |
| 2 | H 05 | 161 | 212 | 75.94% |
| 3 | H 06 | 168 | 212 | 79.25% |
| 4 | H 10 | 89 | 106 | 83.96% |
| 5 | H 12 | 269 | 318 | 84.59% |
| 6 | H 11 | 180 | 212 | 84.91% |
| 7 | H 09 | 183 | 212 | 86.32% |
| 8 | H 03 | 278 | 318 | 87.42% |
| 9 | H 04 | 94 | 106 | 88.68% |
| 10 | H 01 | 95 | 106 | 89.62% |
| 11 | H 02 | 96 | 106 | 90.57% |
| 12 | H 08 | 195 | 212 | 91.98% |

## Cenário de duplicidade preservado

Exatamente **um** estudante aparece em **duas turmas diferentes** no arquivo
real. Na fixture esse par continua sendo o **mesmo nome sintético** nas duas
turmas, de modo que o cenário de *possível duplicidade ou transferência*
permanece exercitável:

- **NICOLE LUZIA SAMPAIO BRANDÃO** — ` f9ni98377bc5 ` (4º ANO B) e ` wm1o8acc2bbb ` (4º ANO C)

## Casos inválidos

Cada arquivo em `casos-invalidos/` usa o mesmo cabeçalho de 22 colunas, tem
entre 5 e 8 linhas de dados e isola **uma** condição de erro. Todos os nomes são
sintéticos.

| Arquivo | Condição |
|---|---|
| `valor-invalido.csv` | célula com `texto` e célula com `120%` |
| `numerador-maior.csv` | célula ` 2 / 1` — acertos maiores que itens |
| `denominador-zero.csv` | célula ` 1 / 0` — divisão por zero |
| `valor-negativo.csv` | célula ` -1 / 2` — acertos negativos |
| `denominador-divergente.csv` | `H 03` com 3 itens na maioria e ` 1 / 2` em uma linha |
| `avaliado-sem-resultado.csv` | `Avaliado = Sim` com as 12 habilidades vazias |
| `nao-avaliado-com-resultado.csv` | `Avaliado = Não` com habilidades preenchidas |
| `nome-vazio.csv` | `Estudante` vazio em uma linha |
| `turma-vazia.csv` | `Código da Turma` vazio em uma linha |
| `chave-duplicada.csv` | duas linhas com a mesma turma e o mesmo nome |
| `nivel-vazio.csv` | `Avaliado = Sim` com `Nível de aprendizagem` vazio |
