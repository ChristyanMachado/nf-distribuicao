import { describe, expect, it } from "vitest";
import { lerItensLoteTrocas } from "./lote";

const mercado = "11111111-1111-4111-8111-111111111111";
const produtoA = "22222222-2222-4222-8222-222222222222";
const produtoB = "33333333-3333-4333-8333-333333333333";
const chaveA = "44444444-4444-4444-8444-444444444444";
const chaveB = "55555555-5555-4555-8555-555555555555";

function formulario(itens: Array<[string, string, string]>) {
  const data = new FormData();
  data.set("clienteId", mercado);
  for (const [produtoId, quantidade, chave] of itens) {
    data.append("produtoId", produtoId);
    data.append("quantidade", quantidade);
    data.append("chaveIdempotencia", chave);
  }
  return data;
}

describe("lote de reposições", () => {
  it("aceita vários produtos e normaliza quantidades fiscais", () => {
    expect(lerItensLoteTrocas(formulario([
      [produtoA, "1.5", chaveA], [produtoB, "0.001", chaveB],
    ]))).toEqual([
      { produtoId: produtoA, quantidade: "1.500", chaveIdempotencia: chaveA },
      { produtoId: produtoB, quantidade: "0.001", chaveIdempotencia: chaveB },
    ]);
  });

  it("recusa listas vazias, campos desalinhados e produto repetido", () => {
    expect(() => lerItensLoteTrocas(formulario([]))).toThrow();
    const semQuantidade = formulario([[produtoA, "1", chaveA]]);
    semQuantidade.delete("quantidade");
    expect(() => lerItensLoteTrocas(semQuantidade)).toThrow();
    expect(() => lerItensLoteTrocas(formulario([
      [produtoA, "1", chaveA], [produtoA, "2", chaveB],
    ]))).toThrow("Cada produto");
  });

  it("recusa chave duplicada ou reutilização estrutural no mesmo lote", () => {
    expect(() => lerItensLoteTrocas(formulario([
      [produtoA, "1", chaveA], [produtoB, "2", chaveA],
    ]))).toThrow("Identificadores repetidos");
  });

  it("recusa precisão e quantidade inválidas", () => {
    expect(() => lerItensLoteTrocas(formulario([[produtoA, "1.0001", chaveA]]))).toThrow("três casas");
    expect(() => lerItensLoteTrocas(formulario([[produtoA, "0", chaveA]]))).toThrow("intervalo");
  });
});
