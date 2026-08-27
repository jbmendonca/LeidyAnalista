# Painel de Análise de Leitura — II Ciclo CNCA

Sistema web de análise e consolidação das avaliações de Leitura do Compromisso Nacional Criança
Alfabetizada.

Transforma o resultado bruto que chega no formato `acertos / itens` — por estudante e por
habilidade — em diagnóstico pedagógico acionável por avaliação, escola, turma, habilidade e
estudante.

---

## O que este sistema recusa a fazer

Antes do que ele faz, é mais útil saber o que ele não faz. Estas regras vêm da
[constituição do projeto](.specify/memory/constitution.md) e são verificadas por teste:

1. **Ausência nunca vira zero.** Célula vazia é `NULL` do arquivo ao relatório, passando por
   toda agregação. Há `CHECK constraint` no banco para o caso de alguém tentar.
2. **Não avaliado fica fora de todo denominador de desempenho** e dentro de todo indicador de
   participação. É a diferença entre um diagnóstico correto e uma turma injustamente rebaixada.
3. **Nunca a média simples dos percentuais.** Desempenho é `Σ acertos ÷ Σ itens` — habilidades
   com 1, 2 e 3 itens não têm peso igual.
4. **O `Nível de aprendizagem` da fonte é intocável.** As categorias analíticas do sistema
   (Fragilidade, Atenção, Satisfatório) são separadas, configuráveis e visualmente distintas.
5. **Nada de `22` fixo em código.** A quantidade de itens de cada habilidade é apurada dos
   dados importados, para que o próximo ciclo com outra matriz continue funcionando.
6. **Escopo por escola na camada de dados.** `schoolId` vindo do cliente é filtro, nunca
   autorização.
7. **Nenhum dado pessoal em log.** A auditoria referencia por identificador.

---

## Requisitos

- **Node.js 22 LTS** ou superior
- **Docker Desktop** (PostgreSQL 16)
- **npm 10+**

---

## Instalação

```bash
cp .env.example .env
```

Ajuste `SESSION_SECRET` no `.env` — qualquer valor com pelo menos 32 caracteres serve em
desenvolvimento. O sistema recusa iniciar sem ele, de propósito.

```bash
docker compose up -d db
```

```bash
npm install
```

> **Sobre a dependência `xlsx`**: ela aponta para o registro oficial do SheetJS
> (`cdn.sheetjs.com`), não para o npm. O pacote publicado no npm está congelado numa versão
> antiga. **Não "corrija" essa entrada do `package.json` para `^0.18.5`** — a leitura de XLS
> legado depende da versão do CDN.

```bash
npm run db:migrate
npm run db:seed
```

O seed cria as 12 habilidades do catálogo, a configuração analítica inicial (Fragilidade < 60%,
Atenção 60–79,99%, Satisfatório ≥ 80%), um usuário administrador e uma escola de demonstração.
**Não cria estudante nem resultado** — esses entram pela importação.

```bash
npm run dev
```

Acesse <http://localhost:3000>.

**Credenciais iniciais:** `admin@painel.local` / `admin-local-2026`
(defina `SEED_ADMIN_PASSWORD` no ambiente para usar outra senha).

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm start` | serve o build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit`, TypeScript strict |
| `npm test` | toda a suíte Vitest |
| `npm run test:unit` | somente unitários |
| `npm run test:integration` | somente integração (exige o banco de pé) |
| `npm run test:regression` | teste de regressão do arquivo de referência |
| `npm run test:e2e` | Playwright |
| `npm run db:migrate` | aplica migrations |
| `npm run db:seed` | popula catálogo e configuração |
| `npm run db:reset` | recria o banco do zero |

### Portão de conclusão

Nenhuma alteração é considerada pronta sem os seis passando ao mesmo tempo:

```bash
npm run lint && npm run typecheck && npm run test && npm run test:regression && npm run build
```

---

## Fluxo de uso

```text
Cadastrar escola  →  Cadastrar avaliação  →  Cadastrar estudantes (nominata)
        ↓
Importar resultados: avaliação → escola → arquivo → validação → pré-visualização → confirmação
        ↓
Painéis: geral → escola → turma → habilidade → estudante
```

