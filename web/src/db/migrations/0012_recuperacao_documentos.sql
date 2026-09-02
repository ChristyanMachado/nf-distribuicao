-- Fila exclusiva e idempotente para recuperar XML/DANFE já emitidos.
-- Não altera tarefas de emissão e nunca pode provocar uma nova nota fiscal.
CREATE TYPE "fiscal"."status_recuperacao_documento" AS ENUM(
  'PENDENTE',
  'PROCESSANDO',
  'CONCLUIDA',
  'ERRO'
);

CREATE TABLE "fiscal"."recuperacoes_documentos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nota_id" uuid NOT NULL,
  "status" "fiscal"."status_recuperacao_documento" DEFAULT 'PENDENTE' NOT NULL,
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
  CONSTRAINT "recuperacoes_documentos_tentativas_check"
    CHECK ("tentativas" >= 0),
  CONSTRAINT "recuperacoes_documentos_codigo_erro_check"
    CHECK (
      "codigo_erro" IS NULL
      OR "codigo_erro" ~ '^[A-Z][A-Z0-9_]{2,63}$'
    ),
  CONSTRAINT "recuperacoes_documentos_mensagem_check"
    CHECK (
      "mensagem_status" IS NULL
      OR (
        length("mensagem_status") <= 300
        AND "mensagem_status" !~ E'[\\n\\r]'
      )
    ),
  CONSTRAINT "recuperacoes_documentos_reserva_check"
    CHECK (
      (
        "status" = 'PROCESSANDO'
        AND "reservada_por" IS NOT NULL
        AND "reserva_token" IS NOT NULL
        AND "reserva_expira_em" IS NOT NULL
      )
      OR (
        "status" <> 'PROCESSANDO'
        AND "reservada_por" IS NULL
        AND "reserva_token" IS NULL
        AND "reserva_expira_em" IS NULL
      )
    )
);

ALTER TABLE "fiscal"."recuperacoes_documentos"
  ADD CONSTRAINT "recuperacoes_documentos_nota_id_notas_id_fk"
  FOREIGN KEY ("nota_id") REFERENCES "fiscal"."notas"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "recuperacoes_documentos_nota_unica_idx"
  ON "fiscal"."recuperacoes_documentos" ("nota_id");

CREATE INDEX "recuperacoes_documentos_fila_idx"
  ON "fiscal"."recuperacoes_documentos" ("solicitada_em", "id")
  WHERE "status" IN ('PENDENTE', 'PROCESSANDO');

-- O Web usa a conexão privada do servidor e o Worker recebe somente as
-- permissões mínimas por provisionamento explícito.
REVOKE ALL ON TABLE "fiscal"."recuperacoes_documentos" FROM PUBLIC;
