-- Idempotência de ponta a ponta: duplo toque/retry HTTP não cria outro lote;
-- cada reserva do Worker recebe token próprio, mesmo se o worker_id se repetir.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "fiscal"."lotes_distribuicao"
  ADD COLUMN "chave_idempotencia" uuid;
CREATE UNIQUE INDEX "lotes_distribuicao_chave_idempotencia_idx"
  ON "fiscal"."lotes_distribuicao" ("chave_idempotencia");

ALTER TABLE "fiscal"."tarefas" ADD COLUMN "reserva_token" uuid;
ALTER TABLE "fiscal"."tarefas" ADD COLUMN "mensagem_status" text;
ALTER TABLE "fiscal"."tarefas"
  ADD COLUMN "contrato_versao" integer,
  ADD COLUMN "payload_worker" jsonb,
  ADD COLUMN "payload_hash" text;
ALTER TABLE "fiscal"."notas" ADD COLUMN "protocolo_autorizacao" text;
CREATE UNIQUE INDEX "notas_tarefa_unica_idx" ON "fiscal"."notas" ("tarefa_id");
CREATE UNIQUE INDEX "notas_chave_acesso_unica_idx" ON "fiscal"."notas" ("chave_acesso") WHERE "chave_acesso" IS NOT NULL;
CREATE UNIQUE INDEX "tarefas_lote_cliente_emitente_idx" ON "fiscal"."tarefas" ("lote_id", "cliente_id", "emitente_id") WHERE "lote_id" IS NOT NULL;
CREATE UNIQUE INDEX "tarefas_reserva_token_idx" ON "fiscal"."tarefas" ("reserva_token") WHERE "reserva_token" IS NOT NULL;

ALTER TABLE "fiscal"."tarefas" ADD CONSTRAINT "tarefas_snapshot_completo_check"
  CHECK (
    ("contrato_versao" IS NULL AND "payload_worker" IS NULL AND "payload_hash" IS NULL)
    OR
    ("contrato_versao" = 1 AND "payload_worker" IS NOT NULL AND "payload_hash" ~ '^[0-9a-f]{64}$')
  );

DROP FUNCTION "fiscal"."reservar_tarefas_worker"(text, integer, integer);
CREATE FUNCTION "fiscal"."reservar_tarefas_worker"(
  p_worker_id text,
  p_limite integer DEFAULT 1,
  p_lease_segundos integer DEFAULT 900
)
RETURNS TABLE ("tarefa_id" uuid, "reserva_token" uuid)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_worker_id IS NULL
     OR length(trim(p_worker_id)) = 0
     OR length(trim(p_worker_id)) > 120 THEN
    RAISE EXCEPTION 'identificador do worker inválido';
  END IF;
  IF p_limite IS NULL
     OR p_lease_segundos IS NULL
     OR p_limite < 1
     OR p_limite > 20
     OR p_lease_segundos < 60
     OR p_lease_segundos > 3600 THEN
    RAISE EXCEPTION 'limite ou duração da reserva inválidos';
  END IF;
  RETURN QUERY
  WITH candidatas AS (
    SELECT t.id FROM "fiscal"."tarefas" t
    WHERE t.status = 'PENDENTE' AND t.lote_id IS NOT NULL
      AND t.contrato_versao = 1 AND t.payload_worker IS NOT NULL AND t.payload_hash IS NOT NULL
    ORDER BY t.criado_em, t.id FOR UPDATE SKIP LOCKED LIMIT p_limite
  ), reservadas AS (
    UPDATE "fiscal"."tarefas" t
    SET status='PROCESSANDO', reservada_por=trim(p_worker_id),
        reserva_token=gen_random_uuid(),
        reserva_expira_em=now()+make_interval(secs => p_lease_segundos),
        tentativas=t.tentativas+1, iniciado_em=COALESCE(t.iniciado_em,now()),
        atualizado_em=now()
    FROM candidatas c WHERE t.id=c.id
    RETURNING t.id, t.reserva_token
  ) SELECT id, reserva_token FROM reservadas;
END;
$$;

-- Funções PostgreSQL novas recebem EXECUTE de PUBLIC por padrão. A fila
-- contém dados fiscais e só deve ser liberada explicitamente para o papel
-- dedicado do Worker durante o provisionamento da VM.
REVOKE ALL ON FUNCTION "fiscal"."reservar_tarefas_worker"(text, integer, integer) FROM PUBLIC;
