import { describe, expect, it } from "vitest";
import {
  calcularKpis,
  intervaloDoPreset,
  rankearPorCliente,
  rankearPorProduto,
  serieDiaria,
  type ItemRelatorio,
  type TrocaRelatorio,
} from "./relatorios";

const itens: ItemRelatorio[] = [
  {
    tarefaId: "t1",
    data: "2026-08-10",
    status: "EMITIDA",
    clienteId: "a",
    clienteNome: "Mercado A",
    produtoId: "p1",
    produtoDescricao: "Couve-flor",
    quantidade: 37,
    subtotal: 166.5,
  },
  {
    tarefaId: "t1",
    data: "2026-08-10",
    status: "EMITIDA",
    clienteId: "a",
    clienteNome: "Mercado A",
    produtoId: "p2",
    produtoDescricao: "Alface",
    quantidade: 20,
    subtotal: 40,
  },
  {
    tarefaId: "t2",
    data: "2026-08-11",
    status: "PENDENTE",
    clienteId: "b",
    clienteNome: "Mercado B",
    produtoId: "p1",
    produtoDescricao: "Couve-flor",
    quantidade: 30,
    subtotal: 135,
  },
  {
    tarefaId: "t3",
    data: "2026-08-11",
    status: "CANCELADA",
    clienteId: "a",
    clienteNome: "Mercado A",
    produtoId: "p1",
    produtoDescricao: "Couve-flor",
    quantidade: 10,
    subtotal: 45,
  },
];

const trocas: TrocaRelatorio[] = [
  {
    data: "2026-08-10",
    clienteId: "a",
    clienteNome: "Mercado A",
    produtoId: "p1",
    produtoDescricao: "Couve-flor",
    quantidadeTroca: 3,
    precoUnitario: 4.5,
  },
];

describe("calcularKpis", () => {
  it("soma o faturamento excluindo tarefas canceladas", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.faturamentoTotal).toBeCloseTo(166.5 + 40 + 135);
  });

  it("conta notas únicas, não itens", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.numeroNotas).toBe(2); // t1 e t2 (t3 é cancelada)
  });

  it("calcula o ticket médio", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.ticketMedio).toBeCloseTo((166.5 + 40 + 135) / 2);
  });

  it("calcula o valor perdido em trocas", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.perdidoEmTrocas).toBeCloseTo(3 * 4.5);
  });

  it("não quebra com listas vazias", () => {
    const kpis = calcularKpis([], []);
    expect(kpis).toEqual({
      faturamentoTotal: 0,
      numeroNotas: 0,
      ticketMedio: 0,
      perdidoEmTrocas: 0,
    });
  });
});

describe("rankearPorCliente", () => {
  it("soma por cliente e ordena do maior pro menor, excluindo cancelada", () => {
    const ranking = rankearPorCliente(itens);
    expect(ranking).toEqual([
      { id: "a", nome: "Mercado A", valor: 206.5, quantidade: 57 },
      { id: "b", nome: "Mercado B", valor: 135, quantidade: 30 },
    ]);
  });
});

describe("rankearPorProduto", () => {
  it("soma por produto e ordena do maior pro menor", () => {
    const ranking = rankearPorProduto(itens);
    expect(ranking[0]).toEqual({ id: "p1", nome: "Couve-flor", valor: 301.5, quantidade: 67 });
    expect(ranking[1]).toEqual({ id: "p2", nome: "Alface", valor: 40, quantidade: 20 });
  });
});

describe("serieDiaria", () => {
  it("agrupa por data em ordem cronológica", () => {
    const serie = serieDiaria(itens);
    expect(serie).toEqual([
      { data: "2026-08-10", valor: 206.5 },
      { data: "2026-08-11", valor: 135 },
    ]);
  });
});

describe("intervaloDoPreset", () => {
  const hoje = new Date(2026, 7, 17); // 17/08/2026 (mês 0-indexado)

  it("hoje retorna o mesmo dia nas duas pontas", () => {
    expect(intervaloDoPreset("hoje", hoje)).toEqual({ inicio: "2026-08-17", fim: "2026-08-17" });
  });

  it("7dias inclui hoje + 6 dias anteriores", () => {
    expect(intervaloDoPreset("7dias", hoje)).toEqual({ inicio: "2026-08-11", fim: "2026-08-17" });
  });

  it("30dias inclui hoje + 29 dias anteriores", () => {
    expect(intervaloDoPreset("30dias", hoje)).toEqual({ inicio: "2026-07-19", fim: "2026-08-17" });
  });

  it("mes_atual começa no dia 1 do mês corrente", () => {
    expect(intervaloDoPreset("mes_atual", hoje)).toEqual({ inicio: "2026-08-01", fim: "2026-08-17" });
  });
});
