-- Cada confirmação de distribuição recebe um número operacional sequencial.
-- Tarefas antigas de teste permanecem sem lote para revisão explícita; novas
-- tarefas gravam lote_id e nunca misturam duas rodadas no mesmo documento.

CREATE SEQUENCE "fiscal"."lotes_distribuicao_numero_seq" AS bigint;

ALTER TABLE "fiscal"."lotes_distribuicao" ADD COLUMN "numero" bigint;

WITH lotes_ordenados AS (
  SELECT "id", row_number() OVER (ORDER BY "criado_em", "id") AS numero
  FROM "fiscal"."lotes_distribuicao"
)
UPDATE "fiscal"."lotes_distribuicao" AS lote
SET "numero" = lotes_ordenados.numero
FROM lotes_ordenados
WHERE lote."id" = lotes_ordenados."id";

SELECT setval(
  '"fiscal"."lotes_distribuicao_numero_seq"',
  (SELECT COALESCE(MAX("numero"), 1) FROM "fiscal"."lotes_distribuicao"),
  true
);

ALTER SEQUENCE "fiscal"."lotes_distribuicao_numero_seq"
  OWNED BY "fiscal"."lotes_distribuicao"."numero";
ALTER TABLE "fiscal"."lotes_distribuicao"
  ALTER COLUMN "numero" SET DEFAULT nextval('"fiscal"."lotes_distribuicao_numero_seq"'),
  ALTER COLUMN "numero" SET NOT NULL;
ALTER TABLE "fiscal"."lotes_distribuicao"
  ADD CONSTRAINT "lotes_distribuicao_numero_unico" UNIQUE ("numero");

ALTER TABLE "fiscal"."tarefas"
  ADD COLUMN "lote_id" uuid REFERENCES "fiscal"."lotes_distribuicao"("id");
