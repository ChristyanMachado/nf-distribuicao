import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { COOKIE_SESSAO, criarTokenSessao } from "./lib/auth-session";
import { config, proxy } from "./proxy";

describe("proxy de autenticação e Server Actions", () => {
  beforeEach(() => {
    vi.stubEnv("APP_AUTH_ENABLED", "true");
    vi.stubEnv("APP_AUTH_PROVIDER", "administrativo");
    vi.stubEnv("APP_ADMIN_USER", "qa-admin");
    vi.stubEnv("APP_ADMIN_PASSWORD", "senha-ficticia-de-teste");
    vi.stubEnv("APP_SESSION_SECRET", "s".repeat(40));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("redireciona visitante para login e preserva destino local", () => {
    const response = proxy(new NextRequest("https://graalyst.test/tarefas?filtro=hoje"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("%2Ftarefas%3Ffiltro%3Dhoje");
  });

  it("aceita sessão assinada e bloqueia se faltar configuração", () => {
    const token = criarTokenSessao("admin", "s".repeat(40));
    const request = new NextRequest("https://graalyst.test/tarefas", {
      headers: { cookie: `${COOKIE_SESSAO}=${token}` },
    });
    expect(proxy(request).status).toBe(200);
    vi.stubEnv("APP_SESSION_SECRET", "");
    expect(proxy(new NextRequest("https://graalyst.test/")).status).toBe(503);
  });

  it("no modo Supabase não exige senha administrativa local", () => {
    vi.stubEnv("APP_AUTH_PROVIDER", "supabase");
    vi.stubEnv("APP_ADMIN_USER", "");
    vi.stubEnv("APP_ADMIN_PASSWORD", "");
    const token = criarTokenSessao("gerente@interno.test", "s".repeat(40));
    const request = new NextRequest("https://graalyst.test/", {
      headers: { cookie: `${COOKIE_SESSAO}=${token}` },
    });
    expect(proxy(request).status).toBe(200);
  });

  it("deixa a Server Action chegar ao seu guarda de sessão quando expirou", () => {
    const request = new NextRequest("https://graalyst.test/distribuicao", {
      method: "POST",
      headers: { "next-action": "id-de-teste" },
    });

    const response = proxy(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("também deixa passar a submissão multipart sem JavaScript", () => {
    const request = new NextRequest("https://graalyst.test/distribuicao", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=qa" },
    });

    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  });

  it("continua redirecionando páginas e formulários sem sessão", () => {
    const pagina = proxy(new NextRequest("https://graalyst.test/distribuicao"));
    const formulario = proxy(new NextRequest("https://graalyst.test/distribuicao", { method: "POST" }));

    for (const response of [pagina, formulario]) {
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    }
  });

  it("não deixa o cabeçalho de ação contornar a proteção de uma API", () => {
    const request = new NextRequest("https://graalyst.test/api/worker/roteiros/id", {
      method: "POST",
      headers: { "next-action": "id-de-teste" },
    });

    expect(proxy(request).status).toBe(307);
    expect(proxy(new NextRequest("https://graalyst.test/api", {
      method: "POST",
      headers: { "next-action": "id-de-teste" },
    })).status).toBe(307);
  });

  it("mantém manifest e ícones públicos antes do login", () => {
    const matcher = String(config.matcher?.[0]);
    expect(matcher).toContain("manifest\\.webmanifest");
    expect(matcher).toContain("brand/");
    expect(matcher).toContain("favicon.ico");
  });
});