### Cadastro prévio de estudantes

Os estudantes são cadastrados **antes** da avaliação e recebem aí um **código único**,
permanente e não derivado de dado pessoal. A importação de resultados **reconcilia** com essa
base — ela não cria cadastros por conta própria.

Use `Estudantes → Nominata` para carregar uma turma inteira de uma vez, e a exportação da
nominata para levar os códigos ao arquivo da avaliação seguinte. Com o código na planilha, a
vinculação passa a ser automática e exata.

### Importação

Formatos aceitos: **CSV, XLSX e XLS**. O CSV real da rede usa separador `;` e UTF-8 com BOM —
ambos detectados automaticamente.

O que o sistema faz com cada inconsistência:

| Severidade | Efeito |
|---|---|
| `ERROR` | **impede** a confirmação. Corrija o arquivo na origem e reenvie. |
| `WARNING` | permite a confirmação **consciente**, depois de você ver o alerta. |

Nada é corrigido em silêncio. A pré-visualização mostra o valor original ao lado do
interpretado, e **nenhum resultado é gravado antes da sua confirmação**.

**Para substituir uma carga**, exclua a importação anterior (ação de administrador, registrada
em auditoria) e reenvie o arquivo corrigido. A reimportação direta é bloqueada por colisão de
chave — é o que impede a mesma criança de ser contada duas vezes.

---

## Política de dados

**O arquivo de referência real não é versionado.** Ele contém nome completo de 111 crianças. O
`.gitignore` cobre `HABILIDADES_DESEMPENHO_ESTUDANTE*.csv`, e a fixture usada nos testes
(`tests/fixtures/resultados-referencia.csv`) é uma versão **anonimizada** com nomes sintéticos e
**todos os valores numéricos preservados** — por isso o teste de regressão continua válido.

**Retenção do arquivo importado.** O arquivo original é retido por `IMPORT_FILE_RETENTION_DAYS`
(padrão **90 dias**) e então excluído automaticamente. O SHA-256, as contagens, o autor e a
data/hora permanecem por prazo indeterminado: depois que o conteúdo já não existe, o hash
continua provando **qual** conteúdo foi importado, sem guardar nome algum.

> Os 90 dias são um **padrão técnico defensável, não um parecer jurídico**. Confirme o prazo com
> a política de guarda de dados da sua rede antes de operar com dados reais.

**O diretório `IMPORT_STORAGE_DIR` contém dados nominais de crianças.** Aplique a ele as mesmas
restrições de acesso do banco de dados.

**Permissão de dados nominais.** É um controle por usuário, independente do perfil e do escopo
de escola. Quem não a possui **recebe a versão agregada** de tudo — sem nomes, e sem ser
bloqueado. A supressão acontece na consulta, não na tela: o servidor não devolve nomes que o
solicitante não pode ver.

---

## Perfis de acesso

| Perfil | Pode |
|---|---|
| **ADMIN** | tudo: usuários, escolas, avaliações, importação, exclusão, configuração, auditoria |
| **ANALISTA** | importar, analisar, filtrar e exportar nas escolas às quais está vinculado |
| **ESCOLA** | visualizar exclusivamente a própria escola |

O vínculo usuário–escola é a **única** fonte de autorização por escola. Recurso fora do escopo
responde `404`, nunca `403` — um `403` confirmaria a existência da escola a quem não pode vê-la.

---

## Teste de referência

```bash
npm run test:regression
```

Exercita a cadeia completa — leitura, remoção de BOM, mapeamento, parsing, normalização,
validação e cálculo — sobre a fixture anonimizada, e falha se qualquer um destes divergir:

| Métrica | Valor |
|---|---:|
| Registros | 111 |
| Avaliados | 106 |
| Não avaliados | 5 |
| Turmas | 4 |
| Habilidades | 12 |
| Adequado / Intermediário / Defasagem | 96 / 7 / 3 |

E o ranking de fragilidade, com tolerância de 0,01 ponto percentual:

```text
H07 ≈ 70,75%   H05 ≈ 75,94%   H06 ≈ 79,25%   H10 ≈ 83,96%
H12 ≈ 84,59%   H11 ≈ 84,91%   H09 ≈ 86,32%   H03 ≈ 87,42%
H04 ≈ 88,68%   H01 ≈ 89,62%   H02 ≈ 90,57%   H08 ≈ 91,98%
```

