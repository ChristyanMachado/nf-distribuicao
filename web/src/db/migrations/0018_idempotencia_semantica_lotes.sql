-- Uma UUID idempotente não pode aceitar conteúdo diferente em um reenvio.
-- A coluna permanece nula para lotes legados, que são deliberadamente tratados
-- como não reutilizáveis pelo Web para evitar uma duplicação silenciosa.
ALTER TABLE fiscal.lotes_distribuicao
  ADD COLUMN IF NOT EXISTS payload_hash text;
