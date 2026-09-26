-- Entrega física diferida não decide o emitente fiscal. A decisão pertence
-- ao fechamento posterior; entregas imediatas continuam exigindo emitente.
ALTER TABLE fiscal.distribuicoes
  ADD CONSTRAINT distribuicoes_emitente_por_modo_check CHECK (
    (modo_faturamento = 'IMEDIATO' AND emitente_id IS NOT NULL)
    OR (modo_faturamento = 'DIFERIDO' AND emitente_id IS NULL)
  );
--> statement-breakpoint
ALTER TABLE fiscal.distribuicoes
  ALTER COLUMN emitente_id DROP NOT NULL;
