-- Hardening compatível do sistema de ponto, que compartilha este projeto.
-- As funções continuam disponíveis aos usuários autenticados e à service role,
-- mas deixam de ser endpoints RPC anônimos. A checagem interna de gerente é
-- preservada; migrar criação/senha para a Admin API fica para fase separada.
REVOKE EXECUTE ON FUNCTION public.is_gerente() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.criar_usuario(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.obter_email_usuario(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_usuario(uuid, text, text, text, text, boolean)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_gerente() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_usuario(text, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_email_usuario(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_usuario(uuid, text, text, text, text, boolean)
  TO authenticated, service_role;
