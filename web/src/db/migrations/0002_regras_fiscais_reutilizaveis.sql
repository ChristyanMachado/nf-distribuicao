-- Regra fiscal reutilizável por produto, com referência preservada na tarefa.
-- Os valores iniciais foram confirmados no reconhecimento de homologação e
-- correspondem à regra única informada pelo responsável em 24/08/2026.

CREATE TABLE "fiscal"."regras_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"cfop_texto" text NOT NULL,
	"cfop_codigo" text NOT NULL,
	"situacao_tributaria_icms" text NOT NULL,
	"origem_mercadoria" text NOT NULL,
	"possui_beneficio_fiscal" boolean DEFAULT false NOT NULL,
	"codigo_beneficio_fiscal" text,
	"natureza_operacao" text NOT NULL,
	"tipo_operacao" text NOT NULL,
	"finalidade_emissao" text NOT NULL,
	"indicador_presenca" text NOT NULL,
	"modalidade_frete" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "regras_fiscais_codigo_idx" ON "fiscal"."regras_fiscais" USING btree ("codigo");
--> statement-breakpoint

INSERT INTO "fiscal"."regras_fiscais" (
	"codigo", "nome", "cfop_texto", "cfop_codigo", "situacao_tributaria_icms",
	"origem_mercadoria", "possui_beneficio_fiscal", "codigo_beneficio_fiscal",
	"natureza_operacao", "tipo_operacao", "finalidade_emissao",
	"indicador_presenca", "modalidade_frete"
) VALUES (
	'NFPE_VENDA_PADRAO',
	'Venda padrão NFP-e',
	'Venda de produção do estabelecimento',
	'5101',
	'40',
	'0',
	true,
	'PR810128',
	'Venda',
	'Saída',
	'NF-e normal',
	'Operação não presencial, pela Internet',
	'3'
) ON CONFLICT ("codigo") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "fiscal"."produtos" ADD COLUMN "regra_fiscal_id" uuid;
--> statement-breakpoint
UPDATE "fiscal"."produtos"
SET "regra_fiscal_id" = (
	SELECT "id" FROM "fiscal"."regras_fiscais" WHERE "codigo" = 'NFPE_VENDA_PADRAO'
)
WHERE "regra_fiscal_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "fiscal"."produtos" ALTER COLUMN "regra_fiscal_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal"."produtos" ADD CONSTRAINT "produtos_regra_fiscal_id_regras_fiscais_id_fk" FOREIGN KEY ("regra_fiscal_id") REFERENCES "fiscal"."regras_fiscais"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "fiscal"."tarefa_itens" ADD COLUMN "regra_fiscal_id" uuid;
--> statement-breakpoint
UPDATE "fiscal"."tarefa_itens" AS item
SET "regra_fiscal_id" = produto."regra_fiscal_id"
FROM "fiscal"."produtos" AS produto
WHERE item."produto_id" = produto."id" AND item."regra_fiscal_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "fiscal"."tarefa_itens" ALTER COLUMN "regra_fiscal_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal"."tarefa_itens" ADD CONSTRAINT "tarefa_itens_regra_fiscal_id_regras_fiscais_id_fk" FOREIGN KEY ("regra_fiscal_id") REFERENCES "fiscal"."regras_fiscais"("id") ON DELETE no action ON UPDATE no action;
