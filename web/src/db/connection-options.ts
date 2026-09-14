import type postgres from "postgres";

// Compartilhadas pelo runtime e pela integração contra Postgres real.
// Pipeline zero quebra o callback interno de BEGIN no postgres.js.
export const connectionOptions: postgres.Options<{}> & { max_pipeline: number } = {
  prepare: false,
  ssl: "require",
  connect_timeout: 10,
  idle_timeout: 5,
  max_lifetime: 60,
  max: 1,
  max_pipeline: 1,
};
