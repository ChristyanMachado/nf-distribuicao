-- Provisionamento exclusivo de QA; aplicar somente em szakgftippcqtuqwxsox.
-- Senha e habilitação de LOGIN são provisionadas fora da migration.
CREATE ROLE nf_homologacao_worker NOLOGIN NOSUPERUSER NOCREATEDB
 NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4;
GRANT CONNECT ON DATABASE postgres TO nf_homologacao_worker;
GRANT USAGE ON SCHEMA fiscal TO nf_homologacao_worker;
GRANT USAGE ON TYPE fiscal.status_tarefa,fiscal.status_cancelamento_fiscal TO nf_homologacao_worker;
GRANT SELECT ON fiscal.tarefas,fiscal.notas,fiscal.configuracoes_operacionais,
 fiscal.recuperacoes_documentos,fiscal.cancelamentos_fiscais TO nf_homologacao_worker;
GRANT UPDATE (status,reservada_por,reserva_token,reserva_expira_em,tentativas,
 iniciado_em,atualizado_em,mensagem_status,ultimo_erro,codigo_erro,concluido_em)
 ON fiscal.tarefas TO nf_homologacao_worker;
GRANT INSERT (tarefa_id,cliente_id,numero,chave_acesso,protocolo_autorizacao,
 status,valor_total,data_emissao) ON fiscal.notas TO nf_homologacao_worker;
GRANT UPDATE (pdf_path,xml_path,documento_expira_em,limpeza_reserva_token,
 limpeza_reserva_expira_em,status,mensagem_erro) ON fiscal.notas TO nf_homologacao_worker;
GRANT UPDATE (status,tentativas,reservada_por,reserva_token,reserva_expira_em,
 mensagem_status,codigo_erro,iniciada_em,concluida_em,atualizado_em)
 ON fiscal.recuperacoes_documentos TO nf_homologacao_worker;
GRANT UPDATE (status,tentativas,reservada_por,reserva_token,reserva_expira_em,
 mensagem_status,codigo_erro,iniciada_em,concluida_em,atualizado_em,external_started_at)
 ON fiscal.cancelamentos_fiscais TO nf_homologacao_worker;
GRANT EXECUTE ON FUNCTION fiscal.reservar_tarefas_worker(text,integer,integer),
 fiscal.worker_coordination_enabled() TO nf_homologacao_worker,nf_homologacao_web;
REVOKE EXECUTE ON FUNCTION fiscal.reservar_tarefas_worker(text,integer,integer)
 FROM nf_homologacao_web;

GRANT SELECT,INSERT,UPDATE ON fiscal.trocas_mercado TO nf_homologacao_web;
GRANT SELECT,INSERT ON fiscal.trocas_lancamentos,fiscal.impressoes_roteiro TO nf_homologacao_web;
CREATE POLICY qa_web_lancamentos_select ON fiscal.trocas_lancamentos
 FOR SELECT TO nf_homologacao_web USING (true);
CREATE POLICY qa_web_lancamentos_insert ON fiscal.trocas_lancamentos
 FOR INSERT TO nf_homologacao_web WITH CHECK (true);
CREATE POLICY qa_web_impressoes_select ON fiscal.impressoes_roteiro
 FOR SELECT TO nf_homologacao_web USING (true);
CREATE POLICY qa_web_impressoes_insert ON fiscal.impressoes_roteiro
 FOR INSERT TO nf_homologacao_web WITH CHECK (true);
GRANT SELECT ON fiscal.worker_status TO nf_homologacao_web;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES ('documentos-fiscais','documentos-fiscais',false,20971520,
 ARRAY['application/pdf','application/xml','text/xml']);
