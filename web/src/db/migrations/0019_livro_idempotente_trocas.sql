CREATE TABLE fiscal.trocas_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_idempotencia uuid NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES fiscal.clientes(id),
  produto_id uuid NOT NULL REFERENCES fiscal.produtos(id),
  quantidade numeric(12,3) NOT NULL CHECK (quantidade > 0 AND quantidade <= 1000000000),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE INDEX trocas_lancamentos_cliente_produto_idx
  ON fiscal.trocas_lancamentos(cliente_id, produto_id);
--> statement-breakpoint
ALTER TABLE fiscal.trocas_lancamentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.trocas_lancamentos FROM PUBLIC, anon, authenticated;
