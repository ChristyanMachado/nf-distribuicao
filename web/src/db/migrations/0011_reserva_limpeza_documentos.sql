-- Reserva exclusiva e curta para a limpeza idempotente de XML/DANFE vencidos.
-- O Worker apaga o objeto via Storage API antes de limpar as referências.
ALTER TABLE "fiscal"."notas"
  ADD COLUMN "limpeza_reserva_token" uuid,
  ADD COLUMN "limpeza_reserva_expira_em" timestamp;

-- A busca ocorre por expiração, somente em notas que ainda possuem os dois
-- documentos. O predicado evita uma varredura completa do histórico fiscal.
CREATE INDEX "notas_documentos_expirados_idx"
  ON "fiscal"."notas" ("documento_expira_em", "id")
  WHERE "pdf_path" IS NOT NULL AND "xml_path" IS NOT NULL;
