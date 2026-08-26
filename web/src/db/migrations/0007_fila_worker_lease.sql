-- Fila Web -> Worker. A reserva é deliberadamente conservadora: somente
-- tarefas PENDENTE podem ser tomadas automaticamente. Uma reserva expirada
-- nunca volta sozinha para a fila, pois a emissão fiscal pode ter ocorrido
-- antes de uma queda de rede/processo e uma repetição poderia duplicar nota.

ALTER TABLE "fiscal"."tarefas"
  ADD COLUMN "tentativas" integer NOT NULL DEFAULT 0,
  ADD COLUMN "reservada_por" text,
  ADD COLUMN "reserva_expira_em" timestamp with time zone,
  ADD COLUMN "iniciado_em" timestamp with time zone,
  ADD COLUMN "concluido_em" timestamp with time zone,
  ADD COLUMN "ultimo_erro" text;

CREATE INDEX "tarefas_fila_worker_idx"
  ON "fiscal"."tarefas" ("criado_em")
  WHERE "status" = 'PENDENTE' AND "lote_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION "fiscal"."reservar_tarefas_worker"(
  p_worker_id text,
  p_limite integer DEFAULT 1,
  p_lease_segundos integer DEFAULT 900
)
RETURNS TABLE ("tarefa_id" uuid)
LANGUAGE plpgsql
AS $$
BEGIN
  IF length(trim(p_worker_id)) = 0 OR length(p_worker_id) > 120 THEN
    RAISE EXCEPTION 'identificador do worker inválido';
  END IF;
  IF p_limite < 1 OR p_limite > 20 OR p_lease_segundos < 60 OR p_lease_segundos > 3600 THEN
    RAISE EXCEPTION 'limite ou duração da reserva inválidos';
  END IF;

  RETURN QUERY
  WITH candidatas AS (
    SELECT t.id
    FROM "fiscal"."tarefas" t
    WHERE t.status = 'PENDENTE' AND t.lote_id IS NOT NULL
    ORDER BY t.criado_em, t.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limite
  ), reservadas AS (
    UPDATE "fiscal"."tarefas" t
    SET status = 'PROCESSANDO',
        reservada_por = p_worker_id,
        reserva_expira_em = now() + make_interval(secs => p_lease_segundos),
        tentativas = t.tentativas + 1,
        iniciado_em = COALESCE(t.iniciado_em, now()),
        atualizado_em = now()
    FROM candidatas c
    WHERE t.id = c.id
    RETURNING t.id
  )
  SELECT id FROM reservadas;
END;
$$;
