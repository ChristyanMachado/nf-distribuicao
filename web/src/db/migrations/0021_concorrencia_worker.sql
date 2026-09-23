-- Preferencia de concorrencia isolada por executor. Defaults em 1 preservam
-- o comportamento vigente; a UI nunca altera o teto administrativo.
ALTER TABLE fiscal.workers
  ADD COLUMN requested_mode text NOT NULL DEFAULT 'MANUAL'
    CHECK (requested_mode IN ('MANUAL','AUTOMATICO')),
  ADD COLUMN manual_capacity smallint NOT NULL DEFAULT 1
    CHECK (manual_capacity BETWEEN 1 AND 3),
  ADD COLUMN local_capacity_limit smallint NOT NULL DEFAULT 1
    CHECK (local_capacity_limit BETWEEN 1 AND 3),
  ADD COLUMN automatic_max smallint NOT NULL DEFAULT 1
    CHECK (automatic_max BETWEEN 1 AND 3),
  ADD COLUMN concurrency_mode text NOT NULL DEFAULT 'MANUAL'
    CHECK (concurrency_mode IN ('MANUAL','AUTOMATICO')),
  ADD COLUMN suggested_capacity smallint NOT NULL DEFAULT 1
    CHECK (suggested_capacity BETWEEN 1 AND 3),
  ADD COLUMN decision_reason text NOT NULL DEFAULT 'BOOTSTRAP'
    CHECK (decision_reason ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  ADD COLUMN decision_at timestamptz,
  ADD COLUMN config_applied_at timestamptz,
  ADD COLUMN concurrency_updated_by text,
  ADD COLUMN concurrency_updated_at timestamptz;

-- O teto administrativo do banco é a barreira autoritativa. O limite local é
-- telemetria/configuração operacional reportada pelo Worker; o processo também
-- limita localmente cada ciclo e não recebe acesso para alterar capacity_limit.
-- A identidade da conexão, run e lease são revalidados.
CREATE FUNCTION fiscal.worker_set_capacity(
  p_id text,
  p_run uuid,
  p_mode text,
  p_capacity integer,
  p_local_limit integer,
  p_suggested integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w fiscal.workers;
DECLARE active_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(748231,16);
  SELECT * INTO w FROM fiscal.workers
   WHERE worker_id=p_id AND db_role=session_user AND run_id=p_run
   FOR UPDATE;
  IF NOT FOUND OR NOT w.enabled OR w.lease_expires_at IS NULL
     OR w.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'sessao do executor vencida' USING ERRCODE='55000';
  END IF;
  IF p_id IS NULL OR p_run IS NULL OR p_mode IS NULL
     OR p_capacity IS NULL OR p_local_limit IS NULL
     OR p_suggested IS NULL OR p_reason IS NULL
     OR p_mode NOT IN ('MANUAL','AUTOMATICO')
     OR p_local_limit NOT BETWEEN 1 AND 3
     OR p_capacity NOT BETWEEN 1 AND least(3,w.capacity_limit,p_local_limit)
     OR p_suggested NOT BETWEEN 1 AND 3
     OR p_reason !~ '^[A-Z][A-Z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'capacidade ou politica invalida' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO active_count FROM (
    SELECT id FROM fiscal.tarefas
      WHERE owner_worker_id=p_id AND owner_worker_run_id=p_run
        AND status IN ('PROCESSANDO','EMITINDO')
    UNION ALL SELECT id FROM fiscal.cancelamentos_fiscais
      WHERE owner_worker_id=p_id AND owner_worker_run_id=p_run AND status='PROCESSANDO'
    UNION ALL SELECT id FROM fiscal.recuperacoes_documentos
      WHERE owner_worker_id=p_id AND owner_worker_run_id=p_run AND status='PROCESSANDO'
  ) active;
  IF active_count<>0 THEN
    RAISE EXCEPTION 'capacidade so pode mudar entre ciclos' USING ERRCODE='55000';
  END IF;
  UPDATE fiscal.workers SET
    reported_capacity=p_capacity,
    local_capacity_limit=p_local_limit,
    concurrency_mode=p_mode,
    suggested_capacity=p_suggested,
    decision_reason=p_reason,
    decision_at=clock_timestamp(),
    config_applied_at=clock_timestamp()
  WHERE worker_id=p_id;
  RETURN jsonb_build_object('capacity',p_capacity,'mode',p_mode,'applied',true);
END $$;

REVOKE ALL ON FUNCTION fiscal.worker_set_capacity(text,uuid,text,integer,integer,integer,text)
  FROM PUBLIC,anon,authenticated;
DO $$
DECLARE executor_role name;
BEGIN
  FOR executor_role IN
    SELECT DISTINCT w.db_role
    FROM fiscal.workers w
    JOIN pg_catalog.pg_roles r ON r.rolname=w.db_role
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION fiscal.worker_set_capacity(text,uuid,text,integer,integer,integer,text) TO %I',
      executor_role
    );
  END LOOP;
END $$;

-- Extensão aditiva da view já sanitizada; sem db_role, lease tokens ou payload.
CREATE OR REPLACE VIEW fiscal.worker_status AS
WITH active AS (
 SELECT owner_worker_id wid,id::text task FROM fiscal.tarefas WHERE status IN ('PROCESSANDO','EMITINDO')
 UNION ALL SELECT owner_worker_id wid,id::text FROM fiscal.cancelamentos_fiscais WHERE status='PROCESSANDO'
 UNION ALL SELECT owner_worker_id wid,id::text FROM fiscal.recuperacoes_documentos WHERE status='PROCESSANDO'
), completed AS (
 SELECT owner_worker_id wid FROM fiscal.tarefas WHERE status IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS')
 UNION ALL SELECT owner_worker_id wid FROM fiscal.cancelamentos_fiscais WHERE status='CONCLUIDO'
 UNION ALL SELECT owner_worker_id wid FROM fiscal.recuperacoes_documentos WHERE status='CONCLUIDA'
)
SELECT w.worker_id,w.priority,w.enabled,w.capacity_limit,w.reported_capacity,
 w.heartbeat_at,w.lease_expires_at,w.version,w.draining,w.last_error_code,w.last_error_at,
 CASE WHEN NOT w.enabled THEN 'DISABLED' WHEN w.lease_expires_at IS NULL OR w.lease_expires_at<=now() THEN 'OFFLINE'
 WHEN w.draining THEN 'DRAINING' WHEN EXISTS (SELECT FROM active WHERE wid=w.worker_id) THEN 'BUSY' ELSE 'ONLINE' END AS state,
 ARRAY(SELECT task FROM active WHERE wid=w.worker_id ORDER BY task) AS active_task_ids,
 (SELECT count(*) FROM completed WHERE wid=w.worker_id) AS tasks_completed,
 coalesce(w.worker_id=(SELECT worker_id FROM fiscal.workers WHERE enabled AND NOT draining AND lease_expires_at>now() ORDER BY priority,worker_id LIMIT 1),false) AS preferred,
 (SELECT enabled FROM fiscal.worker_coordination WHERE id) AS coordination_enabled,
 now() AS server_now,
 w.requested_mode,w.concurrency_mode,w.manual_capacity,w.automatic_max,
 w.local_capacity_limit,
 w.suggested_capacity,w.decision_reason,w.decision_at,w.config_applied_at,
 w.concurrency_updated_at
FROM fiscal.workers w;
REVOKE ALL ON fiscal.worker_status FROM PUBLIC,anon,authenticated;
