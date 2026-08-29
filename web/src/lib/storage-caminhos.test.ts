import { describe, expect, it } from "vitest";
import { caminhoStorageInternoValido } from "./storage-caminhos";

describe("caminhos internos do Storage", () => {
  const tarefa = "11111111-1111-4111-8111-111111111111";

  it("aceita somente o padrão imutável do Worker", () => {
    expect(caminhoStorageInternoValido(
      `notas/${tarefa}/danfe-${"a".repeat(64)}.pdf`,
    )).toBe(true);
    expect(caminhoStorageInternoValido(
      `notas/${tarefa}/xml-${"b".repeat(64)}.xml`,
    )).toBe(true);
  });

  it.each([
    "https://outro.example/nota.pdf",
    "../nota.pdf",
    `notas/${tarefa}/danfe-curto.pdf`,
    `notas/${tarefa}/xml-${"a".repeat(64)}.pdf`,
  ])("rejeita caminho adulterado: %s", (caminho) => {
    expect(caminhoStorageInternoValido(caminho)).toBe(false);
  });
});
