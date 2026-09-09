import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { validarIsolamentoHomologacao } from "../../scripts/isolamento-homologacao.mjs";

validarIsolamentoHomologacao(process.env);

// Cada ambiente usa seu próprio projeto; homologação nunca usa o banco do Ponto.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env.local e preencha."
  );
}

// prepare: false é recomendado ao usar o connection pooler do Supabase (pgbouncer)
const client = postgres(connectionString, {
  prepare: false,
  ssl: "require",
  connect_timeout: 10,
  idle_timeout: 20,
  max: 5,
});

export const db = drizzle(client, { schema });
