-- Executar DEPOIS do conteúdo da 0016, na MESMA transação de QA, e ROLLBACK.
-- Não é migration. Usa somente seed fictício; não abre portal nem Storage.
-- Testa o banco com privilégios de executor via SET ROLE. A sessão autenticada
-- continua sendo a do administrador de QA, cadastrada deliberadamente no teste.
-- Isso NÃO substitui teste de duas conexões autenticadas concorrentes.
CREATE ROLE nf_coord_rollback_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT nf_coord_rollback_test TO postgres;
GRANT USAGE ON SCHEMA fiscal TO nf_coord_rollback_test;
GRANT SELECT ON fiscal.tarefas,fiscal.notas,fiscal.workers,fiscal.worker_coordination,
 fiscal.cancelamentos_fiscais,fiscal.recuperacoes_documentos TO nf_coord_rollback_test;
GRANT UPDATE(status,reservada_por,reserva_token,reserva_expira_em,tentativas,iniciado_em,
 atualizado_em,mensagem_status,ultimo_erro,codigo_erro,concluido_em) ON fiscal.tarefas TO nf_coord_rollback_test;
GRANT UPDATE(status,reservada_por,reserva_token,reserva_expira_em,tentativas,iniciada_em,
 atualizado_em,mensagem_status,codigo_erro,concluida_em,external_started_at) ON fiscal.cancelamentos_fiscais TO nf_coord_rollback_test;
GRANT INSERT(tarefa_id,cliente_id,status,valor_total) ON fiscal.notas TO nf_coord_rollback_test;
GRANT UPDATE(pdf_path,xml_path,documento_expira_em,limpeza_reserva_token,limpeza_reserva_expira_em)
 ON fiscal.notas TO nf_coord_rollback_test;
GRANT EXECUTE ON FUNCTION fiscal.reservar_tarefas_worker(text,integer,integer),
 fiscal.worker_start(text,uuid,text,integer),fiscal.worker_heartbeat(text,uuid,boolean,text),
 fiscal.worker_admission(text,uuid),fiscal.worker_summary(text,uuid),fiscal.worker_stop(text,uuid),
 fiscal.worker_recover_abandoned(text,uuid) TO nf_coord_rollback_test;
INSERT INTO fiscal.workers(worker_id,db_role,priority) VALUES ('qa-pc',session_user,10);
INSERT INTO fiscal.lotes_distribuicao(id,data,numero) VALUES ('10000000-0000-4000-8000-000000000001','2099-01-01',999001);
INSERT INTO fiscal.tarefas(id,cliente_id,emitente_id,lote_id,data,contrato_versao,payload_worker,payload_hash)
SELECT '10000000-0000-4000-8000-000000000002',c.id,e.id,'10000000-0000-4000-8000-000000000001',
 '2099-01-01',1,'{}',repeat('a',64) FROM fiscal.clientes c CROSS JOIN fiscal.emitentes e LIMIT 1;
INSERT INTO fiscal.tarefas(id,cliente_id,emitente_id,data,contrato_versao,payload_worker,payload_hash)
SELECT '10000000-0000-4000-8000-000000000003',cliente_id,emitente_id,'2099-01-01',1,'{}',repeat('b',64)
 FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000002';
UPDATE fiscal.worker_coordination SET enabled=true WHERE id;
SET LOCAL ROLE nf_coord_rollback_test;
SELECT set_config('fiscal.worker_id','qa-pc',true),set_config('fiscal.worker_run_id','20000000-0000-4000-8000-000000000001',true);
SELECT fiscal.worker_start('qa-pc','20000000-0000-4000-8000-000000000001','qa-v1',1);
SELECT fiscal.worker_heartbeat('qa-pc','20000000-0000-4000-8000-000000000001',false,NULL);
DO $$ BEGIN
  IF NOT fiscal.worker_admission('qa-pc','20000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'admissao ausente'; END IF;
  BEGIN
    PERFORM fiscal.worker_start('falso','20000000-0000-4000-8000-000000000002','qa',1);
    RAISE EXCEPTION 'falso aceito';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM fiscal.worker_start('qa-pc','20000000-0000-4000-8000-000000000002','qa',1);
    RAISE EXCEPTION 'duplo processo aceito';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
SELECT * FROM fiscal.reservar_tarefas_worker('qa-pc',1,900);
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000002'
      AND owner_worker_id='qa-pc' AND owner_worker_run_id='20000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'claim nao vinculado'; END IF;
END $$;
UPDATE fiscal.tarefas SET status='EMITINDO' WHERE id='10000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000002' AND external_started_at IS NOT NULL) THEN
    RAISE EXCEPTION 'fronteira ausente'; END IF;
