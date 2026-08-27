import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definida.");

const sql = postgres(connectionString, {
  prepare: false,
  ssl: "require",
  connect_timeout: 10,
  idle_timeout: 5,
  max: 1,
});

try {
  const [clientes] = await sql`
    select
      count(*)::int as total_ativos,
      count(*) filter (
        where nullif(trim(destinatario_nome), '') is null
           or length(regexp_replace(coalesce(cnpj, ''), '\\D', '', 'g')) <> 14
           or nullif(trim(inscricao_estadual), '') is null
           or length(regexp_replace(coalesce(cep, ''), '\\D', '', 'g')) <> 8
           or nullif(trim(numero_endereco), '') is null
      )::int as cadastros_incompletos
    from fiscal.clientes
    where ativo = true
  `;
  const [semEmitente] = await sql`
    select count(*)::int as clientes_sem_emitente
    from fiscal.clientes c
    where c.ativo = true
      and not exists (
        select 1 from fiscal.cliente_emitentes ce where ce.cliente_id = c.id
      )
  `;
  const [emitentes] = await sql`
    select
      count(*)::int as total_ativos,
      count(*) filter (
        where nullif(trim(credencial_referencia), '') is null
           or nullif(trim(valor_select_nfpe), '') is null
      )::int as integracao_incompleta
    from fiscal.emitentes
    where ativo = true
  `;
  const [produtos] = await sql`
    select
      count(*)::int as total_ativos,
      count(*) filter (
        where nullif(trim(codigo_fiscal), '') is null or regra_fiscal_id is null
      )::int as cadastros_incompletos
    from fiscal.produtos
    where ativo = true
  `;
  const [tarefas] = await sql`
    select
      count(*) filter (where status = 'PENDENTE')::int as pendentes,
      count(*) filter (where status = 'PENDENTE' and lote_id is null)::int as pendentes_sem_lote,
      count(*) filter (
        where status = 'PENDENTE'
          and lote_id is not null
          and contrato_versao = 1
          and payload_worker is not null
          and payload_hash is not null
      )::int as pendentes_prontas_worker
    from fiscal.tarefas
  `;
  const [lotes] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where numero is not null)::int as numerados,
      count(*) filter (where numero is null)::int as sem_numero
    from fiscal.lotes_distribuicao
  `;
  const colunasIntegracao = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'fiscal'
      and (
        (table_name = 'lotes_distribuicao' and column_name in ('numero', 'chave_idempotencia'))
        or (table_name = 'tarefas' and column_name in (
          'lote_id', 'reserva_token', 'contrato_versao', 'payload_worker', 'payload_hash'
        ))
        or (table_name = 'notas' and column_name = 'protocolo_autorizacao')
      )
  `;
  const [funcaoFila] = await sql`
    select
      to_regprocedure('fiscal.reservar_tarefas_worker(text,integer,integer)') is not null as existe,
      not exists (
        select 1
        from information_schema.routine_privileges
        where routine_schema = 'fiscal'
          and routine_name = 'reservar_tarefas_worker'
          and grantee = 'PUBLIC'
          and privilege_type = 'EXECUTE'
      ) as public_revogado
  `;

  console.log(JSON.stringify({
    clientes: { ...clientes, ...semEmitente },
    emitentes,
    produtos,
    tarefas,
    lotes,
    contratoDistribuicaoPronto:
      colunasIntegracao.length === 8 && funcaoFila.existe && funcaoFila.public_revogado,
    segurancaFila: funcaoFila,
  }));
} finally {
  await sql.end();
}
