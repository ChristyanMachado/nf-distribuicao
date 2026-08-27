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
  const [tarefasDuplicadas] = await sql`
    select count(*)::int as grupos
    from (
      select lote_id, cliente_id, emitente_id
      from fiscal.tarefas
      where lote_id is not null
      group by lote_id, cliente_id, emitente_id
      having count(*) > 1
    ) duplicadas
  `;
  const [notasPorTarefaDuplicadas] = await sql`
    select count(*)::int as grupos
    from (
      select tarefa_id
      from fiscal.notas
      group by tarefa_id
      having count(*) > 1
    ) duplicadas
  `;
  const [chavesDuplicadas] = await sql`
    select count(*)::int as grupos
    from (
      select chave_acesso
      from fiscal.notas
      where chave_acesso is not null
      group by chave_acesso
      having count(*) > 1
    ) duplicadas
  `;
  const [reservasAtivas] = await sql`
    select count(*)::int as total
    from fiscal.tarefas
    where status in ('PROCESSANDO', 'EMITINDO')
  `;

  const seguro =
    tarefasDuplicadas.grupos === 0
    && notasPorTarefaDuplicadas.grupos === 0
    && chavesDuplicadas.grupos === 0
    && reservasAtivas.total === 0;

  console.log(JSON.stringify({
    seguroParaMigrar: seguro,
    conflitos: {
      tarefasDuplicadas: tarefasDuplicadas.grupos,
      notasPorTarefaDuplicadas: notasPorTarefaDuplicadas.grupos,
      chavesDuplicadas: chavesDuplicadas.grupos,
      reservasAtivas: reservasAtivas.total,
    },
  }));
  if (!seguro) process.exitCode = 2;
} finally {
  await sql.end();
}
