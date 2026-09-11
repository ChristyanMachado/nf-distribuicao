-- Corte CONTROLADO pelo administrador depois do ensaio de homologação.
-- Não desliga máquinas, não termina sessões e não altera senhas automaticamente.
BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE fiscal.tarefas,fiscal.cancelamentos_fiscais,fiscal.recuperacoes_documentos IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT FROM fiscal.tarefas WHERE status IN ('PROCESSANDO','EMITINDO'))
    OR EXISTS (SELECT FROM fiscal.cancelamentos_fiscais WHERE status='PROCESSANDO')
    OR EXISTS (SELECT FROM fiscal.recuperacoes_documentos WHERE status='PROCESSANDO') THEN
    RAISE EXCEPTION 'ha tarefas em andamento; concluir ou conferir antes do corte'; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('nf_worker_local','nf_worker_vm') AND rolcanlogin)
    OR EXISTS (SELECT FROM pg_stat_activity WHERE usename IN ('nf_worker_local','nf_worker_vm')) THEN
    RAISE EXCEPTION 'isole e encerre os executores legados antes do corte'; END IF;
  IF NOT EXISTS (SELECT FROM fiscal.workers WHERE enabled AND priority<=20 AND lease_expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'PC principal ainda nao confirmou heartbeat'; END IF;
END $$;
UPDATE fiscal.worker_coordination SET enabled=true WHERE id;
COMMIT;
-- Agora usar Resume em uma máquina por vez, começando pelo PC principal.
