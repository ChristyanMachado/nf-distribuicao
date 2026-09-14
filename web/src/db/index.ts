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

// Vercel pode executar várias instâncias em paralelo. Cada uma mantém somente
// uma conexão para não multiplicar a pressão sobre o pooler do Supabase.
// max limita conexões, mas NÃO desliga o pipeline do Postgres.js. O Supavisor
// transacional pode perder respostas de consultas sobrepostas na mesma conexão.
// Zero impede enviar outra consulta antes do ReadyForQuery da anterior.
// O runtime 3.4.9 aceita max_pipeline, mas suas declarações ainda o omitem.
const connectionOptions: postgres.Options<{}> & { max_pipeline: number } = {
  prepare: false,
  ssl: "require",
  connect_timeout: 10,
  idle_timeout: 5,
  max_lifetime: 60,
  max: 1,
  max_pipeline: 0,
};
const client = postgres(connectionString, connectionOptions);

export const db = drizzle(client, { schema });
