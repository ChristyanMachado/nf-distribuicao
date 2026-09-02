/**
 * Executor transacional das migrations pelo runtime do Drizzle.
 *
 * Existe porque o binário drizzle-kit falha em algumas instalações Windows
 * antes de abrir a conexão (`uv_os_get_passwd ... ENOMEM`). O migrator oficial
 * do drizzle-orm preserva a mesma tabela de histórico e os hashes dos arquivos.
 */
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");

const url = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(url.protocol)) {
  throw new Error("DATABASE_URL deve usar PostgreSQL.");
}

const cliente = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
  connect_timeout: 15,
});

try {
  await migrate(drizzle(cliente), {
    migrationsFolder: resolve("src", "db", "migrations"),
  });
  console.log(JSON.stringify({ migracoes: "aplicadas" }));
} finally {
  await cliente.end({ timeout: 5 });
}
