-- Migração RF: cliente↔emitente N:N e emitente definido na tarefa.
-- Os logins permanecem intactos em fiscal.emitentes. clientes.emitente_id é
-- mantido apenas como legado; a aplicação deixa de lê-lo após esta migração.

CREATE TABLE "fiscal"."cliente_emitentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"emitente_id" uuid NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscal"."cliente_emitentes" ADD CONSTRAINT "cliente_emitentes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "fiscal"."clientes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fiscal"."cliente_emitentes" ADD CONSTRAINT "cliente_emitentes_emitente_id_emitentes_id_fk" FOREIGN KEY ("emitente_id") REFERENCES "fiscal"."emitentes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cliente_emitentes_cliente_emitente_idx" ON "fiscal"."cliente_emitentes" USING btree ("cliente_id", "emitente_id");
--> statement-breakpoint

-- Migra a antiga associação 1:N para a nova tabela N:N. Clientes sem
-- emitente legado permanecem sem relação e devem ser configurados na tela.
INSERT INTO "fiscal"."cliente_emitentes" ("cliente_id", "emitente_id")
SELECT "id", "emitente_id"
FROM "fiscal"."clientes"
WHERE "emitente_id" IS NOT NULL
ON CONFLICT ("cliente_id", "emitente_id") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "fiscal"."distribuicoes" ADD COLUMN "emitente_id" uuid;
--> statement-breakpoint
UPDATE "fiscal"."distribuicoes" AS distribuicao
SET "emitente_id" = cliente."emitente_id"
FROM "fiscal"."clientes" AS cliente
WHERE distribuicao."cliente_id" = cliente."id";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "fiscal"."distribuicoes" WHERE "emitente_id" IS NULL) THEN
		RAISE EXCEPTION 'Há distribuição de teste sem emitente. Limpe ou corrija esses dados antes de aplicar a migração.';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "fiscal"."distribuicoes" ALTER COLUMN "emitente_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal"."distribuicoes" ADD CONSTRAINT "distribuicoes_emitente_id_emitentes_id_fk" FOREIGN KEY ("emitente_id") REFERENCES "fiscal"."emitentes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "fiscal"."tarefas" ADD COLUMN "emitente_id" uuid;
--> statement-breakpoint
UPDATE "fiscal"."tarefas" AS tarefa
SET "emitente_id" = cliente."emitente_id"
FROM "fiscal"."clientes" AS cliente
WHERE tarefa."cliente_id" = cliente."id";
--> statement-breakpoint

-- Não criar tarefa nova sem identidade fiscal. Falhar aqui é intencional: o
-- operador deve corrigir o dado antigo antes de avançar, em vez de emitir por
-- um emitente arbitrário.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "fiscal"."tarefas" WHERE "emitente_id" IS NULL) THEN
		RAISE EXCEPTION 'Há tarefa histórica sem emitente. Associe o emitente antes de aplicar a migração.';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "fiscal"."tarefas" ALTER COLUMN "emitente_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal"."tarefas" ADD CONSTRAINT "tarefas_emitente_id_emitentes_id_fk" FOREIGN KEY ("emitente_id") REFERENCES "fiscal"."emitentes"("id") ON DELETE no action ON UPDATE no action;
