import postgres from 'postgres';

// Diagnóstico somente leitura; não imprime URL, SQL ou dados dos cadastros.
const pipeline = Number(process.argv[2] ?? 0);
const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require', prepare: false, max: 1, max_pipeline: pipeline,
  connect_timeout: 5, idle_timeout: 5,
});
let timer;
const inicio = Date.now();
try {
  await Promise.race([
    (async () => {
      for (let rodada = 0; rodada < 3; rodada++) {
        await Promise.all(Array.from({length: 6}, () => sql`select count(*) from fiscal.clientes`));
      }
    })(),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DIAGNOSTICO_TIMEOUT')), 12000); }),
  ]);
  console.log(JSON.stringify({ok: true, pipeline, consultas: 18, ms: Date.now() - inicio}));
} catch (error) {
  console.log(JSON.stringify({ok: false, pipeline, codigo: error.code ?? error.message, ms: Date.now() - inicio}));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await sql.end({timeout: 1});
}
