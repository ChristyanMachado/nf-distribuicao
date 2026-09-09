import { describe, expect, it, vi } from "vitest";
import { gravarRascunhoLocal, lerRascunhoLocal } from "./armazenamento-rascunho";

describe("rascunho local sem interromper operação", () => {
  it("lê, grava e remove somente a chave pedida", () => {
    const storage = { getItem: vi.fn(() => "rascunho"), setItem: vi.fn(), removeItem: vi.fn() };
    expect(lerRascunhoLocal("minha-chave", () => storage)).toEqual({ ok: true, valor: "rascunho" });
    expect(gravarRascunhoLocal("minha-chave", "novo", () => storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith("minha-chave", "novo");
    expect(gravarRascunhoLocal("minha-chave", null, () => storage)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledWith("minha-chave");
  });
  it("trata bloqueio até ao obter o armazenamento", () => {
    const bloqueado = () => { throw new Error("SecurityError"); };
    expect(lerRascunhoLocal("chave", bloqueado)).toEqual({ ok: false, valor: null });
    expect(gravarRascunhoLocal("chave", null, bloqueado)).toBe(false);
  });
  it("quota excedida ou falha ao limpar não propagam exceção", () => {
    const falhar = () => { throw new Error("QuotaExceededError"); };
    const obter = () => ({ getItem: falhar, setItem: falhar, removeItem: falhar });
    expect(gravarRascunhoLocal("chave", "conteúdo", obter)).toBe(false);
    expect(gravarRascunhoLocal("chave", null, obter)).toBe(false);
  });
});
