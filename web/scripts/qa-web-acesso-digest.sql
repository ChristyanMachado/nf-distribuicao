-- Aplicada somente no QA szakgftippcqtuqwxsox: qa_web_acesso_digest.
-- O papel já tem search_path=fiscal,public,extensions, mas faltava USAGE.
GRANT USAGE ON SCHEMA extensions TO nf_homologacao_web;
GRANT EXECUTE ON FUNCTION extensions.digest(text,text) TO nf_homologacao_web;
