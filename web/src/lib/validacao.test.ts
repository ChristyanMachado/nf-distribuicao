import { describe, expect, it } from "vitest";
import { exigirDataIso, exigirNumeroFinito, exigirUuid, limitarTexto } from "./validacao";

describe("validação de fronteira", () => {
  it("rejeita UUID arbitrário", () => {
    expect(() => exigirUuid("' OR 1=1 --", "ID")).toThrow("inválido");
  });

  it.each([Number.NaN, Infinity, -1, 1_000_000_001])("rejeita número abusivo %s", (valor) => {
    expect(() => exigirNumeroFinito(valor, "Quantidade")).toThrow();
  });

  it("rejeita datas impossíveis", () => {
    expect(() => exigirDataIso("2026-02-31")).toThrow("inválida");
  });

  it("limita texto recebido do formulário", () => {
    expect(() => limitarTexto("x".repeat(161), "Nome", 160)).toThrow("longo");
  });
});
