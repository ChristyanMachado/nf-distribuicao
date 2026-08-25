import { describe, expect, it } from "vitest";
import {
  exigirCep,
  exigirCnpj,
  exigirDataIso,
  exigirInscricaoEstadual,
  exigirNumeroFinito,
  exigirUuid,
  limitarTexto,
} from "./validacao";

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

  it("normaliza e valida CNPJ, CEP e inscrição estadual", () => {
    expect(exigirCnpj("48.188.487/0001-04")).toBe("48188487000104");
    expect(exigirCep("87209-064")).toBe("87209064");
    expect(exigirInscricaoEstadual("909.68532-00")).toBe("9096853200");
  });

  it("rejeita documentos fiscais inválidos", () => {
    expect(() => exigirCnpj("00.000.000/0000-00")).toThrow(/CNPJ/);
    expect(() => exigirCnpj("48.188.487/0001-05")).toThrow(/CNPJ/);
    expect(() => exigirCep("00000-000")).toThrow(/CEP/);
    expect(() => exigirInscricaoEstadual("x")).toThrow(/Inscrição/);
  });
});
