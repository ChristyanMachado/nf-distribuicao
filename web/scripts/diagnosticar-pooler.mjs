import postgres from 'postgres';

// Diagnóstico somente leitura; não imprime URL, SQL ou dados dos cadastros.
const pipeline = Number(process.argv[2] ?? 1);
const max = Number(process.argv[3] ?? 1);
const modo = process.argv[4] ?? 'leituras';
const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require', prepare: false, max, max_pipeline: pipeline,
  connect_timeout: 5, idle_timeout: 5,
});
let timer;
const inicio = Date.now();
try {
  await Promise.race([
    (async () => {
      if (modo === 'transacao') {
        // Exercita o BEGIN/COMMIT do mesmo driver, sem gravar dados fiscais.
        await sql.begin(async (tx) => { await tx`select 1`; });
      } else {
        for (let rodada = 0; rodada < 3; rodada++) {
          await Promise.all(Array.from({length: 6}, () => sql`select count(*) from fiscal.clientes`));
        }
      }
    })(),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DIAGNOSTICO_TIMEOUT')), 12000); }),
  ]);
  console.log(JSON.stringify({ok: true, max, pipeline, modo, consultas: modo === 'transacao' ? 1 : 18, ms: Date.now() - inicio}));
} catch (error) {
  console.log(JSON.stringify({ok: false, max, pipeline, codigo: error.code ?? error.message, ms: Date.now() - inicio}));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await sql.end({timeout: 1});
}
