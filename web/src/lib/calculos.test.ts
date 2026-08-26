import { describe, expect, it } from "vitest";
import {
  agruparEmTarefas,
  calcularFaturavel,
  DistribuicaoInvalidaError,
  validarDistribuicaoTotal,
} from "./calculos";

describe("calcularFaturavel", () => {
  it("subtrai a troca da quantidade distribuída (exemplo do doc. de visão)", () => {
    const resultado = calcularFaturavel({
      clienteId: "cliente-a",
      quantidadeDistribuida: 40,
      quantidadeTroca: 3,
      precoUnitario: 4.5,
    });
    expect(resultado.quantidadeFaturavel).toBe(37);
    expect(resultado.subtotal).toBeCloseTo(166.5);
  });

  it("funciona sem troca", () => {
    const resultado = calcularFaturavel({
      clienteId: "cliente-b",
      quantidadeDistribuida: 30,
      quantidadeTroca: 0,
      precoUnitario: 4.5,
    });
    expect(resultado.quantidadeFaturavel).toBe(30);
  });

  it("rejeita troca maior que a quantidade distribuída", () => {
    expect(() =>
      calcularFaturavel({
        clienteId: "cliente-a",
        quantidadeDistribuida: 5,
        quantidadeTroca: 10,
        precoUnitario: 4.5,
      })
    ).toThrow(DistribuicaoInvalidaError);
  });

  it("rejeita quantidades negativas", () => {
    expect(() =>
      calcularFaturavel({
        clienteId: "cliente-a",
        quantidadeDistribuida: -1,
        quantidadeTroca: 0,
        precoUnitario: 4.5,
      })
    ).toThrow(DistribuicaoInvalidaError);
  });

  it("arredonda o subtotal para centavos", () => {
    const resultado = calcularFaturavel({
      clienteId: "cliente-a",
      quantidadeDistribuida: 3,
      quantidadeTroca: 0,
      precoUnitario: 0.1,
    });
    // 3 * 0.1 = 0.30000000000000004 em ponto flutuante — precisa arredondar
    expect(resultado.subtotal).toBe(0.3);
  });
});

describe("validarDistribuicaoTotal", () => {
  it("aceita quando a soma distribuída é igual à disponibilidade", () => {
    const resultado = validarDistribuicaoTotal(100, [
      { clienteId: "a", quantidadeDistribuida: 40, quantidadeTroca: 0, precoUnitario: 1 },
      { clienteId: "b", quantidadeDistribuida: 30, quantidadeTroca: 0, precoUnitario: 1 },
      { clienteId: "c", quantidadeDistribuida: 30, quantidadeTroca: 0, precoUnitario: 1 },
    ]);
    expect(resultado.valido).toBe(true);
    expect(resultado.sobra).toBe(0);
  });

  it("rejeita quando a soma distribuída excede a disponibilidade", () => {
    const resultado = validarDistribuicaoTotal(100, [
      { clienteId: "a", quantidadeDistribuida: 60, quantidadeTroca: 0, precoUnitario: 1 },
      { clienteId: "b", quantidadeDistribuida: 60, quantidadeTroca: 0, precoUnitario: 1 },
    ]);
    expect(resultado.valido).toBe(false);
  });

  it("calcula a sobra corretamente quando não distribui tudo", () => {
    const resultado = validarDistribuicaoTotal(100, [
      { clienteId: "a", quantidadeDistribuida: 70, quantidadeTroca: 0, precoUnitario: 1 },
    ]);
    expect(resultado.sobra).toBe(30);
  });
});

describe("agruparEmTarefas", () => {
  it("agrupa múltiplos produtos do mesmo cliente numa única tarefa", () => {
    const tarefas = agruparEmTarefas([
      {
        produtoId: "couve-flor",
        quantidadeDisponivel: 100,
        itens: [
          { clienteId: "cliente-a", emitenteId: "emitente-a", quantidadeDistribuida: 40, quantidadeTroca: 3, precoUnitario: 4.5 },
        ],
      },
      {
        produtoId: "alface",
        quantidadeDisponivel: 50,
        itens: [
          { clienteId: "cliente-a", emitenteId: "emitente-a", quantidadeDistribuida: 20, quantidadeTroca: 0, precoUnitario: 2 },
        ],
      },
    ]);

    expect(tarefas).toHaveLength(1);
    expect(tarefas[0].itens).toHaveLength(2);
    expect(tarefas[0].valorTotal).toBeCloseTo(166.5 + 40);
  });

  it("não gera item nem tarefa quando a quantidade faturável é zero", () => {
    const tarefas = agruparEmTarefas([
      {
        produtoId: "couve-flor",
        quantidadeDisponivel: 10,
        itens: [
          { clienteId: "cliente-a", emitenteId: "emitente-a", quantidadeDistribuida: 5, quantidadeTroca: 5, precoUnitario: 4.5 },
        ],
      },
    ]);
    expect(tarefas).toHaveLength(0);
  });

  it("separa tarefas por cliente", () => {
    const tarefas = agruparEmTarefas([
      {
        produtoId: "couve-flor",
        quantidadeDisponivel: 100,
        itens: [
          { clienteId: "cliente-a", emitenteId: "emitente-a", quantidadeDistribuida: 40, quantidadeTroca: 0, precoUnitario: 4.5 },
          { clienteId: "cliente-b", emitenteId: "emitente-b", quantidadeDistribuida: 30, quantidadeTroca: 0, precoUnitario: 4.5 },
        ],
      },
    ]);
    expect(tarefas.map((t) => t.clienteId).sort()).toEqual(["cliente-a", "cliente-b"]);
  });

  it("separa tarefas do mesmo cliente quando o emitente é diferente", () => {
    const tarefas = agruparEmTarefas([
      {
        produtoId: "couve-flor",
        quantidadeDisponivel: 100,
        itens: [
          { clienteId: "cliente-a", emitenteId: "emitente-a", quantidadeDistribuida: 40, quantidadeTroca: 0, precoUnitario: 4.5 },
          { clienteId: "cliente-a", emitenteId: "emitente-b", quantidadeDistribuida: 30, quantidadeTroca: 0, precoUnitario: 4.5 },
        ],
      },
    ]);

    expect(tarefas).toHaveLength(2);
    expect(tarefas.map((t) => t.emitenteId).sort()).toEqual(["emitente-a", "emitente-b"]);
  });
});
