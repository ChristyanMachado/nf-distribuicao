import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definida.");

const sql = postgres(connectionString, { prepare: false });

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

  console.log(
    JSON.stringify({
      colunasIntegracaoSemSegredo: colunas.length === 2,
      indiceReferenciaUnica: indices.length === 1,
      emitentes,
    }),
  );
} finally {
  await sql.end();
}
