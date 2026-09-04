-- Janela global para o início de novas emissões. O serviço permanece ativo
-- 24h e tarefas já reservadas continuam mesmo após o horário final.
CREATE TABLE "fiscal"."configuracoes_operacionais" (
  "id" boolean PRIMARY KEY DEFAULT TRUE NOT NULL,
  "emissao_inicio_hora" integer DEFAULT 0 NOT NULL,
  "emissao_fim_hora" integer DEFAULT 6 NOT NULL,
  "atualizado_por" text,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "configuracoes_operacionais_linha_unica_check" CHECK ("id" = TRUE),
  CONSTRAINT "configuracoes_operacionais_inicio_check"
    CHECK ("emissao_inicio_hora" BETWEEN 0 AND 23),
  CONSTRAINT "configuracoes_operacionais_fim_check"
    CHECK ("emissao_fim_hora" BETWEEN 0 AND 23),
  CONSTRAINT "configuracoes_operacionais_janela_check"
    CHECK ("emissao_inicio_hora" <> "emissao_fim_hora"),
  CONSTRAINT "configuracoes_operacionais_usuario_check"
    CHECK (
      "atualizado_por" IS NULL
      OR (
        length("atualizado_por") BETWEEN 1 AND 160
        AND "atualizado_por" !~ E'[\\n\\r]'
      )
    )
);

INSERT INTO "fiscal"."configuracoes_operacionais" (
  "id", "emissao_inicio_hora", "emissao_fim_hora"
) VALUES (TRUE, 0, 6);

REVOKE ALL ON TABLE "fiscal"."configuracoes_operacionais" FROM PUBLIC;
REVOKE ALL ON TABLE "fiscal"."configuracoes_operacionais" FROM anon, authenticated;

-- Corrige o único alerta do Advisor dentro do schema fiscal. Todos os objetos
-- referenciados pela função já são qualificados com o schema fiscal.
ALTER FUNCTION "fiscal"."reservar_tarefas_worker"(text, integer, integer)
  SET search_path = pg_catalog;
