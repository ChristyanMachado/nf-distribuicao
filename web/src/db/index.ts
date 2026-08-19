import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL deve apontar para o mesmo projeto Supabase já usado
// pelo sistema de ponto eletrônico (schema separado — ver README).
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env.local e preencha."
  );
}

// prepare: false é recomendado ao usar o connection pooler do Supabase (pgbouncer)
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
