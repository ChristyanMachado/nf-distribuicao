-- O Web altera somente a preferência operacional de concorrência.
-- Não conceder DML direto em fiscal.workers: o RPC mantém a escrita estreita.
CREATE FUNCTION fiscal.atualizar_preferencia_concorrencia(
  p_worker_id text,
  p_mode text,
  p_capacity integer,
  p_actor text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  w fiscal.workers%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9_-]{1,64}$'
     OR p_mode IS NULL OR p_mode NOT IN ('MANUAL','AUTOMATICO')
     OR p_capacity IS NULL OR p_capacity NOT BETWEEN 1 AND 3
     OR p_actor IS NULL OR length(trim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'preferência de concorrência inválida'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO w
  FROM fiscal.workers
  WHERE worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND OR NOT w.enabled THEN
    RAISE EXCEPTION 'servidor não encontrado ou desativado'
      USING ERRCODE = '55000';
  END IF;

  IF p_capacity > least(w.capacity_limit, w.local_capacity_limit) THEN
    RAISE EXCEPTION 'capacidade não liberada para esse servidor'
      USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'MANUAL' THEN
    UPDATE fiscal.workers
    SET requested_mode = 'MANUAL',
        manual_capacity = p_capacity,
        concurrency_updated_by = left(trim(p_actor), 160),
        concurrency_updated_at = clock_timestamp()
    WHERE worker_id = p_worker_id;
  ELSE
    UPDATE fiscal.workers
    SET requested_mode = 'AUTOMATICO',
        automatic_max = p_capacity,
        concurrency_updated_by = left(trim(p_actor), 160),
        concurrency_updated_at = clock_timestamp()
    WHERE worker_id = p_worker_id;
  END IF;

  RETURN p_worker_id;
END;
$$;

-- A função fica no schema privado fiscal, com caminho fixo e SQL totalmente
-- qualificado. Apenas o dono (produção) e o papel Web isolado de homologação
-- podem executá-la; papéis públicos não recebem acesso.
ALTER FUNCTION fiscal.atualizar_preferencia_concorrencia(text,text,integer,text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION fiscal.atualizar_preferencia_concorrencia(text,text,integer,text)
  FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'nf_homologacao_web') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION fiscal.atualizar_preferencia_concorrencia(text,text,integer,text) TO nf_homologacao_web';
  END IF;
END $$;