Estes valores **validam o cálculo**. Não são metas nem pontos de corte pedagógicos.

Para conferir contra o arquivo real, mantenha-o fora do repositório e aponte
`REFERENCE_FILE_PATH` para ele.

---

## Arquitetura

Monolito Next.js com App Router. Sem microserviços, sem Redis, sem filas, sem cache
materializado — o volume do MVP não os justifica, e cada um deles adicionaria uma classe de bug
que o produto não pode pagar.

```text
src/
├── app/                     interface — App Router, Server Components, Route Handlers
├── modules/<domínio>/
│   ├── domain/              funções PURAS: sem I/O, sem framework, sem Prisma
│   ├── application/         casos de uso, orquestração, transações
│   ├── infra/               repositórios, parsers, adaptadores
│   └── schemas/             Zod, compartilhados servidor/formulário
├── components/              apresentação
├── server/                  contexto de autenticação, autorização, Prisma, logger
└── lib/                     Decimal, formatação pt-BR, ambiente
```

A fronteira do domínio é verificada por regra de ESLint: `modules/*/domain/**` não pode importar
`react`, `next` nem `@prisma/client`. Não é convenção — é erro de lint.

### Representação numérica

`acertos` e `itensPossiveis` são `INTEGER`. `percentual` é `NUMERIC(7,4)`. **Não existe um único
`Float` no schema**, e as funções de domínio devolvem a fração `{ acertos, itens }`, não o
percentual: a divisão acontece uma vez, com `Decimal`, na borda de apresentação.

### Documentação de projeto

| Documento | Papel |
|---|---|
| [Constituição](.specify/memory/constitution.md) | governo do projeto |
| [Especificação](specs/001-painel-analise-leitura/spec.md) | 178 requisitos funcionais |
| [Plano](specs/001-painel-analise-leitura/plan.md) | decisões técnicas |
| [Pesquisa](specs/001-painel-analise-leitura/research.md) | racional das decisões e alternativas rejeitadas |
| [Modelo de dados](specs/001-painel-analise-leitura/data-model.md) | entidades e invariantes |
| [Funções de domínio](specs/001-painel-analise-leitura/contracts/domain-functions.md) | contrato normativo do núcleo pedagógico |

---

## Solução de problemas

**`Configuração de ambiente inválida`** — falta variável no `.env`. A mensagem diz qual.

**`Can't reach database server`** — o container não está de pé:
```bash
docker compose up -d db && docker compose ps
```

**Testes de integração falhando** — eles usam o banco real. Confirme que as migrations estão
aplicadas: `npm run db:migrate`.

**Acentuação errada no CSV exportado** — abra pelo assistente de importação do Excel escolhendo
UTF-8, ou use o LibreOffice. O arquivo é gerado com BOM justamente para o Excel reconhecer.

**O login "funciona" mas toda navegação volta para a tela de entrada** — quase sempre é o
atributo `Secure` do cookie de sessão. O navegador descarta cookie `Secure` recebido por HTTP,
com uma exceção que esconde o problema: `http://localhost` é tratado como contexto seguro, e
por isso funciona na própria máquina e falha ao ser acessado pela rede.

O sistema decide o atributo pelo protocolo real da requisição, então acessar por
`http://192.168.0.10:3000` funciona sem configuração. Se você forçou `SESSION_COOKIE_SECURE=true`
sem servir por HTTPS, este é o sintoma — remova a variável ou coloque TLS na frente.

---

## Acesso pela rede local

`npm run dev` e `npm start` já escutam em todas as interfaces. Basta acessar pelo IP da
máquina, por exemplo `http://172.17.4.96:3000`. Pode ser necessário liberar a porta 3000 no
firewall do Windows.

> **Isto é adequado a piloto em rede controlada, não a produção.** O painel trata dados
> nominais de crianças; servi-lo por HTTP significa trafegar nome e desempenho em claro. Para
> uso real, coloque um proxy com TLS na frente e defina `SESSION_COOKIE_SECURE="true"`.
