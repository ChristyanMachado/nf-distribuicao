-- Incremento opt-in. Aplicar não ativa a coordenação nem reabilita papéis antigos.
CREATE TABLE fiscal.worker_coordination (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO fiscal.worker_coordination DEFAULT VALUES;
CREATE TABLE fiscal.workers (
  worker_id text PRIMARY KEY CHECK (worker_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  db_role name UNIQUE NOT NULL,
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  enabled boolean NOT NULL DEFAULT true,
  capacity_limit integer NOT NULL DEFAULT 1 CHECK (capacity_limit BETWEEN 1 AND 3),
  run_id uuid,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  version text CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'),
  reported_capacity integer CHECK (reported_capacity BETWEEN 1 AND 3),
  draining boolean NOT NULL DEFAULT true,
  last_error_code text CHECK (last_error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fiscal.worker_coordination ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal.workers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.worker_coordination,fiscal.workers FROM PUBLIC,anon,authenticated;
-- Cadastro feito pelo administrador; executores podem ler apenas o próprio registro.
CREATE POLICY worker_own_registry ON fiscal.workers FOR SELECT
  USING (db_role = session_user);
CREATE POLICY worker_read_gate ON fiscal.worker_coordination FOR SELECT USING (true);

ALTER TABLE fiscal.tarefas ADD COLUMN owner_worker_run_id uuid,
  ADD COLUMN owner_worker_id text, ADD COLUMN external_started_at timestamptz;
ALTER TABLE fiscal.cancelamentos_fiscais ADD COLUMN owner_worker_run_id uuid,
  ADD COLUMN owner_worker_id text, ADD COLUMN external_started_at timestamptz;
ALTER TABLE fiscal.recuperacoes_documentos ADD COLUMN owner_worker_run_id uuid,
  ADD COLUMN owner_worker_id text, ADD COLUMN external_started_at timestamptz;

-- Funções privadas: session_user é a credencial autenticada na conexão TLS,
-- inclusive no pooler, e não um nome arbitrário enviado pelo processo.
CREATE FUNCTION fiscal.worker_admission(p_id text,p_run uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE chosen text;
BEGIN
  IF NOT EXISTS (SELECT FROM fiscal.workers WHERE worker_id=p_id AND db_role=session_user
      AND run_id=p_run AND enabled AND NOT draining AND lease_expires_at>clock_timestamp())
     OR NOT (SELECT enabled FROM fiscal.worker_coordination WHERE id) THEN RETURN false; END IF;
  SELECT worker_id INTO chosen FROM fiscal.workers
    WHERE enabled AND NOT draining AND lease_expires_at>clock_timestamp()
    ORDER BY priority,worker_id LIMIT 1;
  RETURN chosen=p_id;
END $$;

CREATE FUNCTION fiscal.worker_summary(p_id text,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w fiscal.workers; active integer;
BEGIN
  SELECT * INTO STRICT w FROM fiscal.workers WHERE worker_id=p_id AND db_role=session_user AND run_id=p_run;
  SELECT count(*) INTO active FROM (
    SELECT id FROM fiscal.tarefas WHERE owner_worker_id=p_id AND owner_worker_run_id=p_run AND status IN ('PROCESSANDO','EMITINDO')
    UNION ALL SELECT id FROM fiscal.cancelamentos_fiscais WHERE owner_worker_id=p_id AND owner_worker_run_id=p_run AND status='PROCESSANDO'
    UNION ALL SELECT id FROM fiscal.recuperacoes_documentos WHERE owner_worker_id=p_id AND owner_worker_run_id=p_run AND status='PROCESSANDO'
  ) a;
  RETURN jsonb_build_object('admitted',fiscal.worker_admission(p_id,p_run),'active_count',active,
    'state',CASE WHEN w.draining THEN 'DRAINING' WHEN active>0 THEN 'BUSY' ELSE 'ONLINE' END,
    'priority',w.priority,'capacity_limit',w.capacity_limit,'lease_expires_at',w.lease_expires_at);
END $$;

CREATE FUNCTION fiscal.worker_start(p_id text,p_run uuid,p_version text,p_capacity integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w fiscal.workers;
BEGIN
  PERFORM pg_advisory_xact_lock(748231,16);
  SELECT * INTO w FROM fiscal.workers WHERE worker_id=p_id AND db_role=session_user FOR UPDATE;
  IF NOT FOUND OR NOT w.enabled OR p_run IS NULL OR p_capacity IS NULL
     OR p_capacity NOT BETWEEN 1 AND w.capacity_limit OR p_version IS NULL
     OR p_version !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$' THEN
    RAISE EXCEPTION 'executor nao autorizado' USING ERRCODE='42501';
  END IF;
  IF w.run_id IS NOT NULL AND w.run_id<>p_run AND w.lease_expires_at>clock_timestamp() THEN
    RAISE EXCEPTION 'executor ja possui processo ativo' USING ERRCODE='55000';
  END IF;
  UPDATE fiscal.workers SET run_id=p_run,version=p_version,reported_capacity=p_capacity,
    heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '120 seconds',draining=true
    WHERE worker_id=p_id;
  RETURN fiscal.worker_summary(p_id,p_run);
END $$;

CREATE FUNCTION fiscal.worker_heartbeat(p_id text,p_run uuid,p_draining boolean,p_error text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(748231,16);
  UPDATE fiscal.workers SET heartbeat_at=clock_timestamp(),
    lease_expires_at=clock_timestamp()+interval '120 seconds',draining=p_draining,
    last_error_code=coalesce(p_error,last_error_code),
    last_error_at=CASE WHEN p_error IS NOT NULL THEN clock_timestamp() ELSE last_error_at END
    WHERE worker_id=p_id AND db_role=session_user AND run_id=p_run AND enabled
      AND lease_expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'sessao do executor vencida' USING ERRCODE='55000'; END IF;
  RETURN fiscal.worker_summary(p_id,p_run);
END $$;

CREATE FUNCTION fiscal.worker_stop(p_id text,p_run uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(748231,16);
  UPDATE fiscal.workers SET draining=true,lease_expires_at=clock_timestamp()
    WHERE worker_id=p_id AND db_role=session_user AND run_id=p_run;
  RETURN FOUND;
END $$;

-- SECURITY INVOKER distingue escrita administrativa (Web/recuperação interna)
-- da credencial do executor; um GUC forjado não oferece bypass administrativo.
-- Um booleano não sensível permite aos papéis legados atravessar o gate OFF
-- sem receber acesso ao cadastro privado. fiscal não é schema público da API.
CREATE FUNCTION fiscal.worker_coordination_enabled() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT enabled FROM fiscal.worker_coordination WHERE id
$$;
CREATE FUNCTION fiscal.guard_worker_queue() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE w fiscal.workers; active integer; claim boolean; caller_owner boolean; grupo text;
BEGIN
  SELECT current_user=pg_get_userbyid(relowner) INTO caller_owner
    FROM pg_class WHERE oid='fiscal.worker_coordination'::regclass;
  IF caller_owner THEN RETURN NEW; END IF;
  IF NOT fiscal.worker_coordination_enabled() THEN RETURN NEW; END IF;
  -- Web possui INSERT para produzir snapshots; executor nunca recebe esse grant.
  -- Ações humanas só alteram estados fora de execução, conforme guardas do Web.
  IF has_table_privilege(current_user,'fiscal.tarefas','INSERT')
      AND OLD.status::text NOT IN ('PROCESSANDO','EMITINDO')
      AND NEW.status::text NOT IN ('PROCESSANDO','EMITINDO') THEN RETURN NEW; END IF;
  SELECT * INTO w FROM fiscal.workers WHERE db_role=session_user
    AND worker_id=current_setting('fiscal.worker_id',true)
    AND run_id::text=current_setting('fiscal.worker_run_id',true);
  IF NOT FOUND OR NOT w.enabled OR w.run_id IS NULL OR w.lease_expires_at IS NULL
     OR w.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'executor sem sessao vigente' USING ERRCODE='42501';
  END IF;
  claim := NEW.status::text='PROCESSANDO' AND
    (OLD.status::text='PENDENTE' OR (TG_TABLE_NAME='recuperacoes_documentos'
      AND OLD.status::text='PROCESSANDO' AND OLD.reserva_expira_em<clock_timestamp()));
  IF claim THEN
    PERFORM pg_advisory_xact_lock(748231,16);
    IF NOT fiscal.worker_admission(w.worker_id,w.run_id)
       OR NEW.reservada_por IS DISTINCT FROM w.worker_id THEN
      RAISE EXCEPTION 'executor em espera' USING ERRCODE='55000';
    END IF;
    IF NEW.reserva_token IS NULL OR NEW.reserva_token IS NOT DISTINCT FROM OLD.reserva_token
       OR NEW.reserva_expira_em IS NULL OR NEW.reserva_expira_em<=clock_timestamp()
       OR NEW.tentativas IS DISTINCT FROM OLD.tentativas+1 THEN
      RAISE EXCEPTION 'claim sem token, prazo ou tentativa valida' USING ERRCODE='55000';
    END IF;
    IF TG_TABLE_NAME='tarefas' THEN
      grupo:=NEW.payload_worker #>> '{tarefa,emitente,credencialReferencia}';
    ELSE
      SELECT t.payload_worker #>> '{tarefa,emitente,credencialReferencia}' INTO grupo
        FROM fiscal.notas n JOIN fiscal.tarefas t ON t.id=n.tarefa_id WHERE n.id=NEW.nota_id;
    END IF;
    -- Quando o PC volta, não abrir outra sessão do mesmo login ainda usado pela VM.
    -- Dentro de um processo os contextos da mesma credencial são serializados.
    IF grupo IS NOT NULL AND EXISTS (
      SELECT FROM (
        SELECT t.owner_worker_id wid,t.reserva_expira_em expires,t.payload_worker payload
          FROM fiscal.tarefas t WHERE t.status IN ('PROCESSANDO','EMITINDO')
        UNION ALL SELECT c.owner_worker_id,c.reserva_expira_em,t.payload_worker
          FROM fiscal.cancelamentos_fiscais c JOIN fiscal.notas n ON n.id=c.nota_id JOIN fiscal.tarefas t ON t.id=n.tarefa_id WHERE c.status='PROCESSANDO'
        UNION ALL SELECT r.owner_worker_id,r.reserva_expira_em,t.payload_worker
          FROM fiscal.recuperacoes_documentos r JOIN fiscal.notas n ON n.id=r.nota_id JOIN fiscal.tarefas t ON t.id=n.tarefa_id WHERE r.status='PROCESSANDO'
      ) a WHERE wid IS DISTINCT FROM w.worker_id AND expires>clock_timestamp()
          AND payload #>> '{tarefa,emitente,credencialReferencia}'=grupo
    ) THEN RAISE EXCEPTION 'sessao fiscal ocupada em outro executor' USING ERRCODE='55000'; END IF;
    SELECT count(*) INTO active FROM (
      SELECT id FROM fiscal.tarefas WHERE owner_worker_id=w.worker_id AND status IN ('PROCESSANDO','EMITINDO') AND reserva_expira_em>clock_timestamp()
      UNION ALL SELECT id FROM fiscal.cancelamentos_fiscais WHERE owner_worker_id=w.worker_id AND status='PROCESSANDO' AND reserva_expira_em>clock_timestamp()
      UNION ALL SELECT id FROM fiscal.recuperacoes_documentos WHERE owner_worker_id=w.worker_id AND status='PROCESSANDO' AND reserva_expira_em>clock_timestamp()
    ) a;
    IF active>=least(w.capacity_limit,w.reported_capacity) THEN
      RAISE EXCEPTION 'capacidade do executor ocupada' USING ERRCODE='55000';
    END IF;
    NEW.owner_worker_id:=w.worker_id;
    NEW.owner_worker_run_id:=w.run_id;
    NEW.external_started_at:=NULL;
  ELSE
    -- Lista fechada: possuir a linha não autoriza reabrir estado terminal/incerto.
    IF NOT (
      (TG_TABLE_NAME='tarefas' AND (
        (OLD.status::text='PROCESSANDO' AND NEW.status::text IN ('PROCESSANDO','EMITINDO','ERRO','AGUARDANDO_CONFERENCIA','PENDENTE'))
        OR (OLD.status::text='EMITINDO' AND NEW.status::text IN ('EMITINDO','EMITIDA','AGUARDANDO_CONFERENCIA'))
        OR (OLD.status::text='EMITIDA' AND NEW.status::text IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS'))
        OR (OLD.status::text='DOCUMENTOS_ARMAZENADOS' AND NEW.status::text='DOCUMENTOS_ARMAZENADOS')))
      OR (TG_TABLE_NAME='cancelamentos_fiscais' AND OLD.status::text='PROCESSANDO'
        AND NEW.status::text IN ('PROCESSANDO','CONCLUIDO','ERRO','AGUARDANDO_CONFERENCIA'))
      OR (TG_TABLE_NAME='recuperacoes_documentos' AND OLD.status::text='PROCESSANDO'
        AND NEW.status::text IN ('PROCESSANDO','CONCLUIDA','ERRO'))
    ) THEN RAISE EXCEPTION 'transicao de executor proibida' USING ERRCODE='55000'; END IF;
    IF OLD.external_started_at IS NOT NULL AND NEW.status::text IN ('PENDENTE','ERRO') THEN
      RAISE EXCEPTION 'efeito externo exige conferencia' USING ERRCODE='55000';
    END IF;
    -- Upload já autorizado pode completar após reboot no mesmo executor.
    IF NOT (TG_TABLE_NAME='tarefas' AND OLD.status::text IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS')
        AND NEW.status::text IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS')) THEN
      IF OLD.owner_worker_run_id IS DISTINCT FROM w.run_id OR OLD.reserva_expira_em IS NULL
         OR OLD.reserva_expira_em<=clock_timestamp() OR OLD.reserva_token IS NULL THEN
        RAISE EXCEPTION 'reserva pertence a outra execucao ou venceu' USING ERRCODE='55000';
      END IF;
    END IF;
    IF NEW.reserva_token IS DISTINCT FROM OLD.reserva_token
       AND NOT (NEW.reserva_token IS NULL AND (
         (TG_TABLE_NAME='tarefas' AND NEW.status::text='PENDENTE')
         OR (TG_TABLE_NAME<>'tarefas' AND NEW.status::text<>'PROCESSANDO'))) THEN
      RAISE EXCEPTION 'token da reserva imutavel' USING ERRCODE='55000';
    END IF;
    IF NEW.status::text IN ('PROCESSANDO','EMITINDO') AND
       (NEW.reserva_expira_em IS NULL OR NEW.reserva_expira_em<=clock_timestamp()
        OR NEW.reservada_por IS DISTINCT FROM w.worker_id) THEN
      RAISE EXCEPTION 'reserva ativa incompleta' USING ERRCODE='55000';
    END IF;
    IF OLD.owner_worker_id IS DISTINCT FROM w.worker_id
       OR NEW.owner_worker_id IS DISTINCT FROM OLD.owner_worker_id
       OR NEW.owner_worker_run_id IS DISTINCT FROM OLD.owner_worker_run_id THEN
      RAISE EXCEPTION 'dono da reserva diverge' USING ERRCODE='42501';
    END IF;
    IF OLD.external_started_at IS NOT NULL AND NEW.external_started_at IS DISTINCT FROM OLD.external_started_at THEN
      RAISE EXCEPTION 'fronteira externa imutavel' USING ERRCODE='55000';
    END IF;
  END IF;
  IF TG_TABLE_NAME='tarefas' AND NEW.status::text='EMITINDO' AND OLD.status::text='PROCESSANDO' THEN
    NEW.external_started_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workers_guard BEFORE UPDATE ON fiscal.tarefas FOR EACH ROW EXECUTE FUNCTION fiscal.guard_worker_queue();
CREATE TRIGGER workers_guard BEFORE UPDATE ON fiscal.cancelamentos_fiscais FOR EACH ROW EXECUTE FUNCTION fiscal.guard_worker_queue();
CREATE TRIGGER workers_guard BEFORE UPDATE ON fiscal.recuperacoes_documentos FOR EACH ROW EXECUTE FUNCTION fiscal.guard_worker_queue();

ALTER TABLE fiscal.notas ADD COLUMN limpeza_owner_worker_id text, ADD COLUMN limpeza_owner_worker_run_id uuid;
CREATE FUNCTION fiscal.guard_worker_note() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE w fiscal.workers; admin_write boolean;
BEGIN
  SELECT current_user=pg_get_userbyid(relowner) INTO admin_write
    FROM pg_class WHERE oid='fiscal.worker_coordination'::regclass;
  IF admin_write OR NOT fiscal.worker_coordination_enabled() THEN RETURN NEW; END IF;
  SELECT * INTO w FROM fiscal.workers WHERE db_role=session_user
    AND worker_id=current_setting('fiscal.worker_id',true)
    AND run_id::text=current_setting('fiscal.worker_run_id',true)
    AND enabled AND lease_expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'executor sem sessao vigente' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
    -- O fluxo existente muda a tarefa para EMITIDA (limpando o lease), depois
    -- insere a nota, na MESMA transação. Não exigir a etapa anterior aqui.
    IF NEW.status IS DISTINCT FROM 'AUTORIZADA' OR NOT EXISTS (
      SELECT FROM fiscal.tarefas WHERE id=NEW.tarefa_id AND cliente_id=NEW.cliente_id
      AND status='EMITIDA' AND external_started_at IS NOT NULL AND reserva_token IS NOT NULL
      AND owner_worker_id=w.worker_id AND owner_worker_run_id=w.run_id) THEN
      RAISE EXCEPTION 'nota sem reserva propria' USING ERRCODE='42501'; END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (NEW.status='CANCELADA' AND EXISTS (SELECT FROM fiscal.cancelamentos_fiscais
      WHERE nota_id=NEW.id AND status='PROCESSANDO' AND owner_worker_id=w.worker_id
      AND owner_worker_run_id=w.run_id AND reserva_expira_em>clock_timestamp())) THEN
      RAISE EXCEPTION 'cancelamento sem reserva propria' USING ERRCODE='42501'; END IF;
  ELSIF EXISTS (SELECT FROM fiscal.recuperacoes_documentos WHERE nota_id=NEW.id AND status='PROCESSANDO'
      AND owner_worker_id=w.worker_id AND owner_worker_run_id=w.run_id AND reserva_expira_em>clock_timestamp())
      AND NEW.limpeza_reserva_token IS NULL
      AND (OLD.limpeza_reserva_expira_em IS NULL OR OLD.limpeza_reserva_expira_em<clock_timestamp()) THEN
    RETURN NEW;
  ELSIF NEW.limpeza_reserva_token IS DISTINCT FROM OLD.limpeza_reserva_token AND NEW.limpeza_reserva_token IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(748231,16);
    IF NOT fiscal.worker_admission(w.worker_id,w.run_id) THEN RAISE EXCEPTION 'executor em espera' USING ERRCODE='55000'; END IF;
    IF OLD.limpeza_reserva_expira_em>clock_timestamp() OR NEW.limpeza_reserva_expira_em IS NULL
       OR NEW.limpeza_reserva_expira_em<=clock_timestamp() THEN
      RAISE EXCEPTION 'reserva de limpeza ainda ativa ou sem prazo' USING ERRCODE='55000'; END IF;
    NEW.limpeza_owner_worker_id:=w.worker_id;
    NEW.limpeza_owner_worker_run_id:=w.run_id;
  ELSIF OLD.limpeza_reserva_token IS NOT NULL THEN
    IF OLD.limpeza_owner_worker_id IS DISTINCT FROM w.worker_id OR OLD.limpeza_owner_worker_run_id IS DISTINCT FROM w.run_id
       OR OLD.limpeza_reserva_expira_em IS NULL OR OLD.limpeza_reserva_expira_em<=clock_timestamp() THEN
      RAISE EXCEPTION 'limpeza pertence a outro executor' USING ERRCODE='42501'; END IF;
  ELSIF NOT EXISTS (SELECT FROM fiscal.tarefas WHERE id=NEW.tarefa_id AND status IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS') AND owner_worker_id=w.worker_id)
    AND NOT EXISTS (SELECT FROM fiscal.recuperacoes_documentos WHERE nota_id=NEW.id AND status='PROCESSANDO'
      AND owner_worker_id=w.worker_id AND owner_worker_run_id=w.run_id AND reserva_expira_em>clock_timestamp()) THEN
    RAISE EXCEPTION 'documentos sem reserva propria' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workers_note_guard BEFORE INSERT OR UPDATE ON fiscal.notas FOR EACH ROW EXECUTE FUNCTION fiscal.guard_worker_note();
REVOKE ALL ON FUNCTION fiscal.guard_worker_note() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION fiscal.worker_recover_abandoned(p_id text,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE recovered integer; uncertain integer; cancelled integer;
BEGIN
  IF NOT fiscal.worker_admission(p_id,p_run) THEN RETURN '{}'::jsonb; END IF;
  -- Nunca invalidar reserva vigente com base apenas na falta de heartbeat.
  UPDATE fiscal.tarefas SET status=CASE WHEN tentativas<3 THEN 'PENDENTE'::fiscal.status_tarefa ELSE 'ERRO'::fiscal.status_tarefa END,
    reservada_por=NULL,reserva_token=NULL,reserva_expira_em=NULL,
    codigo_erro='WORKER_ABANDONED_BEFORE_EFFECT',mensagem_status='Execução interrompida antes do envio fiscal.',atualizado_em=now()
    WHERE status='PROCESSANDO' AND reserva_expira_em<clock_timestamp()
      AND owner_worker_run_id IS NOT NULL AND external_started_at IS NULL;
  GET DIAGNOSTICS recovered=ROW_COUNT;
  UPDATE fiscal.tarefas SET status='AGUARDANDO_CONFERENCIA',reserva_expira_em=NULL,
    codigo_erro='RESULTADO_FISCAL_INCERTO',mensagem_status='Executor interrompido; conferir resultado na Receita.',atualizado_em=now()
    WHERE status IN ('PROCESSANDO','EMITINDO') AND reserva_expira_em<clock_timestamp();
  GET DIAGNOSTICS uncertain=ROW_COUNT;
  UPDATE fiscal.cancelamentos_fiscais SET status=CASE
      WHEN owner_worker_run_id IS NOT NULL AND external_started_at IS NULL AND tentativas<3 THEN 'PENDENTE'::fiscal.status_cancelamento_fiscal
      WHEN owner_worker_run_id IS NOT NULL AND external_started_at IS NULL THEN 'ERRO'::fiscal.status_cancelamento_fiscal
      ELSE 'AGUARDANDO_CONFERENCIA'::fiscal.status_cancelamento_fiscal END,
    reservada_por=NULL,reserva_token=NULL,reserva_expira_em=NULL,
    codigo_erro=CASE WHEN owner_worker_run_id IS NOT NULL AND external_started_at IS NULL
      THEN 'CANCELAMENTO_NAO_ENVIADO' ELSE 'RESULTADO_CANCELAMENTO_INCERTO' END,
    mensagem_status='Executor interrompido; estado preservado conforme a fronteira fiscal.',atualizado_em=now()
    WHERE status='PROCESSANDO' AND reserva_expira_em<clock_timestamp();
  GET DIAGNOSTICS cancelled=ROW_COUNT;
  RETURN jsonb_build_object('recovered',recovered,'uncertain',uncertain,'cancellations',cancelled);
END $$;

CREATE VIEW fiscal.worker_status AS
WITH active AS (
 SELECT owner_worker_id wid,id::text task FROM fiscal.tarefas WHERE status IN ('PROCESSANDO','EMITINDO')
 UNION ALL SELECT owner_worker_id,id::text FROM fiscal.cancelamentos_fiscais WHERE status='PROCESSANDO'
 UNION ALL SELECT owner_worker_id,id::text FROM fiscal.recuperacoes_documentos WHERE status='PROCESSANDO'
), completed AS (
 SELECT owner_worker_id wid FROM fiscal.tarefas WHERE status IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS')
 UNION ALL SELECT owner_worker_id FROM fiscal.cancelamentos_fiscais WHERE status='CONCLUIDO'
 UNION ALL SELECT owner_worker_id FROM fiscal.recuperacoes_documentos WHERE status='CONCLUIDA'
)
SELECT w.worker_id,w.priority,w.enabled,w.capacity_limit,w.reported_capacity,
 w.heartbeat_at,w.lease_expires_at,w.version,w.draining,w.last_error_code,w.last_error_at,
 CASE WHEN NOT w.enabled THEN 'DISABLED' WHEN w.lease_expires_at IS NULL OR w.lease_expires_at<=now() THEN 'OFFLINE'
 WHEN w.draining THEN 'DRAINING' WHEN EXISTS (SELECT FROM active WHERE wid=w.worker_id) THEN 'BUSY' ELSE 'ONLINE' END AS state,
 ARRAY(SELECT task FROM active WHERE wid=w.worker_id ORDER BY task) AS active_task_ids,
 (SELECT count(*) FROM completed WHERE wid=w.worker_id) AS tasks_completed,
 coalesce(w.worker_id=(SELECT worker_id FROM fiscal.workers WHERE enabled AND NOT draining AND lease_expires_at>now() ORDER BY priority,worker_id LIMIT 1),false) AS preferred,
 (SELECT enabled FROM fiscal.worker_coordination WHERE id) AS coordination_enabled,
 now() AS server_now
FROM fiscal.workers w;
-- View sanitizada apenas para o servidor Web; nunca conceder a clientes Data API.
REVOKE ALL ON fiscal.worker_status FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION fiscal.worker_start(text,uuid,text,integer),fiscal.worker_heartbeat(text,uuid,boolean,text),
 fiscal.worker_stop(text,uuid),fiscal.worker_admission(text,uuid),fiscal.worker_summary(text,uuid),
 fiscal.worker_recover_abandoned(text,uuid),fiscal.guard_worker_queue() FROM PUBLIC,anon,authenticated;
