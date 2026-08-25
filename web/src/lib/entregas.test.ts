import { describe, expect, it } from "vitest";
import { agruparRoteiroEntrega } from "./entregas";

describe("agruparRoteiroEntrega", () => {
  it("agrupa produtos por cliente e preserva trocas sem valores", () => {
    const roteiro = agruparRoteiroEntrega([
      { clienteId: "c1", clienteNome: "Mercado A", numeroEndereco: "1", cep: "80000-000", produtoId: "p1", produtoDescricao: "Couve", unidade: "UN", quantidadeDistribuida: 10, quantidadeTroca: 2 },
      { clienteId: "c1", clienteNome: "Mercado A", numeroEndereco: "1", cep: "80000-000", produtoId: "p2", produtoDescricao: "Alface", unidade: "UN", quantidadeDistribuida: 5, quantidadeTroca: 0 },
    ]);

    expect(roteiro).toHaveLength(1);
    expect(roteiro[0].itens).toEqual([
      expect.objectContaining({ produtoDescricao: "Couve", quantidadeTroca: 2 }),
      expect.objectContaining({ produtoDescricao: "Alface", quantidadeDistribuida: 5 }),
    ]);
    expect(JSON.stringify(roteiro)).not.toContain("preco");
  });
});
