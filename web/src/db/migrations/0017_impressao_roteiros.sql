-- Fila privada de impressão. A existência do roteiro não implica impressão:
-- somente o Worker, após conferir todas as notas AUTORIZADA do lote, pode
-- reservar e encaminhar o PDF para a fila local da impressora.
CREATE TABLE fiscal.impressoes_roteiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL UNIQUE REFERENCES fiscal.lotes_distribuicao(id),
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','RESERVADA','ENVIANDO','ENVIADA','ERRO','CONFERIR')),
  reserva_token uuid,
  reservada_por text,
  reserva_expira_em timestamptz,
  solicitado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  iniciado_em timestamptz,
  enviado_em timestamptz,
  mensagem_erro text,
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE INDEX impressoes_roteiro_fila_idx ON fiscal.impressoes_roteiro (solicitado_em, id)
  WHERE status IN ('PENDENTE','RESERVADA');
--> statement-breakpoint
ALTER TABLE fiscal.impressoes_roteiro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.impressoes_roteiro FROM PUBLIC, anon, authenticated;
--> statement-breakpoint

-- A fila não aceita lotes incompletos, rejeitados ou sem nota. O limite
-- informado pelo operador evita que uma habilitação tardia imprima histórico.
CREATE FUNCTION fiscal.reservar_impressao_roteiro(p_worker text, p_desde timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j fiscal.impressoes_roteiro; token uuid := gen_random_uuid();
BEGIN
  IF p_desde IS NULL OR session_user NOT IN ('nf_worker_local','nf_worker_vm') THEN
    RAISE EXCEPTION 'executor de impressão não autorizado' USING ERRCODE='42501';
  END IF;
  UPDATE fiscal.impressoes_roteiro
    SET status='PENDENTE', reserva_token=NULL, reservada_por=NULL, reserva_expira_em=NULL,
        atualizado_em=clock_timestamp(), mensagem_erro=NULL
    WHERE status='RESERVADA' AND reserva_expira_em < clock_timestamp();
  UPDATE fiscal.impressoes_roteiro
    SET status='CONFERIR', mensagem_erro='O processo parou depois do envio à impressora; conferir antes de reenviar.',
        atualizado_em=clock_timestamp()
    WHERE status='ENVIANDO' AND reserva_expira_em < clock_timestamp();
  SELECT * INTO j FROM fiscal.impressoes_roteiro x
    WHERE x.status='PENDENTE' AND x.solicitado_em >= p_desde
      AND EXISTS (SELECT 1 FROM fiscal.tarefas t WHERE t.lote_id=x.lote_id)
      AND NOT EXISTS (
        SELECT 1 FROM fiscal.tarefas t
        LEFT JOIN fiscal.notas n ON n.tarefa_id=t.id
        WHERE t.lote_id=x.lote_id
          AND (t.status NOT IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS') OR n.status IS DISTINCT FROM 'AUTORIZADA')
      )
    ORDER BY x.solicitado_em FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE fiscal.impressoes_roteiro SET status='RESERVADA', reserva_token=token,
    reservada_por=left(p_worker,120), reserva_expira_em=clock_timestamp()+interval '30 minutes',
    atualizado_em=clock_timestamp() WHERE id=j.id;
  RETURN jsonb_build_object('id',j.id,'lote_id',j.lote_id,'token',token);
END $$;
--> statement-breakpoint
CREATE FUNCTION fiscal.iniciar_envio_roteiro(p_id uuid, p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE fiscal.impressoes_roteiro x SET status='ENVIANDO', iniciado_em=clock_timestamp(),
    atualizado_em=clock_timestamp()
    WHERE x.id=p_id AND x.status='RESERVADA' AND x.reserva_token=p_token
      AND x.reserva_expira_em>clock_timestamp()
      AND NOT EXISTS (SELECT 1 FROM fiscal.tarefas t LEFT JOIN fiscal.notas n ON n.tarefa_id=t.id
        WHERE t.lote_id=x.lote_id AND (t.status NOT IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS') OR n.status IS DISTINCT FROM 'AUTORIZADA'));
  RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION fiscal.finalizar_impressao_roteiro(p_id uuid, p_token uuid, p_status text, p_erro text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_status NOT IN ('ENVIADA','ERRO','CONFERIR') THEN RAISE EXCEPTION 'estado final inválido'; END IF;
  UPDATE fiscal.impressoes_roteiro SET status=p_status, enviado_em=CASE WHEN p_status='ENVIADA' THEN clock_timestamp() END,
    mensagem_erro=left(nullif(p_erro,''),500), atualizado_em=clock_timestamp(), reserva_expira_em=NULL
    WHERE id=p_id AND reserva_token=p_token AND status IN ('RESERVADA','ENVIANDO');
  RETURN FOUND;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fiscal.reservar_impressao_roteiro(text,timestamptz), fiscal.iniciar_envio_roteiro(uuid,uuid), fiscal.finalizar_impressao_roteiro(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fiscal.reservar_impressao_roteiro(text,timestamptz), fiscal.iniciar_envio_roteiro(uuid,uuid), fiscal.finalizar_impressao_roteiro(uuid,uuid,text,text) TO nf_worker_local, nf_worker_vm;
