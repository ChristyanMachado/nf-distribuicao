import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { COOKIE_SESSAO, criarTokenSessao } from "./lib/auth-session";
import { proxy } from "./proxy";

describe("proteção administrativa", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ADMIN_USER", "admin");
    vi.stubEnv("APP_ADMIN_PASSWORD", "senha-forte");
    vi.stubEnv("APP_SESSION_SECRET", "s".repeat(48));
  });
  it("redireciona visitante para login e preserva destino local", () => {
    const resposta = proxy(new NextRequest("https://app.local/tarefas?filtro=hoje"));
    expect(resposta.status).toBe(307);
    expect(resposta.headers.get("location")).toContain("%2Ftarefas%3Ffiltro%3Dhoje");
  });
  it("aceita cookie assinado e fecha quando falta configuração", () => {
    const token = criarTokenSessao("admin", "s".repeat(48));
    const requisicao = new NextRequest("https://app.local/tarefas", { headers: { cookie: `${COOKIE_SESSAO}=${token}` } });
    expect(proxy(requisicao).status).toBe(200);
    vi.stubEnv("APP_SESSION_SECRET", "");
    expect(proxy(new NextRequest("https://app.local/")).status).toBe(503);
  });
  it("no modo Supabase exige apenas a sessão assinada, não a senha administrativa", () => {
    vi.stubEnv("APP_AUTH_PROVIDER", "supabase");
    vi.stubEnv("APP_ADMIN_USER", "");
    vi.stubEnv("APP_ADMIN_PASSWORD", "");
    const token = criarTokenSessao("gerente@interno.test", "s".repeat(48));
    const requisicao = new NextRequest("https://app.local/", {
      headers: { cookie: `${COOKIE_SESSAO}=${token}` },
    });

    expect(proxy(requisicao).status).toBe(200);
  });
});
