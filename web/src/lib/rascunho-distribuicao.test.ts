import { describe, expect, it } from "vitest";
import {
  chaveRascunhoDistribuicao,
  filtrarProdutosParaBusca,
  restaurarRascunhoDistribuicao,
} from "./rascunho-distribuicao";

const cliente = "11111111-1111-4111-8111-111111111111";
const emitente = "22222222-2222-4222-8222-222222222222";
const produto = "33333333-3333-4333-8333-333333333333";
const outroProduto = "44444444-4444-4444-8444-444444444444";
const chave = "55555555-5555-4555-8555-555555555555";

describe("rascunho de distribuição", () => {
  it("separa a chave local por escopo de sessão", () => {
    expect(chaveRascunhoDistribuicao("conta-a")).not.toBe(chaveRascunhoDistribuicao("conta-b"));
  });

  it("restaura somente produto e destino ainda disponíveis", () => {
    const salvo = JSON.stringify({
      versao: 1,
      data: "2026-09-06",
      chaveIdempotencia: chave,
      destinos: [
        { clienteId: cliente, emitenteId: emitente },
        { clienteId: "cliente-removido", emitenteId: emitente },
      ],
      produtos: [
        {
          produtoId: produto,
          quantidadeTotal: "20",
          linhas: [
            { clienteId: cliente, emitenteId: emitente, quantidadeDistribuida: "20", quantidadeTroca: "0", precoUnitario: "2.5", trocaAberta: false },
            { clienteId: "cliente-removido", emitenteId: emitente, quantidadeDistribuida: "2", quantidadeTroca: "0", precoUnitario: "2.5", trocaAberta: false },
          ],
        },
        { produtoId: "produto-removido", quantidadeTotal: "1", linhas: [] },
      ],
    });

    expect(restaurarRascunhoDistribuicao(salvo, {
      produtoIds: [produto],
      destinosPermitidos: [{ clienteId: cliente, emitenteId: emitente }],
    })).toMatchObject({
      destinos: [{ clienteId: cliente, emitenteId: emitente }],
      produtos: [{ produtoId: produto, linhas: [{ quantidadeDistribuida: "20" }] }],
    });
  });

  it("recusa conteúdo estruturalmente inválido", () => {
    expect(restaurarRascunhoDistribuicao("{invalido", {
      produtoIds: [produto],
      destinosPermitidos: [{ clienteId: cliente, emitenteId: emitente }],
    })).toBeNull();
  });

  it("preserva a marcação promocional sem invalidar rascunhos anteriores", () => {
    const base = {
      versao: 1,
      data: "2026-09-06",
      chaveIdempotencia: chave,
      destinos: [{ clienteId: cliente, emitenteId: emitente }],
      produtos: [{
        produtoId: produto,
        quantidadeTotal: "20",
        linhas: [{
          clienteId: cliente,
          emitenteId: emitente,
          quantidadeDistribuida: "20",
          quantidadeTroca: "0",
          precoUnitario: "2.5",
          trocaAberta: false,
        }],
      }],
    };
    const catalogo = {
      produtoIds: [produto],
      destinosPermitidos: [{ clienteId: cliente, emitenteId: emitente }],
    };

    expect(restaurarRascunhoDistribuicao(JSON.stringify(base), catalogo)?.produtos[0].linhas[0].precoPromocional)
      .toBe(false);
    const promocao = {
      ...base,
      produtos: [{
        ...base.produtos[0],
        linhas: [{ ...base.produtos[0].linhas[0], precoPromocional: true }],
      }],
    };
    expect(restaurarRascunhoDistribuicao(JSON.stringify(promocao), catalogo)?.produtos[0].linhas[0].precoPromocional)
      .toBe(true);
  });
});

describe("busca de produtos", () => {
  it("filtra sem diferenciar acento e devolve ordem alfabética", () => {
    expect(filtrarProdutosParaBusca([
      { id: produto, descricao: "Tomate" },
      { id: outroProduto, descricao: "Alface" },
      { id: "x", descricao: "Alfáce americana" },
    ], "alface").map((item) => item.descricao)).toEqual(["Alface", "Alfáce americana"]);
  });
});
