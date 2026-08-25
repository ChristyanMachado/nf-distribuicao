import { describe, expect, it } from "vitest";
import { autorizacaoBasicaValida } from "./proxy";

function basic(usuario: string, senha: string) {
  return `Basic ${Buffer.from(`${usuario}:${senha}`, "utf8").toString("base64")}`;
}

describe("autorizacaoBasicaValida", () => {
  it("aceita somente o par exato", () => {
    expect(autorizacaoBasicaValida(basic("operador", "segredo:com:dois-pontos"), "operador", "segredo:com:dois-pontos")).toBe(true);
    expect(autorizacaoBasicaValida(basic("outro", "segredo:com:dois-pontos"), "operador", "segredo:com:dois-pontos")).toBe(false);
    expect(autorizacaoBasicaValida(basic("operador", "errada"), "operador", "segredo:com:dois-pontos")).toBe(false);
  });

  it("rejeita cabeçalhos ausentes ou malformados", () => {
    expect(autorizacaoBasicaValida(null, "u", "s")).toBe(false);
    expect(autorizacaoBasicaValida("Bearer token", "u", "s")).toBe(false);
    expect(autorizacaoBasicaValida("Basic bmVtc2VwYXJhZG9y", "u", "s")).toBe(false);
  });
});
