import { describe, expect, it } from "vitest";
import {
  calcularKpis,
  calcularKpisOperacionais,
  intervaloDoPreset,
  rankearPorCliente,
  rankearPorProduto,
  serieDiaria,
  validarIntervaloRelatorio,
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
    status: "EMITIDA",
    clienteId: "a",
    clienteNome: "Mercado A",
    produtoId: "p1",
    produtoDescricao: "Couve-flor",
    quantidadeTroca: 3,
    precoUnitario: 4.5,
  },
];

describe("calcularKpis", () => {
  it("soma o valor bruto distribuído excluindo tarefas canceladas", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.valorDistribuidoBruto).toBeCloseTo(166.5 + 40 + 135);
  });

  it("conta notas únicas, não itens", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.numeroNotas).toBe(2); // t1 e t2 (t3 é cancelada)
  });

  it("calcula o ticket médio", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.valorMedioPorNota).toBeCloseTo((166.5 + 40 + 135) / 2);
  });

  it("calcula o valor operacional estimado das trocas sem tratá-lo como perda financeira", () => {
    const kpis = calcularKpis(itens, trocas);
    expect(kpis.valorEstimadoTrocas).toBeCloseTo(3 * 4.5);
  });

  it("não contabiliza troca de tarefa cancelada", () => {
    const kpis = calcularKpis(itens, [
      ...trocas,
      {
        ...trocas[0],
        status: "CANCELADA",
        quantidadeTroca: 10,
      },
    ]);

    expect(kpis.valorEstimadoTrocas).toBeCloseTo(3 * 4.5);
  });

  it("não quebra com listas vazias", () => {
    const kpis = calcularKpis([], []);
    expect(kpis).toEqual({
      valorDistribuidoBruto: 0,
      numeroNotas: 0,
      valorMedioPorNota: 0,
      valorEstimadoTrocas: 0,
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

  it("aceita a data civil do Brasil sem depender do fuso do servidor", () => {
    expect(intervaloDoPreset("7dias", "2026-01-02")).toEqual({ inicio: "2025-12-27", fim: "2026-01-02" });
  });
});

describe("calcularKpisOperacionais", () => {
  it("separa escalas sem extrapolar e informa somente amostras medidas", () => {
    const inicio = new Date("2026-09-09T10:00:00Z");
    const tarefas = [[1, 60], [1, 80], [3, 180], [5, 250]].flatMap(([notas, segundos], lote) =>
      Array.from({ length: notas }, (_, i) => ({ id: `${lote}-${i}`, loteId: String(lote),
        status: "EMITIDA", tentativas: 1, iniciadoEm: inicio,
        concluidoEm: new Date(inicio.getTime() + segundos * 1000) })));
    const resultado = calcularKpisOperacionais(tarefas);
    expect(resultado.desempenhoPorEscala).toEqual([
      { notasPorLote: 1, lotes: 2, segundosTotais: 140, mediaLoteSegundos: 70, mediaNotaSegundos: 70 },
      { notasPorLote: 3, lotes: 1, segundosTotais: 180, mediaLoteSegundos: 180, mediaNotaSegundos: 60 },
      { notasPorLote: 5, lotes: 1, segundosTotais: 250, mediaLoteSegundos: 250, mediaNotaSegundos: 50 },
    ]);
    expect(resultado.tempoEconomizadoSegundos).toBe(157);
    expect(calcularKpisOperacionais([]).desempenhoPorEscala).toEqual([]);
  });
  it("desconta lotes mais lentos do saldo em vez de ocultar perdas", () => {
    const inicio = new Date("2026-09-08T10:00:00Z");
    const tarefas = [300, 400].flatMap((segundos, lote) =>
      [1, 2, 3].map((nota) => ({ id: `${lote}-${nota}`, loteId: String(lote),
        status: "EMITIDA", tentativas: 1, iniciadoEm: inicio,
        concluidoEm: new Date(inicio.getTime() + segundos * 1000) })));
    expect(calcularKpisOperacionais(tarefas).tempoEconomizadoSegundos).toBe(-26);
  });

  it("usa a mesma amostra de duração e itens e rejeita cronologia inválida", () => {
    const inicio = new Date("2026-09-08T10:00:00Z");
    const base = { status: "EMITIDA", tentativas: 1, iniciadoEm: inicio,
      concluidoEm: new Date(inicio.getTime() + 60000) };
    const resultado = calcularKpisOperacionais([
      { ...base, id: "1", loteId: "1", quantidadeItens: 2 },
      { ...base, id: "2", loteId: "2" },
      { ...base, id: "3", loteId: "3", concluidoEm: new Date(inicio.getTime() - 1000) },
    ]);
    expect(resultado.tempoMedioPorItemSegundos).toBe(30);
    expect(resultado.distribuicoesMedidas).toBe(2);
  });

  it("conta a economia uma vez por lote completo, nunca uma vez por nota", () => {
    const inicio = new Date("2026-08-26T10:00:00Z");
    const fim = new Date("2026-08-26T10:00:42Z");
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "2", loteId: "l1", status: "DOCUMENTOS_ARMAZENADOS", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "3", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "4", loteId: "l2", status: "PENDENTE", tentativas: 0, iniciadoEm: null, concluidoEm: null },
      { id: "5", loteId: "l3", status: "ERRO", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "6", loteId: "l4", status: "CANCELADA", tentativas: 0, iniciadoEm: null, concluidoEm: null },
    ]);
    expect(resultado).toMatchObject({
      distribuicoes: 3,
      distribuicoesConcluidas: 1,
      emitidas: 3,
      pendentes: 1,
      erros: 1,
      distribuicoesMedidas: 1,
      tempoEconomizadoSegundos: 295,
      tempoMedioLoteSegundos: 42,
    });
  });

  it("não considera lote parcialmente emitido como concluído", () => {
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: null, concluidoEm: null },
      { id: "2", loteId: "l1", status: "ERRO", tentativas: 1, iniciadoEm: null, concluidoEm: null },
    ]);
    expect(resultado.distribuicoesConcluidas).toBe(0);
    expect(resultado.distribuicoesMedidas).toBe(0);
    expect(resultado.tempoEconomizadoSegundos).toBe(0);
  });

  it("usa a duração real de cada lote para calcular a economia", () => {
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-08-26T10:00:00Z"), concluidoEm: new Date("2026-08-26T10:01:00Z") },
      { id: "2", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-08-26T10:00:00Z"), concluidoEm: new Date("2026-08-26T10:01:00Z") },
      { id: "3", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-08-26T10:00:00Z"), concluidoEm: new Date("2026-08-26T10:01:00Z") },
      { id: "4", loteId: "l2", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-08-26T11:00:00Z"), concluidoEm: new Date("2026-08-26T11:02:00Z") },
      { id: "5", loteId: "l2", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-08-26T11:00:00Z"), concluidoEm: new Date("2026-08-26T11:02:00Z") },
      { id: "6", loteId: "l2", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-08-26T11:00:00Z"), concluidoEm: new Date("2026-08-26T11:02:00Z") },
    ]);

    expect(resultado.tempoMedioLoteSegundos).toBe(90);
    expect(resultado.tempoEconomizadoSegundos).toBe((337 - 60) + (337 - 120));
    expect(resultado.distribuicoesMedidas).toBe(2);
  });

  it("não extrapola o benchmark manual de três notas para um lote maior", () => {
    const inicio = new Date("2026-09-08T10:00:00Z");
    const fim = new Date("2026-09-08T10:05:00Z");
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "lote-5", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "2", loteId: "lote-5", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "3", loteId: "lote-5", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "4", loteId: "lote-5", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "5", loteId: "lote-5", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
    ]);

    expect(resultado.tempoMedioLoteSegundos).toBe(300);
    expect(resultado.tempoMedioPorNotaSegundos).toBe(60);
    expect(resultado.distribuicoesComparaveis).toBe(0);
    expect(resultado.tempoEconomizadoSegundos).toBe(0);
  });

  it("mede itens sem confundir quantidade de produtos com notas", () => {
    const inicio = new Date("2026-09-08T10:00:00Z");
    const fim = new Date("2026-09-08T10:02:00Z");
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", quantidadeItens: 2, tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "2", loteId: "l1", status: "EMITIDA", quantidadeItens: 1, tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "3", loteId: "l1", status: "EMITIDA", quantidadeItens: 3, tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
    ]);

    expect(resultado.tempoMedioPorNotaSegundos).toBe(40);
    expect(resultado.tempoMedioPorItemSegundos).toBe(20);
  });

  it("separa nota cancelada de falha técnica sem desfazer a tarefa concluída", () => {
    const inicio = new Date("2026-09-08T10:00:00Z");
    const fim = new Date("2026-09-08T10:01:00Z");
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", notaStatus: "CANCELADA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "2", loteId: "l2", status: "ERRO", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
    ]);

    expect(resultado.notasProcessadas).toBe(1);
    expect(resultado.emitidas).toBe(0);
    expect(resultado.notasCanceladas).toBe(1);
    expect(resultado.erros).toBe(1);
  });

  it("exclui reprocessamentos da média porque o início preserva a primeira tentativa", () => {
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "limpo", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-09-05T11:00:00Z"), concluidoEm: new Date("2026-09-05T11:01:00Z") },
      { id: "1b", loteId: "limpo", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-09-05T11:00:00Z"), concluidoEm: new Date("2026-09-05T11:01:00Z") },
      { id: "1c", loteId: "limpo", status: "EMITIDA", tentativas: 1, iniciadoEm: new Date("2026-09-05T11:00:00Z"), concluidoEm: new Date("2026-09-05T11:01:00Z") },
      { id: "2", loteId: "reprocessado", status: "EMITIDA", tentativas: 2, iniciadoEm: new Date("2026-09-05T10:00:00Z"), concluidoEm: new Date("2026-09-05T11:00:00Z") },
    ]);

    expect(resultado.distribuicoesConcluidas).toBe(2);
    expect(resultado.distribuicoesMedidas).toBe(1);
    expect(resultado.tempoMedioLoteSegundos).toBe(60);
    expect(resultado.tempoEconomizadoSegundos).toBe(277);
  });
});

describe("validarIntervaloRelatorio", () => {
  it("aceita período válido e inclusivo", () => {
    expect(validarIntervaloRelatorio("2026-08-01", "2026-08-31")).toEqual({
      inicio: "2026-08-01",
      fim: "2026-08-31",
    });
  });

  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026/02/01", "2026-03-01"],
    ["2026-03-02", "2026-03-01"],
    ["2025-01-01", "2026-12-31"],
  ])("rejeita intervalo inválido %s a %s", (inicio, fim) => {
    expect(() => validarIntervaloRelatorio(inicio, fim)).toThrow();
  });
});
