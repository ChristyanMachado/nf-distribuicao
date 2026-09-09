// Exporta somente o journal ativo, nunca varre todos os SQLs (0014 está adiada).
// Não conecta ao banco. O destino deve ser verificado antes de aplicar a saída.
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fileURLToPath } from 'node:url';

const migrations = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL('../src/db/migrations', import.meta.url)),
});
const query = [
  `CREATE SCHEMA drizzle;
   CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);`,
  ...migrations.flatMap(m => [
    ...m.sql,
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${m.hash}', ${m.folderMillis});`,
  ]),
  'REVOKE ALL ON SCHEMA fiscal FROM PUBLIC, anon, authenticated;',
  'REVOKE ALL ON ALL TABLES IN SCHEMA fiscal FROM PUBLIC, anon, authenticated;',
  'REVOKE ALL ON ALL SEQUENCES IN SCHEMA fiscal FROM PUBLIC, anon, authenticated;',
  'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fiscal FROM PUBLIC, anon, authenticated;',
].join('\n');
console.log(JSON.stringify({ migrations: migrations.length, query }));
