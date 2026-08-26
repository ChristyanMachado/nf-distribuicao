-- Corrige ambiguidade entre a coluna de retorno reserva_token e a coluna
-- homônima da tabela, descoberta no ensaio TLS real da fila vazia.
CREATE OR REPLACE FUNCTION "fiscal"."reservar_tarefas_worker"(
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
    SELECT t.id AS candidata_id
    FROM "fiscal"."tarefas" t
    WHERE t.status = 'PENDENTE'
      AND t.lote_id IS NOT NULL
      AND t.contrato_versao = 1
      AND t.payload_worker IS NOT NULL
      AND t.payload_hash IS NOT NULL
    ORDER BY t.criado_em, t.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limite
  ), reservadas AS (
    UPDATE "fiscal"."tarefas" t
    SET status = 'PROCESSANDO',
        reservada_por = trim(p_worker_id),
        reserva_token = gen_random_uuid(),
        reserva_expira_em = now() + make_interval(secs => p_lease_segundos),
        tentativas = t.tentativas + 1,
        iniciado_em = COALESCE(t.iniciado_em, now()),
        atualizado_em = now()
    FROM candidatas c
    WHERE t.id = c.candidata_id
    RETURNING t.id AS id_reservada, t.reserva_token AS token_reservado
  )
  SELECT r.id_reservada, r.token_reservado
  FROM reservadas r;
END;
$$;

REVOKE ALL ON FUNCTION "fiscal"."reservar_tarefas_worker"(text, integer, integer) FROM PUBLIC;
