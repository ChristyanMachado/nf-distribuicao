-- RF23 — fila exclusiva, idempotente e auditável de cancelamento fiscal.
-- A migration 0014 do sistema de ponto continua deliberadamente fora do
-- journal; este arquivo não a aplica nem altera objetos do schema public.
CREATE TYPE "fiscal"."status_cancelamento_fiscal" AS ENUM(
  'PENDENTE',
  'PROCESSANDO',
  'CONCLUIDO',
  'ERRO',
  'AGUARDANDO_CONFERENCIA'
);

CREATE TABLE "fiscal"."cancelamentos_fiscais" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nota_id" uuid NOT NULL,
  "motivo" text NOT NULL,
  "status" "fiscal"."status_cancelamento_fiscal" DEFAULT 'PENDENTE' NOT NULL,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "reservada_por" text,
  "reserva_token" uuid,
  "reserva_expira_em" timestamp with time zone,
  "mensagem_status" text,
  "codigo_erro" text,
  "solicitada_em" timestamp with time zone DEFAULT now() NOT NULL,
  "iniciada_em" timestamp with time zone,
  "concluida_em" timestamp with time zone,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cancelamentos_fiscais_motivo_check" CHECK (
    length(btrim("motivo")) BETWEEN 1 AND 255
    AND "motivo" !~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\\n\\r]'
  ),
  CONSTRAINT "cancelamentos_fiscais_tentativas_check" CHECK ("tentativas" >= 0),
  CONSTRAINT "cancelamentos_fiscais_codigo_erro_check" CHECK (
    "codigo_erro" IS NULL OR "codigo_erro" ~ '^[A-Z][A-Z0-9_]{2,63}$'
  ),
  CONSTRAINT "cancelamentos_fiscais_mensagem_check" CHECK (
    "mensagem_status" IS NULL OR (
      length("mensagem_status") <= 300 AND "mensagem_status" !~ E'[\\n\\r]'
    )
  ),
  CONSTRAINT "cancelamentos_fiscais_reserva_check" CHECK (
    ("status" = 'PROCESSANDO' AND "reservada_por" IS NOT NULL
      AND "reserva_token" IS NOT NULL AND "reserva_expira_em" IS NOT NULL)
    OR
    ("status" <> 'PROCESSANDO' AND "reservada_por" IS NULL
      AND "reserva_token" IS NULL AND "reserva_expira_em" IS NULL)
  )
);

ALTER TABLE "fiscal"."cancelamentos_fiscais"
  ADD CONSTRAINT "cancelamentos_fiscais_nota_id_notas_id_fk"
  FOREIGN KEY ("nota_id") REFERENCES "fiscal"."notas"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "cancelamentos_fiscais_nota_unica_idx"
  ON "fiscal"."cancelamentos_fiscais" ("nota_id");
CREATE INDEX "cancelamentos_fiscais_fila_idx"
  ON "fiscal"."cancelamentos_fiscais" ("solicitada_em", "id")
  WHERE "status" IN ('PENDENTE', 'PROCESSANDO');

REVOKE ALL ON TABLE "fiscal"."cancelamentos_fiscais" FROM PUBLIC, anon, authenticated;

-- A VM recebe somente leitura da fila e atualização das colunas operacionais.
-- O bloco mantém ambientes locais utilizáveis antes do provisionamento do papel.
DO $permissoes$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nf_worker_vm') THEN
    GRANT USAGE ON TYPE "fiscal"."status_cancelamento_fiscal" TO nf_worker_vm;
    GRANT SELECT ON TABLE "fiscal"."cancelamentos_fiscais" TO nf_worker_vm;
    GRANT UPDATE (
      status, tentativas, reservada_por, reserva_token, reserva_expira_em,
      mensagem_status, codigo_erro, iniciada_em, concluida_em, atualizado_em
    ) ON TABLE "fiscal"."cancelamentos_fiscais" TO nf_worker_vm;
    GRANT UPDATE (status, mensagem_erro) ON TABLE "fiscal"."notas" TO nf_worker_vm;
  END IF;
END
$permissoes$;
