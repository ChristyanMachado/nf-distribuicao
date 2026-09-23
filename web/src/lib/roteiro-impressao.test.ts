import { describe, expect, it } from "vitest";
import { montarHtmlRoteiroImpressao } from "./roteiro-impressao";

describe("montarHtmlRoteiroImpressao", () => {
  it("mostra o total físico e informa que a troca já está incluída", () => {
    const html = montarHtmlRoteiroImpressao(17, "2026-09-22", [{
      clienteId: "cliente-1",
      clienteNome: "Mercado A",
      numeroEndereco: "10",
      cep: "80000-000",
      itens: [{
        produtoId: "produto-1",
        produtoDescricao: "Alface",
        unidade: "MC",
        quantidadeDistribuida: 159,
        quantidadeTroca: 22,
        subtotal: 137,
      }],
    }]);

    expect(html).toContain("<th>Total</th><th>Troca incluída</th>");
    expect(html).toContain("<td>159</td><td class=\"troca\">22</td>");
    expect(html).not.toContain("<th>Normal</th>");
  });
});
