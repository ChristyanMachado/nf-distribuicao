-- Base inerte para separar entrega física de faturamento posterior.
-- Não habilita mercados diferidos nem cria tarefas fiscais.
ALTER TABLE fiscal.clientes
  ADD COLUMN modo_faturamento text NOT NULL DEFAULT 'IMEDIATO',
  ADD CONSTRAINT clientes_modo_faturamento_check
    CHECK (modo_faturamento IN ('IMEDIATO', 'DIFERIDO'));
--> statement-breakpoint
ALTER TABLE fiscal.distribuicoes
  ADD COLUMN modo_faturamento text NOT NULL DEFAULT 'IMEDIATO',
  ADD CONSTRAINT distribuicoes_modo_faturamento_check
    CHECK (modo_faturamento IN ('IMEDIATO', 'DIFERIDO'));
--> statement-breakpoint
CREATE TABLE fiscal.saldos_faturamento (
  distribuicao_id uuid PRIMARY KEY REFERENCES fiscal.distribuicoes(id),
  quantidade_total numeric(12,3) NOT NULL,
  quantidade_alocada numeric(12,3) NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT saldos_faturamento_quantidades_check CHECK (
    quantidade_total > 0 AND quantidade_alocada >= 0
    AND quantidade_alocada <= quantidade_total
  )
);
--> statement-breakpoint
CREATE INDEX distribuicoes_diferidas_cliente_idx
  ON fiscal.distribuicoes(cliente_id, id)
  WHERE modo_faturamento = 'DIFERIDO';
--> statement-breakpoint
ALTER TABLE fiscal.saldos_faturamento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.saldos_faturamento FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- O papel Web exclusivo do QA pode exercitar o modelo sem expor a tabela ao
-- navegador. A produção usa a conexão proprietária e não recebe esse grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'nf_homologacao_web') THEN
    GRANT SELECT, INSERT ON fiscal.saldos_faturamento TO nf_homologacao_web;
    EXECUTE 'CREATE POLICY qa_web_saldos_select ON fiscal.saldos_faturamento FOR SELECT TO nf_homologacao_web USING (true)';
    EXECUTE 'CREATE POLICY qa_web_saldos_insert ON fiscal.saldos_faturamento FOR INSERT TO nf_homologacao_web WITH CHECK (true)';
  END IF;
END $$;
