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
  const colunas = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'fiscal'
      and table_name = 'emitentes'
      and column_name in ('credencial_referencia', 'valor_select_nfpe')
  `;
  const indices = await sql`
    select indexname
    from pg_indexes
    where schemaname = 'fiscal'
      and tablename = 'emitentes'
      and indexname = 'emitentes_credencial_referencia_idx'
  `;
  const [emitentes] = await sql`
    select
      count(*)::int as total,
      count(credencial_referencia)::int as configurados
    from fiscal.emitentes
  `;
  const [acessoFiscalPublico] = await sql`
    select count(*)::int as total
    from information_schema.role_table_grants
    where table_schema = 'fiscal'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  `;
  const [funcoesAnonimas] = await sql`
    select
      has_function_privilege('anon', 'public.is_gerente()', 'EXECUTE')
        or has_function_privilege('anon', 'public.criar_usuario(text,text,text,text)', 'EXECUTE')
        or has_function_privilege('anon', 'public.obter_email_usuario(uuid)', 'EXECUTE')
        or has_function_privilege(
          'anon',
          'public.atualizar_usuario(uuid,text,text,text,text,boolean)',
          'EXECUTE'
        ) as existe
  `;
  const [reserva] = await sql`
    select coalesce(array_to_string(proconfig, ','), '') as configuracao
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'fiscal' and p.proname = 'reservar_tarefas_worker'
  `;

  const resultado = {
    colunasIntegracaoSemSegredo: colunas.length === 2,
    indiceReferenciaUnica: indices.length === 1,
    schemaFiscalSemAcessoDoNavegador: acessoFiscalPublico.total === 0,
    funcoesAdministrativasSemAcessoAnonimo: !funcoesAnonimas.existe,
    reservaComSearchPathFixo: reserva?.configuracao.includes("search_path="),
    emitentes,
  };

  console.log(JSON.stringify(resultado));
  if (
    !resultado.colunasIntegracaoSemSegredo
    || !resultado.indiceReferenciaUnica
    || !resultado.schemaFiscalSemAcessoDoNavegador
    || !resultado.funcoesAdministrativasSemAcessoAnonimo
    || !resultado.reservaComSearchPathFixo
  ) {
    process.exitCode = 2;
  }
} finally {
  await sql.end();
}
