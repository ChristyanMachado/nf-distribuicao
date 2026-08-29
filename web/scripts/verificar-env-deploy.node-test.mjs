import assert from "node:assert/strict";
import test from "node:test";
import { pendenciasEnvDeploy } from "./verificar-env-deploy.mjs";

const ambienteValido = {
  DATABASE_URL: "postgresql://usuario:senha@db.example/teste",
  SUPABASE_URL: "https://projeto.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: "https://projeto.supabase.co",
  SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}`,
  SUPABASE_STORAGE_BUCKET: "documentos-fiscais",
  APP_AUTH_ENABLED: "true",
  APP_ADMIN_USER: "administrador",
  APP_ADMIN_PASSWORD: "senha-segura-de-teste",
  APP_SESSION_SECRET: "s".repeat(48),
};

test("aceita configuração completa sem retornar valores", () => {
  assert.deepEqual(pendenciasEnvDeploy(ambienteValido), []);
});

test("bloqueia segredo público, autenticação desligada e URL divergente", () => {
  const pendencias = pendenciasEnvDeploy({
    ...ambienteValido,
    SUPABASE_SECRET_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    APP_AUTH_ENABLED: "false",
    NEXT_PUBLIC_SUPABASE_URL: "https://outro.supabase.co",
  });
  assert.deepEqual(pendencias, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "APP_AUTH_ENABLED",
  ]);
});

test("modo Supabase troca a senha administrativa pela chave pública", () => {
  const ambienteSupabase = {
    ...ambienteValido,
    APP_AUTH_PROVIDER: "supabase",
    APP_ADMIN_USER: "",
    APP_ADMIN_PASSWORD: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"p".repeat(24)}`,
  };
  assert.deepEqual(pendenciasEnvDeploy(ambienteSupabase), []);

  ambienteSupabase.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
  assert.deepEqual(pendenciasEnvDeploy(ambienteSupabase), [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ]);
});
