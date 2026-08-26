-- Identificador sem segredo usado para selecionar o emitente no formulário
-- da NFP-e. Pode ficar nulo enquanto o reconhecimento não foi concluído.
ALTER TABLE "fiscal"."emitentes" ADD COLUMN "valor_select_nfpe" text;