END $$;
RESET ROLE;
UPDATE fiscal.tarefas SET reserva_expira_em=now()-interval '1 second' WHERE id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE nf_coord_rollback_test;
SELECT fiscal.worker_recover_abandoned('qa-pc','20000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000002' AND status='AGUARDANDO_CONFERENCIA') THEN
    RAISE EXCEPTION 'efeito repetivel'; END IF;
  BEGIN
    UPDATE fiscal.tarefas SET status='PROCESSANDO' WHERE id='10000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'conferencia reaberta pelo executor';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    UPDATE fiscal.tarefas SET status='PROCESSANDO',reservada_por='qa-pc',reserva_token=NULL,
      reserva_expira_em=NULL,tentativas=1 WHERE id='10000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'claim incompleto aceito';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  UPDATE fiscal.tarefas SET status='PROCESSANDO',reservada_por='qa-pc',reserva_token=gen_random_uuid(),
    reserva_expira_em=now()+interval '900 seconds',tentativas=1 WHERE id='10000000-0000-4000-8000-000000000003';
END $$;
RESET ROLE;
UPDATE fiscal.tarefas SET reserva_expira_em=now()-interval '1 second' WHERE id='10000000-0000-4000-8000-000000000003';
SET LOCAL ROLE nf_coord_rollback_test;
SELECT fiscal.worker_recover_abandoned('qa-pc','20000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000003' AND status='PENDENTE' AND reserva_token IS NULL) THEN
    RAISE EXCEPTION 'pre-envio nao recuperado'; END IF;
END $$;
SELECT fiscal.worker_stop('qa-pc','20000000-0000-4000-8000-000000000001');
SELECT fiscal.worker_start('qa-pc','20000000-0000-4000-8000-000000000002','qa-v2',1);
DO $$ BEGIN
  BEGIN
    PERFORM fiscal.worker_heartbeat('qa-pc','20000000-0000-4000-8000-000000000001',false,NULL);
    RAISE EXCEPTION 'boot antigo reviveu';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
RESET ROLE;
-- Repete a ordem REAL de registrar_emissao_autorizada: UPDATE EMITIDA e lease
-- NULL primeiro; INSERT nota em seguida. Nenhuma chamada ao portal/Storage.
INSERT INTO fiscal.tarefas(id,cliente_id,emitente_id,data,contrato_versao,payload_worker,payload_hash)
 SELECT '10000000-0000-4000-8000-000000000004',cliente_id,emitente_id,'2099-01-01',1,'{}',repeat('c',64)
 FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE nf_coord_rollback_test;
SELECT set_config('fiscal.worker_run_id','20000000-0000-4000-8000-000000000002',true);
SELECT fiscal.worker_heartbeat('qa-pc','20000000-0000-4000-8000-000000000002',false,NULL);
UPDATE fiscal.tarefas SET status='PROCESSANDO',reservada_por='qa-pc',reserva_token=gen_random_uuid(),
 reserva_expira_em=now()+interval '900 seconds',tentativas=1 WHERE id='10000000-0000-4000-8000-000000000004';
DO $$ BEGIN
  BEGIN
    UPDATE fiscal.tarefas SET reserva_token=gen_random_uuid() WHERE id='10000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'token trocado em reserva ativa';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    INSERT INTO fiscal.notas(tarefa_id,cliente_id,status,valor_total)
      SELECT id,cliente_id,'AUTORIZADA',1 FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'nota inserida antes da autorizacao';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE fiscal.tarefas SET status='EMITINDO' WHERE id='10000000-0000-4000-8000-000000000004';
UPDATE fiscal.tarefas SET status='EMITIDA',reserva_expira_em=NULL,concluido_em=now()
 WHERE id='10000000-0000-4000-8000-000000000004';
INSERT INTO fiscal.notas(tarefa_id,cliente_id,status,valor_total)
 SELECT id,cliente_id,'AUTORIZADA',1 FROM fiscal.tarefas WHERE id='10000000-0000-4000-8000-000000000004';
RESET ROLE;
INSERT INTO fiscal.cancelamentos_fiscais(id,nota_id,motivo)
 SELECT '40000000-0000-4000-8000-000000000001',id,'Somente teste de rollback'
 FROM fiscal.notas WHERE tarefa_id='10000000-0000-4000-8000-000000000004';
SET LOCAL ROLE nf_coord_rollback_test;
SELECT set_config('fiscal.worker_run_id','20000000-0000-4000-8000-000000000002',true);
SELECT fiscal.worker_heartbeat('qa-pc','20000000-0000-4000-8000-000000000002',false,NULL);
UPDATE fiscal.cancelamentos_fiscais SET status='PROCESSANDO',reservada_por='qa-pc',reserva_token=gen_random_uuid(),
 reserva_expira_em=now()+interval '900 seconds',tentativas=1 WHERE id='40000000-0000-4000-8000-000000000001';
