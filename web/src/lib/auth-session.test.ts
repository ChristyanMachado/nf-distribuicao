import { describe, expect, it } from "vitest";
import { criarTokenSessao, retornoSeguro, validarTokenSessao } from "./auth-session";

describe("sessão administrativa", () => {
  const agora = new Date("2026-08-26T09:00:00Z").getTime();
  it("aceita token íntegro e recusa adulteração ou expiração", () => {
    const token = criarTokenSessao("admin", "segredo-longo", agora);
    expect(validarTokenSessao(token, "segredo-longo", agora)?.papel).toBe("ADMIN");
    expect(validarTokenSessao(token + "x", "segredo-longo", agora)).toBeNull();
    expect(validarTokenSessao(token, "outro-segredo", agora)).toBeNull();
    expect(validarTokenSessao(token, "segredo-longo", agora + 31 * 60_000)).toBeNull();
  });
  it("bloqueia redirecionamento externo", () => {
    expect(retornoSeguro("/tarefas?filtro=1")).toBe("/tarefas?filtro=1");
    expect(retornoSeguro("//evil.example")).toBe("/");
    expect(retornoSeguro("https://evil.example")).toBe("/");
    expect(retornoSeguro("/\\evil.example")).toBe("/");
  });
});
