import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  schemaFilter: ["fiscal"], // schema separado do banco do ponto eletrônico
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
