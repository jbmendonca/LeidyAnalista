-- Invariantes de fidelidade do dado, aplicadas no próprio banco.
--
-- Estas restrições existem para que a regra sobreviva a QUALQUER caminho de
-- escrita: aplicação, seed, script de manutenção ou correção manual em
-- produção. Um bug de aplicação vira erro de banco, e não um número plausível
-- e errado.
--
-- Ver: constituição, Princípios I e II; spec FR-031, FR-032, FR-059.

-- ---------------------------------------------------------------------------
-- Resultado por habilidade
-- ---------------------------------------------------------------------------

-- FR-032: acertos >= 0, itens > 0, acertos <= itens
ALTER TABLE "student_skill_result"
  ADD CONSTRAINT "ssr_fracao_valida"
  CHECK (
    "acertos" IS NULL
    OR ("acertos" >= 0 AND "itensPossiveis" > 0 AND "acertos" <= "itensPossiveis")
  );

-- FR-031: ausência é total. Não existe acerto sem denominador, nem
-- denominador sem acerto — isso impediria a soma correta e abriria porta
-- para tratar ausência como zero.
ALTER TABLE "student_skill_result"
  ADD CONSTRAINT "ssr_ausencia_coerente"
  CHECK (
    ("acertos" IS NULL AND "itensPossiveis" IS NULL)
    OR ("acertos" IS NOT NULL AND "itensPossiveis" IS NOT NULL)
  );

-- Percentual só existe quando existe a fração que o origina.
ALTER TABLE "student_skill_result"
  ADD CONSTRAINT "ssr_percentual_derivado"
  CHECK (
    ("percentual" IS NULL AND "acertos" IS NULL)
    OR ("percentual" IS NOT NULL AND "acertos" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- Resultado do estudante na avaliação
-- ---------------------------------------------------------------------------

ALTER TABLE "assessment_student_result"
  ADD CONSTRAINT "asr_totais_validos"
  CHECK (
    "acertosTotais" IS NULL
    OR ("acertosTotais" >= 0 AND "itensTotais" > 0 AND "acertosTotais" <= "itensTotais")
  );

-- FR-059 no nível do banco: estudante não avaliado NÃO PODE ter totais de
-- desempenho. Se um caminho de escrita tentar atribuir zero a um não avaliado,
-- o banco recusa.
ALTER TABLE "assessment_student_result"
  ADD CONSTRAINT "asr_nao_avaliado_sem_desempenho"
  CHECK (
    "avaliado" = true
    OR ("acertosTotais" IS NULL AND "itensTotais" IS NULL AND "percentualGeral" IS NULL)
  );

-- Const. III: nível normalizado só pode existir para quem foi avaliado.
-- O nivelOriginal permanece livre — é o valor bruto da fonte e nunca é
-- restringido.
ALTER TABLE "assessment_student_result"
  ADD CONSTRAINT "asr_nivel_normalizado_so_avaliado"
  CHECK ("avaliado" = true OR "nivelNormalizado" IS NULL);

-- ---------------------------------------------------------------------------
-- Denominador de referência
-- ---------------------------------------------------------------------------

-- FR-016: a quantidade de itens nasce da apuração; zero ou negativo não é
-- resultado possível de apuração.
ALTER TABLE "assessment_skill"
  ADD CONSTRAINT "as_reference_items_positivo"
  CHECK ("referenceItems" > 0);

-- ---------------------------------------------------------------------------
-- Critérios analíticos
-- ---------------------------------------------------------------------------

-- Faixas coerentes: Fragilidade não pode começar acima de Atenção.
ALTER TABLE "analytical_settings"
  ADD CONSTRAINT "settings_faixas_coerentes"
  CHECK (
    "fragilidadeMax" >= 0
    AND "atencaoMax" <= 100
    AND "fragilidadeMax" <= "atencaoMax"
  );

-- ---------------------------------------------------------------------------
-- Importação
-- ---------------------------------------------------------------------------

-- FR-038b: o caminho some no expurgo, o hash nunca.
ALTER TABLE "import"
  ADD CONSTRAINT "import_expurgo_coerente"
  CHECK (
    ("filePurgedAt" IS NULL AND "storagePath" IS NOT NULL)
    OR ("filePurgedAt" IS NOT NULL AND "storagePath" IS NULL)
  );
