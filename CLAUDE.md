<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at
specs/001-painel-analise-leitura/plan.md (Next.js App Router + TypeScript strict +
Prisma/PostgreSQL, monolito modular por domínio; pipeline de importação transacional
com estágio; RBAC ADMIN/ANALISTA/ESCOLA com escopo por escola).
<!-- SPECKIT END -->

# Painel de Análise de Leitura — II Ciclo CNCA

Sistema de análise e consolidação das avaliações de Leitura do Compromisso Nacional Criança
Alfabetizada.

## Artefatos de referência

| Documento | Papel |
|---|---|
| [Constituição](.specify/memory/constitution.md) | governo do projeto — precede qualquer outra prática |
| [PRD](PRD_Sistema_Analise_Avaliacao_Leitura_CNCA_v2.md) | fonte de requisitos de produto |
| [Especificação](specs/001-painel-analise-leitura/spec.md) | 178 requisitos funcionais do MVP |
| [Plano](specs/001-painel-analise-leitura/plan.md) | decisões técnicas e estrutura |
| [Funções de domínio](specs/001-painel-analise-leitura/contracts/domain-functions.md) | contrato normativo do núcleo pedagógico |

## Regras que não se negociam

Estas derivam da constituição e valem em qualquer alteração de código:

1. **Ausência nunca vira zero.** Célula vazia é `NULL` em toda a extensão do sistema, inclusive em
   agregações e exportações.
2. **Inteiros são a fonte de verdade.** `acertos` e `itensPossiveis` são `INTEGER`; percentual é
   derivado com `Decimal`; ponto flutuante não participa de cálculo.
3. **Nunca a média simples dos percentuais** como indicador principal. Desempenho é
   `Σ acertos ÷ Σ itens`.
4. **`Nível de aprendizagem` da fonte é intocável.** Categorias analíticas do sistema são separadas,
   configuráveis e visualmente distintas.
5. **Não avaliados** ficam fora de todo denominador de desempenho e dentro de todo indicador de
   participação.
6. **Escopo por escola na camada de dados.** `schoolId` vindo do cliente é filtro, nunca autorização.
7. **Nada de PII em log.** Auditoria referencia por identificador.
8. **O arquivo de referência não é versionado.** Contém nome de 111 crianças; a fixture é
   anonimizada com os números preservados.

## Portão de conclusão

Uma tarefa só está concluída com todos passando ao mesmo tempo:

```bash
npm run lint && npm run typecheck && npm run test && npm run test:regression && npm run build
```
