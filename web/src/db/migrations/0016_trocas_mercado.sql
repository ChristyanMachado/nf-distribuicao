-- Custom SQL migration file, put your code below! --
-- Saldo físico de mercadoria devolvida, separado do histórico fiscal das
-- distribuições. O saldo é compartilhado por produto + mercado, mesmo se o
-- mercado puder ser atendido por mais de um emitente.
CREATE TABLE "fiscal"."trocas_mercado" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cliente_id" uuid NOT NULL REFERENCES "fiscal"."clientes"("id"),
  "produto_id" uuid NOT NULL REFERENCES "fiscal"."produtos"("id"),
  "quantidade_disponivel" numeric(12, 3) DEFAULT '0' NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trocas_mercado_quantidade_check"
    CHECK ("quantidade_disponivel" >= 0 AND "quantidade_disponivel" <= 1000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trocas_mercado_cliente_produto_idx"
  ON "fiscal"."trocas_mercado" USING btree ("cliente_id", "produto_id");
--> statement-breakpoint
-- Schema fiscal não é uma API pública. O Web escreve somente pelo servidor e
-- o Worker não recebe acesso a saldos de troca.
REVOKE ALL ON TABLE "fiscal"."trocas_mercado" FROM PUBLIC, anon, authenticated;
