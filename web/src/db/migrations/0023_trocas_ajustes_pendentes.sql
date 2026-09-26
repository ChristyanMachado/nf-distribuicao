-- Correção auditável do saldo ainda pendente. Lançamentos originais e
-- reposições já consumidas por distribuições permanecem imutáveis.
CREATE TABLE fiscal.trocas_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_idempotencia uuid NOT NULL,
  saldo_id uuid NOT NULL REFERENCES fiscal.trocas_mercado(id),
  quantidade_antes numeric(12,3) NOT NULL,
  quantidade_depois numeric(12,3) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT trocas_ajustes_valores_validos CHECK (
    quantidade_antes >= 0 AND quantidade_depois >= 0
    AND quantidade_antes <> quantidade_depois
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX trocas_ajustes_chave_idempotencia_idx
  ON fiscal.trocas_ajustes(chave_idempotencia);
--> statement-breakpoint
CREATE INDEX trocas_ajustes_saldo_criado_idx
  ON fiscal.trocas_ajustes(saldo_id, criado_em);
--> statement-breakpoint
ALTER TABLE fiscal.trocas_ajustes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.trocas_ajustes FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- O Web isolado de homologação usa papel próprio; apenas registra e lê o
-- ajuste. Nem ele nem o navegador podem apagar ou reescrever o histórico.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'nf_homologacao_web') THEN
    GRANT SELECT, INSERT ON fiscal.trocas_ajustes TO nf_homologacao_web;
    EXECUTE 'CREATE POLICY qa_web_ajustes_select ON fiscal.trocas_ajustes FOR SELECT TO nf_homologacao_web USING (true)';
    EXECUTE 'CREATE POLICY qa_web_ajustes_insert ON fiscal.trocas_ajustes FOR INSERT TO nf_homologacao_web WITH CHECK (true)';
  END IF;
END $$;
