import { describe, expect, it } from "vitest";
import {
  chaveRascunhoDistribuicao,
  filtrarProdutosParaBusca,
  ordenarClientesSelecionados,
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

describe("ordem de mercados selecionados", () => {
  const mercados = [
    { id: "mercado-a", nome: "Alfa" },
    { id: "mercado-b", nome: "Beta" },
    { id: "mercado-c", nome: "Gama" },
  ];

  it("segue a ordem de seleção, não a ordem alfabética do catálogo", () => {
    const destinos = [
      { clienteId: "mercado-c", emitenteId: emitente },
      { clienteId: "mercado-a", emitenteId: emitente },
      { clienteId: "mercado-b", emitenteId: emitente },
    ];

    expect(ordenarClientesSelecionados(destinos, mercados).map((item) => item.id))
      .toEqual(["mercado-c", "mercado-a", "mercado-b"]);
  });

  it("mantém apenas a primeira posição de um mercado com vários emitentes", () => {
    const destinos = [
      { clienteId: "mercado-b", emitenteId: "emitente-1" },
      { clienteId: "mercado-a", emitenteId: "emitente-1" },
      { clienteId: "mercado-b", emitenteId: "emitente-2" },
    ];

    expect(ordenarClientesSelecionados(destinos, mercados).map((item) => item.id))
      .toEqual(["mercado-b", "mercado-a"]);
  });

  it("ignora mercados que não pertencem mais ao catálogo atual", () => {
    const destinos = [
      { clienteId: "mercado-removido", emitenteId: emitente },
      { clienteId: "mercado-a", emitenteId: emitente },
    ];

    expect(ordenarClientesSelecionados(destinos, mercados).map((item) => item.id))
      .toEqual(["mercado-a"]);
  });

  it("mantém a ordem depois de salvar e restaurar o rascunho local", () => {
    const mercadoA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const mercadoC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const emitenteA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const emitenteC = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const restaurado = restaurarRascunhoDistribuicao(JSON.stringify({
      versao: 1,
      data: "2026-09-17",
      chaveIdempotencia: chave,
      destinos: [
        { clienteId: mercadoC, emitenteId: emitenteC },
        { clienteId: mercadoA, emitenteId: emitenteA },
      ],
      produtos: [],
    }), {
      produtoIds: [],
      destinosPermitidos: [
        { clienteId: mercadoA, emitenteId: emitenteA },
        { clienteId: mercadoC, emitenteId: emitenteC },
      ],
    });

    expect(restaurado).not.toBeNull();
    expect(ordenarClientesSelecionados(restaurado!.destinos, [
      { id: mercadoA, nome: "Alfa" },
      { id: mercadoC, nome: "Gama" },
    ]).map((item) => item.id)).toEqual([mercadoC, mercadoA]);
  });
});
