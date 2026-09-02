import { describe, expect, it } from "vitest";
import {
  documentosDaNotaDisponiveis,
  recuperacaoEmAndamento,
} from "./documentos-nota";

describe("documentos da nota", () => {
  const agora = new Date("2026-09-02T12:00:00Z");

  it("só considera o conjunto completo e ainda não vencido", () => {
    expect(documentosDaNotaDisponiveis("a.pdf", "a.xml", "2026-09-03T12:00:00Z", agora)).toBe(true);
    expect(documentosDaNotaDisponiveis(null, "a.xml", "2026-09-03T12:00:00Z", agora)).toBe(false);
    expect(documentosDaNotaDisponiveis("a.pdf", "a.xml", "2026-09-01T12:00:00Z", agora)).toBe(false);
  });

  it("mantém pendente e processando sem pedidos duplicados", () => {
    expect(recuperacaoEmAndamento("PENDENTE")).toBe(true);
    expect(recuperacaoEmAndamento("PROCESSANDO")).toBe(true);
    expect(recuperacaoEmAndamento("ERRO")).toBe(false);
    expect(recuperacaoEmAndamento("CONCLUIDA")).toBe(false);
  });
});
