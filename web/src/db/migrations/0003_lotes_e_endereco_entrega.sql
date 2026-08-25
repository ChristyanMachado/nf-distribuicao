-- Lote identifica uma rodada única de distribuição e alimenta o roteiro do
-- motorista. Endereço completo é opcional para preservar cadastros antigos,
-- mas novos clientes devem preenchê-lo para gerar um roteiro útil.

CREATE TABLE "fiscal"."lotes_distribuicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" text NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscal"."clientes" ADD COLUMN "logradouro" text;
--> statement-breakpoint
ALTER TABLE "fiscal"."clientes" ADD COLUMN "bairro" text;
--> statement-breakpoint
ALTER TABLE "fiscal"."clientes" ADD COLUMN "cidade" text;
--> statement-breakpoint
ALTER TABLE "fiscal"."clientes" ADD COLUMN "uf" text;
--> statement-breakpoint

-- Histórico anterior não possuía identificador de rodada. Agrupa o legado
-- pela data; distribuições novas passam a criar um lote por confirmação.
INSERT INTO "fiscal"."lotes_distribuicao" ("data")
SELECT DISTINCT "data" FROM "fiscal"."disponibilidades";
--> statement-breakpoint
ALTER TABLE "fiscal"."disponibilidades" ADD COLUMN "lote_id" uuid;
--> statement-breakpoint
UPDATE "fiscal"."disponibilidades" AS disponibilidade
SET "lote_id" = lote."id"
FROM "fiscal"."lotes_distribuicao" AS lote
WHERE disponibilidade."data" = lote."data";
--> statement-breakpoint
ALTER TABLE "fiscal"."disponibilidades" ALTER COLUMN "lote_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal"."disponibilidades" ADD CONSTRAINT "disponibilidades_lote_id_lotes_distribuicao_id_fk" FOREIGN KEY ("lote_id") REFERENCES "fiscal"."lotes_distribuicao"("id") ON DELETE no action ON UPDATE no action;
