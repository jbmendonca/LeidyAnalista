# Specification Quality Checklist: Painel de Análise de Leitura — II Ciclo CNCA (MVP)

**Purpose**: Validar completude e qualidade da especificação antes do planejamento
**Created**: 2026-08-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Iteração 1 — 2026-08-27**

Resultado: 15 de 16 itens aprovados. Um item pendente.

**Item pendente — "No [NEEDS CLARIFICATION] markers remain"**

Dois marcadores permanecem, ambos registrados na seção *Questões em Aberto* da spec:

1. **Reimportação** — comportamento quando o mesmo par avaliação + escola recebe nova importação
   (bloquear / substituir / coexistir com alerta de duplicidade).
2. **Correção pontual pós-importação** — se um registro confirmado pode ser corrigido dentro do
   sistema ou apenas por exclusão e reenvio do arquivo.

Ambos foram mantidos deliberadamente: afetam o modelo de dados e o fluxo de operação, o PRD não os
define e não há padrão de mercado inequívoco. Nove outras lacunas foram resolvidas por decisão
fundamentada e estão registradas em *Assumptions*, não como marcadores.

**Verificações objetivas executadas**

- 127 requisitos funcionais numerados de FR-001 a FR-127, sem lacunas, duplicidades ou quebras de
  ordem.
- 14 critérios de sucesso, todos com métrica verificável e sem menção a tecnologia.
- Nenhum placeholder do template remanescente.
- Números do teste de referência conferidos contra o arquivo real: 111 registros, 106 avaliados,
  5 não avaliados, 4 turmas, 12 habilidades, 96/7/3, taxa de participação 95,50%.
- Denominadores por habilidade no arquivo real: uniformes nas 12 habilidades (nenhuma divergência),
  somando 22 itens por estudante avaliado.
- O arquivo real contém exatamente um nome de estudante que ocorre em duas turmas distintas — caso
  concreto para o cenário de "possível duplicidade ou transferência" (FR-045).

**Conformidade com a constituição v1.0.0**

- Princípio I (fidelidade): FR-030, FR-031, FR-038, FR-042, FR-059, FR-060.
- Princípio II (cálculo por itens): FR-055 a FR-058, FR-063, FR-064.
- Princípio III (classificação oficial): FR-036, FR-047, FR-089, FR-112.
- Princípio IV (LGPD): FR-001 a FR-010, FR-105.
- Princípio VIII (usabilidade pt-BR): FR-121 a FR-127.
- Princípio IX (escopo): seção *Fora do Escopo desta Feature*.
- Princípio X (teste de referência): SC-001, SC-002, SC-003 e FR-016.

**Próximo passo**: resolver os dois marcadores via `/speckit-clarify` ou resposta direta; após isso,
todos os 16 itens estarão aprovados e a spec estará pronta para `/speckit-plan`.

---

**Iteração 2 — 2026-08-27 (após `/speckit-clarify`)**

Resultado: **16 de 16 itens aprovados.** Nenhuma regressão.

Item que mudou de estado: *"No [NEEDS CLARIFICATION] markers remain"* — de não aprovado para
aprovado. Os dois marcadores da Iteração 1 foram resolvidos: reimportação por FR-153 e correção
pontual por FR-154, ambos como consequência direta da política de colisão de chave.

Cinco decisões foram tomadas na sessão de clarificação e registradas em *Clarifications* da spec:

1. Código único e estável por estudante, persistido no cadastro (FR-128 a FR-136).
2. Vinculação por código quando a coluna existir; assistida com confirmação humana quando não
   existir; nunca automática por nome (FR-137 a FR-146).
3. Colisão de chave na mesma avaliação é `ERROR` bloqueante (FR-147 a FR-152).
4. Denominador predominante como referência de apresentação, sem alterar o cálculo `Σ/Σ`
   (FR-155 a FR-161).
5. Critérios analíticos globais e versionados, sem variação por escola ou avaliação (FR-162 a
   FR-167).

Sete pontos de baixo risco foram resolvidos como padrão simples documentado, sem consumir pergunta,
e constam nas premissas 12 a 18 da spec.

**Verificações objetivas re-executadas**

- 167 requisitos funcionais, de FR-001 a FR-167, sem lacunas, duplicidades ou quebras de ordem.
- 19 critérios de sucesso, numeração íntegra.
- Zero marcadores `[NEEDS CLARIFICATION]` no documento.
- 21 grupos de requisitos; nenhum espaço em branco ao fim de linha.
- Nenhum requisito preexistente foi renumerado: as decisões entraram como grupos S, T e U, o que
  preserva a rastreabilidade dos FR já citados neste checklist.

**Conformidade com a constituição v1.0.0 — decisões desta sessão**

- Princípio I (fidelidade): FR-150 e FR-154 impedem fusão, descarte e edição de dado importado.
- Princípio II (cálculo por itens): FR-157 garante que o denominador de referência é apresentação e
  não altera `Σ acertos ÷ Σ itens`.
- Princípio III (classificação oficial): FR-164 confirma que recalcular faixas analíticas não toca o
  `Nível de aprendizagem`.
- Princípio VII (sem correção silenciosa): FR-139, FR-142, FR-149 e FR-160 tornam explícita toda
  decisão de identidade e de denominador.
- Princípio IX (escopo): FR-167 e as premissas 10 e 12 a 18 mantêm o MVP contido; a análise
  longitudinal permanece fora, ainda que o código único a viabilize no futuro.

**Próximo passo**: a spec está pronta para `/speckit-plan`.

---

**Iteração 3 — 2026-08-27 (cadastro prévio de estudantes)**

Resultado: **16 de 16 itens mantidos aprovados.** Nenhuma regressão, nenhum marcador reaberto.

Decisão incorporada: os estudantes são cadastrados na plataforma **antes** das avaliações. A base
cadastral passa a ser a autoridade sobre quem existe e o código único é atribuído no cadastro; a
importação de resultados reconcilia com essa base em vez de criar estudantes.

Alterações: novo grupo **V — Cadastro prévio de estudantes** (FR-168 a FR-178); nova User Story 10
(P1, precede a US1 na execução); FR-143 revisto para proibir criação automática de estudante;
entidade `Estudante` revista; 6 novos edge cases; SC-020 a SC-022; premissas 19 a 21.

Efeito sobre as decisões anteriores: nenhuma foi invalidada. FR-147, FR-148 e FR-152 continuam
valendo — a colisão de chave passa a proteger a base cadastral em vez do arquivo, e sua frequência
esperada cai. FR-176 registra a consequência inversa: com homônimos cadastrados na mesma turma, o
código único deixa de ser conveniência e passa a ser necessário no arquivo de resultados.

**Verificações objetivas re-executadas**

- 178 requisitos funcionais, FR-001 a FR-178, sem lacunas, duplicidades ou quebras de ordem.
- 22 critérios de sucesso; 10 user stories; 22 grupos de requisitos.
- Zero marcadores `[NEEDS CLARIFICATION]`; zero referências cruzadas a FR inexistentes.
- Nenhum requisito preexistente renumerado.
