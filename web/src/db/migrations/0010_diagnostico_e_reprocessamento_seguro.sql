-- Diagnóstico estruturado permite orientar o usuário sem expor exceções e
-- libera nova tentativa somente para falhas comprovadamente pré-emissão.
ALTER TABLE "fiscal"."tarefas"
  ADD COLUMN "codigo_erro" text;

ALTER TABLE "fiscal"."tarefas"
  ADD CONSTRAINT "tarefas_codigo_erro_formato_check"
  CHECK (
    "codigo_erro" IS NULL
    OR "codigo_erro" ~ '^[A-Z][A-Z0-9_]{2,63}$'
  );