UPDATE fiscal.cancelamentos_fiscais SET external_started_at=now() WHERE id='40000000-0000-4000-8000-000000000001';
RESET ROLE;
UPDATE fiscal.cancelamentos_fiscais SET reserva_expira_em=now()-interval '1 second' WHERE id='40000000-0000-4000-8000-000000000001';
SET LOCAL ROLE nf_coord_rollback_test;
SELECT fiscal.worker_recover_abandoned('qa-pc','20000000-0000-4000-8000-000000000002');
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM fiscal.cancelamentos_fiscais WHERE id='40000000-0000-4000-8000-000000000001'
    AND status='AGUARDANDO_CONFERENCIA' AND reserva_token IS NULL) THEN RAISE EXCEPTION 'cancelamento incerto repetivel'; END IF;
  BEGIN
    UPDATE fiscal.workers SET priority=1 WHERE worker_id='qa-pc';
    RAISE EXCEPTION 'worker pode elevar prioridade';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO fiscal.workers(worker_id,db_role,priority,run_id,lease_expires_at,draining)
 VALUES ('qa-preferido','qa_other_identity',5,gen_random_uuid(),now()+interval '120 seconds',false);
SET LOCAL ROLE nf_coord_rollback_test;
DO $$ BEGIN
  IF fiscal.worker_admission('qa-pc','20000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'backup competiu com principal'; END IF;
END $$;
RESET ROLE;
UPDATE fiscal.workers SET lease_expires_at=now()-interval '1 second' WHERE worker_id='qa-preferido';
SET LOCAL ROLE nf_coord_rollback_test;
DO $$ BEGIN
  IF NOT fiscal.worker_admission('qa-pc','20000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'failover nao liberado'; END IF;
END $$;
-- Novo processo retoma apenas upload autorizado. A posse do boot antigo não
-- autoriza efeitos fiscais, mas os metadados idempotentes continuam recuperáveis.
SELECT fiscal.worker_stop('qa-pc','20000000-0000-4000-8000-000000000002');
SELECT fiscal.worker_start('qa-pc','20000000-0000-4000-8000-000000000003','qa-v3',1);
SELECT set_config('fiscal.worker_run_id','20000000-0000-4000-8000-000000000003',true);
SELECT fiscal.worker_heartbeat('qa-pc','20000000-0000-4000-8000-000000000003',false,NULL);
UPDATE fiscal.notas SET pdf_path='qa/rollback.pdf',xml_path='qa/rollback.xml'
 WHERE tarefa_id='10000000-0000-4000-8000-000000000004';
UPDATE fiscal.tarefas SET status='DOCUMENTOS_ARMAZENADOS'
 WHERE id='10000000-0000-4000-8000-000000000004';
-- Mesma repetição que ocorre se a resposta de persistência do upload se perder.
UPDATE fiscal.notas SET pdf_path='qa/rollback.pdf',xml_path='qa/rollback.xml'
 WHERE tarefa_id='10000000-0000-4000-8000-000000000004';
UPDATE fiscal.tarefas SET status='DOCUMENTOS_ARMAZENADOS'
 WHERE id='10000000-0000-4000-8000-000000000004';
-- Limpeza: não roubar reserva viva nem concluir depois de seu vencimento.
UPDATE fiscal.notas SET limpeza_reserva_token=gen_random_uuid(),limpeza_reserva_expira_em=now()+interval '300 seconds'
 WHERE tarefa_id='10000000-0000-4000-8000-000000000004';
DO $$ BEGIN
  BEGIN
    UPDATE fiscal.notas SET limpeza_reserva_token=gen_random_uuid()
      WHERE tarefa_id='10000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'limpeza viva roubada';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
RESET ROLE;
UPDATE fiscal.notas SET limpeza_reserva_expira_em=now()-interval '1 second'
 WHERE tarefa_id='10000000-0000-4000-8000-000000000004';
SET LOCAL ROLE nf_coord_rollback_test;
DO $$ BEGIN
  BEGIN
    UPDATE fiscal.notas SET limpeza_reserva_token=NULL,limpeza_reserva_expira_em=NULL,pdf_path=NULL,xml_path=NULL
      WHERE tarefa_id='10000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'limpeza vencida concluiu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT tasks_completed FROM fiscal.worker_status WHERE worker_id='qa-pc')<>1 THEN
    RAISE EXCEPTION 'contador perdeu nota com documentos'; END IF;
END $$;
SELECT true AS rollback_tests_passed, (SELECT count(*) FROM fiscal.worker_status) AS workers_no_teste;
