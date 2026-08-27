#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Gerador determinístico das fixtures de teste anonimizadas.

O arquivo de referência real (HABILIDADES_DESEMPENHO_ESTUDANTE *.csv) contém o
NOME COMPLETO de 111 crianças e por isso NÃO é versionado (ver .gitignore).
Este script produz as fixtures versionáveis:

  tests/fixtures/resultados-referencia.csv   -> cópia anonimizada, números intactos
  tests/fixtures/nominata-referencia.csv     -> nominata derivada da fixture
  tests/fixtures/casos-invalidos/*.csv       -> casos de erro do pipeline
  tests/fixtures/README.md                   -> documentação dos números esperados

Regras:
  * APENAS a coluna "Estudante" é substituída. As outras 21 colunas são
    reescritas byte a byte como no original (inclusive os espaços nas
    extremidades de "Código da Turma" e dos valores " 1 / 1").
  * O mapeamento nome real -> nome sintético é determinístico: os nomes reais
    são ordenados e recebem, em ordem, os nomes da lista sintética. Reexecutar
    o script produz exatamente o mesmo arquivo.
  * O nome que aparece em DUAS turmas continua sendo o MESMO nome sintético nas
    duas turmas (o cenário "possível duplicidade ou transferência" segue
    exercitável).

Uso:
    PYTHONIOENCODING=utf-8 python scripts/gerar-fixtures.py
"""

from __future__ import annotations

import csv
import glob
import io
import os
import sys

# --------------------------------------------------------------------------- #
# Caminhos
# --------------------------------------------------------------------------- #

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PADRAO_ORIGEM = os.path.join(RAIZ, "HABILIDADES_DESEMPENHO_ESTUDANTE*.csv")
DIR_FIXTURES = os.path.join(RAIZ, "tests", "fixtures")
DIR_INVALIDOS = os.path.join(DIR_FIXTURES, "casos-invalidos")
SAIDA_RESULTADOS = os.path.join(DIR_FIXTURES, "resultados-referencia.csv")
SAIDA_NOMINATA = os.path.join(DIR_FIXTURES, "nominata-referencia.csv")
SAIDA_README = os.path.join(DIR_FIXTURES, "README.md")

DELIM = ";"
ESCOLA_FICTICIA = "ESCOLA MUNICIPAL DE DEMONSTRACAO"

COLUNAS = [
    "Rede",
    "Ano Escolar",
    "Componente Curricular",
    "Estado",
    "Município",
    "Código da Turma",
    "Turma",
    "Estudante",
    "Avaliado",
    "Nível de aprendizagem",
    "H 01",
    "H 02",
    "H 03",
    "H 04",
    "H 05",
    "H 06",
    "H 07",
    "H 08",
    "H 09",
    "H 10",
    "H 11",
    "H 12",
]
IDX_ESTUDANTE = COLUNAS.index("Estudante")

# --------------------------------------------------------------------------- #
# Vocabulário sintético — nenhum destes nomes vem do arquivo real
# --------------------------------------------------------------------------- #

PRENOMES_F = [
    "ANA BEATRIZ", "MARIA CLARA", "LARISSA", "GABRIELA", "SOPHIA",
    "ISADORA", "ELOÁ", "MANUELA", "HELENA", "VITÓRIA",
    "LUANA", "RAFAELA", "BEATRIZ", "CECÍLIA", "YASMIN",
    "MELISSA", "ALICE", "STELLA", "NICOLE",
]
MEIOS_F = [
    "APARECIDA", "CRISTINA", "REGINA", "DE FÁTIMA", "LUZIA",
    "DO CARMO", "SOLANGE", "VALENTINA", "DAS NEVES", "EDUARDA",
    "SIMONE",
]
PRENOMES_M = [
    "PEDRO HENRIQUE", "LUCAS", "GUILHERME", "DAVI", "MATHEUS",
    "ARTHUR", "SAMUEL", "BENÍCIO", "OTÁVIO", "ENZO GABRIEL",
    "MURILO", "THIAGO", "RICARDO", "VINÍCIUS", "CAIO",
    "BRENO", "IGOR", "LEANDRO", "NÍCOLAS",
]
MEIOS_M = [
    "AUGUSTO", "SEBASTIÃO", "DOS ANJOS", "VALDEMAR", "ANTÔNIO",
    "DO NASCIMENTO", "EMANUEL", "TARCÍSIO", "DAS DORES", "GONÇALO",
    "PATRÍCIO",
]
SOBRENOMES_1 = [
    "SOUZA", "OLIVEIRA", "PEREIRA", "CARVALHO", "MENDES",
    "BARBOSA", "TEIXEIRA", "MOREIRA", "CAVALCANTE", "SIQUEIRA",
    "MACHADO", "FONSECA", "PEIXOTO", "ANDRADE", "BITTENCOURT",
    "QUEIROZ", "SAMPAIO", "VASCONCELOS", "GUIMARÃES", "ARAGÃO",
    "MONTEIRO", "BALBINO", "TORRES", "PAIVA", "SERAFIM",
    "AZEVEDO", "ESTEVES", "FURTADO", "MAGALHÃES",
]
SOBRENOMES_2 = [
    "LIMA", "RIBEIRO", "GOMES", "MARTINS", "NUNES",
    "ROCHA", "BATISTA", "FREITAS", "CORDEIRO", "PONTES",
    "DUARTE", "AMORIM", "RESENDE", "SALGADO", "VIEIRA",
    "TAVARES", "BRANDÃO", "MARINHO", "CALDAS", "NOGUEIRA",
    "SEIXAS", "PIMENTEL", "VILELA",
]


def gerar_nomes_sinteticos(quantidade: int) -> list[str]:
    """Gera `quantidade` nomes sintéticos únicos, sempre na mesma ordem.

    Índices alternam feminino/masculino e usam módulos de tamanhos distintos,
    de modo que os pares (prenome, meio) não se repetem dentro do intervalo
    usado. Uma verificação final garante a unicidade.
    """
    nomes: list[str] = []
    for i in range(quantidade):
        feminino = i % 2 == 0
        j = i // 2
        prenomes = PRENOMES_F if feminino else PRENOMES_M
        meios = MEIOS_F if feminino else MEIOS_M
        prenome = prenomes[j % len(prenomes)]
        meio = meios[j % len(meios)]
        s1 = SOBRENOMES_1[i % len(SOBRENOMES_1)]
        s2 = SOBRENOMES_2[(i * 3 + 1) % len(SOBRENOMES_2)]
        if s1 == s2:
            s2 = SOBRENOMES_2[(i * 3 + 2) % len(SOBRENOMES_2)]
        nomes.append(f"{prenome} {meio} {s1} {s2}")
    if len(set(nomes)) != quantidade:
        raise SystemExit(
            f"colisão no gerador de nomes: {quantidade} pedidos, "
            f"{len(set(nomes))} únicos"
        )
    return nomes


# --------------------------------------------------------------------------- #
# Escrita
# --------------------------------------------------------------------------- #

def escrever_csv(caminho: str, linhas: list[list[str]], terminador: str) -> None:
    """Grava CSV com BOM, delimitador ';' e o terminador de linha do original.

    O original não termina com quebra de linha; a fixture reproduz isso.
    """
    buf = io.StringIO()
    escritor = csv.writer(buf, delimiter=DELIM, lineterminator=terminador)
    escritor.writerows(linhas)
    conteudo = buf.getvalue()
    if conteudo.endswith(terminador):
        conteudo = conteudo[: -len(terminador)]
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8-sig", newline="") as saida:
        saida.write(conteudo)


# --------------------------------------------------------------------------- #
# TAREFA 1 — fixture anonimizada
# --------------------------------------------------------------------------- #

def anonimizar() -> tuple[list[list[str]], str, dict[str, str]]:
    candidatos = sorted(glob.glob(PADRAO_ORIGEM))
    if not candidatos:
        raise SystemExit(
            "arquivo de referência real não encontrado em " + PADRAO_ORIGEM
        )
    origem = candidatos[0]

    bruto = open(origem, "rb").read()
    terminador = "\r\n" if b"\r\n" in bruto else "\n"

    with open(origem, encoding="utf-8-sig", newline="") as entrada:
        linhas = list(csv.reader(entrada, delimiter=DELIM))

    cabecalho, dados = linhas[0], linhas[1:]
    if cabecalho != COLUNAS:
        raise SystemExit(f"cabeçalho inesperado: {cabecalho}")
    for linha in dados:
        if len(linha) != len(COLUNAS):
            raise SystemExit(f"linha com {len(linha)} colunas: {linha[:3]}")

    # Mapeamento determinístico: nomes reais ordenados -> nomes sintéticos.
    # Um nome real recebe SEMPRE o mesmo nome sintético, mesmo aparecendo em
    # mais de uma turma (cenário de duplicidade/transferência preservado).
    reais = sorted({linha[IDX_ESTUDANTE] for linha in dados})
    sinteticos = gerar_nomes_sinteticos(len(reais))
    mapa = dict(zip(reais, sinteticos))

    anonimas = [list(linha) for linha in dados]
    for linha in anonimas:
        linha[IDX_ESTUDANTE] = mapa[linha[IDX_ESTUDANTE]]

    # Todas as outras 21 colunas devem estar intactas.
    for original, anonima in zip(dados, anonimas):
        for i in range(len(COLUNAS)):
            if i == IDX_ESTUDANTE:
                continue
            if original[i] != anonima[i]:
                raise SystemExit(f"coluna {COLUNAS[i]} foi alterada")

    escrever_csv(SAIDA_RESULTADOS, [cabecalho] + anonimas, terminador)
    return anonimas, terminador, mapa


# --------------------------------------------------------------------------- #
# TAREFA 2 — nominata derivada da fixture anonimizada
# --------------------------------------------------------------------------- #

CAB_NOMINATA = ["Escola", "Código da Turma", "Turma", "Ano Escolar", "Estudante"]


def gerar_nominata(anonimas: list[list[str]], terminador: str) -> None:
    linhas = [CAB_NOMINATA]
    for linha in anonimas:
        linhas.append(
            [
                ESCOLA_FICTICIA,
                linha[COLUNAS.index("Código da Turma")],
                linha[COLUNAS.index("Turma")],
                linha[COLUNAS.index("Ano Escolar")],
                linha[IDX_ESTUDANTE],
            ]
        )
    escrever_csv(SAIDA_NOMINATA, linhas, terminador)


# --------------------------------------------------------------------------- #
# TAREFA 3 — casos inválidos
# --------------------------------------------------------------------------- #

REDE = "MUNICIPAL"
ANO = "ENSINO FUNDAMENTAL DE 9 ANOS - 4º ANO"
COMPONENTE = "LÍNGUA PORTUGUESA"
ESTADO = "RORAIMA"
MUNICIPIO = "BOA VISTA"
TURMA_COD = " zz00demo0001 "
TURMA_NOME = "4º ANO A"

DENOMINADORES = [1, 1, 3, 1, 2, 2, 2, 2, 2, 1, 2, 3]

NOMES_CASOS = [
    "ANA BEATRIZ SOUZA LIMA",
    "PEDRO HENRIQUE ALVES COSTA",
    "MARIA CLARA FERREIRA PINTO",
    "LUCAS GABRIEL RAMOS DIAS",
    "JULIA CRISTINA MOTA BRAGA",
    "RAFAEL AUGUSTO LEAL PRADO",
    "SOFIA REGINA CAMPOS NERY",
    "GUSTAVO HENRIQUE PIRES MELO",
]


def celula(acertos: int, itens: int) -> str:
    """Formata a célula no mesmo padrão do arquivo real: ' 1 / 1'."""
    return f" {acertos} / {itens}"


def linha_valida(nome: str, acertos: list[int] | None = None) -> list[str]:
    acertos = acertos if acertos is not None else list(DENOMINADORES)
    return [
        REDE, ANO, COMPONENTE, ESTADO, MUNICIPIO, TURMA_COD, TURMA_NOME,
        nome, "Sim", "Adequado",
        *[celula(a, d) for a, d in zip(acertos, DENOMINADORES)],
    ]


def linha_nao_avaliado(nome: str) -> list[str]:
    return [
        REDE, ANO, COMPONENTE, ESTADO, MUNICIPIO, TURMA_COD, TURMA_NOME,
        nome, "Não", " - ", *[""] * 12,
    ]


def base(quantidade: int) -> list[list[str]]:
    """Bloco de linhas válidas, com variação leve de acertos."""
    linhas = []
    for i in range(quantidade):
        acertos = [max(0, d - (1 if (i + j) % 4 == 0 else 0))
                   for j, d in enumerate(DENOMINADORES)]
        linhas.append(linha_valida(NOMES_CASOS[i % len(NOMES_CASOS)], acertos))
    return linhas


def set_h(linha: list[str], h: int, valor: str) -> None:
    """h é 1-based (H 01 .. H 12)."""
    linha[COLUNAS.index(f"H {h:02d}")] = valor


def gerar_casos_invalidos(terminador: str) -> list[str]:
    casos: dict[str, list[list[str]]] = {}

    # valor-invalido: célula com texto e célula com "120%"
    linhas = base(6)
    set_h(linhas[1], 5, "texto")
    set_h(linhas[3], 9, "120%")
    casos["valor-invalido.csv"] = linhas

    # numerador-maior: acertos > itens
    linhas = base(6)
    set_h(linhas[2], 1, " 2 / 1")
    casos["numerador-maior.csv"] = linhas

    # denominador-zero
    linhas = base(6)
    set_h(linhas[4], 7, " 1 / 0")
    casos["denominador-zero.csv"] = linhas

    # valor-negativo
    linhas = base(6)
    set_h(linhas[1], 5, " -1 / 2")
    casos["valor-negativo.csv"] = linhas

    # denominador-divergente: H 03 tem 3 itens em todas as linhas menos uma
    linhas = base(6)
    set_h(linhas[3], 3, " 1 / 2")
    casos["denominador-divergente.csv"] = linhas

    # avaliado-sem-resultado: Avaliado=Sim com todas as habilidades vazias
    linhas = base(6)
    alvo = linhas[2]
    for h in range(1, 13):
        set_h(alvo, h, "")
    casos["avaliado-sem-resultado.csv"] = linhas

    # nao-avaliado-com-resultado: Avaliado=Não com habilidades preenchidas
    linhas = base(6)
    alvo = linhas[4]
    alvo[COLUNAS.index("Avaliado")] = "Não"
    alvo[COLUNAS.index("Nível de aprendizagem")] = " - "
    casos["nao-avaliado-com-resultado.csv"] = linhas

    # nome-vazio
    linhas = base(6)
    linhas[3][IDX_ESTUDANTE] = ""
    casos["nome-vazio.csv"] = linhas

    # turma-vazia: Código da Turma vazio numa linha
    linhas = base(6)
    linhas[2][COLUNAS.index("Código da Turma")] = ""
    casos["turma-vazia.csv"] = linhas

    # chave-duplicada: duas linhas com mesma turma + mesmo nome
    linhas = base(6)
    linhas[5][IDX_ESTUDANTE] = linhas[0][IDX_ESTUDANTE]
    casos["chave-duplicada.csv"] = linhas

    # nivel-vazio: Avaliado=Sim com Nível de aprendizagem vazio
    linhas = base(6)
    linhas[1][COLUNAS.index("Nível de aprendizagem")] = ""
    casos["nivel-vazio.csv"] = linhas

    # sanidade: os casos de não avaliado precisam de pelo menos uma linha
    # legítima de referência em um arquivo, para que o parser tenha contraste
    casos["avaliado-sem-resultado.csv"].append(
        linha_nao_avaliado(NOMES_CASOS[7])
    )

    for nome_arquivo, corpo in sorted(casos.items()):
        if not 5 <= len(corpo) <= 8:
            raise SystemExit(f"{nome_arquivo} com {len(corpo)} linhas de dados")
        escrever_csv(
            os.path.join(DIR_INVALIDOS, nome_arquivo),
            [COLUNAS] + corpo,
            terminador,
        )
    return sorted(casos)


# --------------------------------------------------------------------------- #
# TAREFA 4 — README das fixtures
# --------------------------------------------------------------------------- #

README = """# Fixtures de teste — Painel de Análise de Leitura

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
{TABELA_DENOM}

### Desempenho por habilidade (Σ acertos ÷ Σ itens)

Nunca a média simples dos percentuais. Este é o ranking que o teste de regressão
reproduz:

| Posição | Habilidade | Acertos | Itens | Desempenho |
|---|---|---|---|---|
{TABELA_RANKING}

## Cenário de duplicidade preservado

Exatamente **um** estudante aparece em **duas turmas diferentes** no arquivo
real. Na fixture esse par continua sendo o **mesmo nome sintético** nas duas
turmas, de modo que o cenário de *possível duplicidade ou transferência*
permanece exercitável:

{LINHA_DUPLICADA}

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
"""


def gerar_readme(anonimas: list[list[str]]) -> None:
    from collections import Counter

    somas = []
    for h in range(12):
        acertos = itens = 0
        denom = set()
        for linha in anonimas:
            valor = linha[10 + h].strip()
            if not valor:
                continue
            a, i = (p.strip() for p in valor.split("/"))
            acertos += int(a)
            itens += int(i)
            denom.add(int(i))
        somas.append((f"H {h + 1:02d}", acertos, itens, sorted(denom)))

    tabela_denom = "\n".join(
        f"| {nome} | {d[0]} |" for nome, _, _, d in somas
    )

    ranking = sorted(somas, key=lambda s: s[1] / s[2])
    tabela_ranking = "\n".join(
        f"| {pos} | {nome} | {a} | {i} | {a / i * 100:.2f}% |"
        for pos, (nome, a, i, _) in enumerate(ranking, start=1)
    )

    contagem = Counter(linha[IDX_ESTUDANTE] for linha in anonimas)
    duplicado = [n for n, c in contagem.items() if c > 1][0]
    turmas = [
        f"`{linha[COLUNAS.index('Código da Turma')]}` ({linha[COLUNAS.index('Turma')]})"
        for linha in anonimas
        if linha[IDX_ESTUDANTE] == duplicado
    ]
    linha_dup = f"- **{duplicado}** — {' e '.join(turmas)}"

    texto = (
        README.replace("{TABELA_DENOM}", tabela_denom)
        .replace("{TABELA_RANKING}", tabela_ranking)
        .replace("{LINHA_DUPLICADA}", linha_dup)
    )
    with open(SAIDA_README, "w", encoding="utf-8", newline="\n") as saida:
        saida.write(texto)


# --------------------------------------------------------------------------- #

def main() -> int:
    anonimas, terminador, mapa = anonimizar()
    gerar_nominata(anonimas, terminador)
    casos = gerar_casos_invalidos(terminador)
    gerar_readme(anonimas)

    print(f"nomes reais distintos mapeados : {len(mapa)}")
    print(f"registros na fixture           : {len(anonimas)}")
    print(f"terminador de linha            : {terminador!r}")
    print(f"gerado: {SAIDA_RESULTADOS}")
    print(f"gerado: {SAIDA_NOMINATA}")
    print(f"gerado: {SAIDA_README}")
    for nome in casos:
        print(f"gerado: {os.path.join(DIR_INVALIDOS, nome)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
