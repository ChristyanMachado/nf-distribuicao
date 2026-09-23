import { describe, expect, it } from "vitest";
import {
  BENCHMARKS_MANUAIS_POR_NOTAS,
  calcularKpis,
  calcularKpisOperacionais,
  intervaloDoPreset,
  rankearPorCliente,
  rankearPorProduto,
  rankearQuantidadeFisicaPorProduto,
  rankearTrocasPorCliente,
  serieDiaria,
  serieQuantidadeProduto,
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
    produtoUnidade: "MC",
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
    produtoUnidade: "UN",
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
    produtoUnidade: "MC",
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
    produtoUnidade: "MC",
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
    produtoUnidade: "MC",
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

describe("indicadores físicos e de trocas", () => {
  const trocasComMaisDados: TrocaRelatorio[] = [
    ...trocas,
    {
      data: "2026-08-11",
      status: "SEM_TAREFA",
      clienteId: "b",
      clienteNome: "Mercado B",
      produtoId: "p1",
      produtoDescricao: "Couve-flor",
      produtoUnidade: "MC",
      quantidadeTroca: 1.125,
      precoUnitario: 4.5,
    },
    {
      data: "2026-08-11",
      status: "CANCELADA",
      clienteId: "b",
      clienteNome: "Mercado B",
      produtoId: "p1",
      produtoDescricao: "Couve-flor",
      quantidadeTroca: 100,
      precoUnitario: 4.5,
    },
  ];

  it("ranqueia somente reposições válidas por cliente", () => {
    expect(rankearTrocasPorCliente(trocasComMaisDados)).toEqual([
      { id: "a", nome: "Mercado A", valor: 13.5, quantidade: 3 },
      { id: "b", nome: "Mercado B", valor: 5.06, quantidade: 1.125 },
    ]);
  });

  it("soma quantidade normal e troca por produto sem misturar canceladas", () => {
    const ranking = rankearQuantidadeFisicaPorProduto(itens, trocasComMaisDados);
    expect(ranking[0]).toEqual({
      id: "p1",
      nome: "Couve-flor",
      unidade: "MC",
      quantidade: 71.125,
    });
    expect(ranking[1]).toEqual({
      id: "p2",
      nome: "Alface",
      unidade: "UN",
      quantidade: 20,
    });
  });

  it("produz histórico diário da quantidade física do produto", () => {
    expect(serieQuantidadeProduto(itens, trocasComMaisDados, "p1")).toEqual([
      { data: "2026-08-10", quantidade: 40 },
      { data: "2026-08-11", quantidade: 31.125 },
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
  it("mantém somente benchmarks humanos verificados e imutáveis", () => {
    expect(BENCHMARKS_MANUAIS_POR_NOTAS[3]).toEqual({ segundosPorLote: 337 });
    expect(Object.keys(BENCHMARKS_MANUAIS_POR_NOTAS)).toEqual(["3"]);
    expect(Object.isFrozen(BENCHMARKS_MANUAIS_POR_NOTAS)).toBe(true);
    expect(Object.isFrozen(BENCHMARKS_MANUAIS_POR_NOTAS[3])).toBe(true);
  });

  it("estima economia por nota e mantém a comparação direta separada", () => {
    const inicio = new Date("2026-09-10T10:00:00Z");
    const tresNotas = [0, 1, 2].map((indice) => ({
      id: `tres-${indice}`,
      loteId: "lote-tres",
      status: "EMITIDA",
      tentativas: 1,
      iniciadoEm: inicio,
      concluidoEm: new Date(inicio.getTime() + 100_000),
    }));
    const quatroNotas = [0, 1, 2, 3].map((indice) => ({
      id: `quatro-${indice}`,
      loteId: "lote-quatro",
      status: "EMITIDA",
      tentativas: 1,
      iniciadoEm: inicio,
      concluidoEm: new Date(inicio.getTime() + 100_000),
    }));

    const resultado = calcularKpisOperacionais([...tresNotas, ...quatroNotas]);

    expect(resultado.distribuicoesMedidas).toBe(2);
    expect(resultado.distribuicoesComparaveis).toBe(1);
    expect(resultado.notasElegiveisEconomia).toBe(7);
    expect(resultado.notasComAutomacaoObservada).toBe(7);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(0);
    expect(resultado.tempoEconomizadoSegundos).toBe(586);
  });

  it("separa espera em fila da duração efetiva da emissão", () => {
    const criado = new Date("2026-09-13T06:00:00Z");
    const inicio = new Date("2026-09-13T06:02:00Z");
    const fim = new Date("2026-09-13T06:03:00Z");
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", tentativas: 1, criadoEm: criado, iniciadoEm: inicio, concluidoEm: fim },
      { id: "2", loteId: "l1", status: "EMITIDA", tentativas: 1, criadoEm: criado, iniciadoEm: inicio, concluidoEm: fim },
    ]);
    expect(resultado.tempoMedioLoteSegundos).toBe(60);
    expect(resultado.tempoMedioEsperaFilaSegundos).toBe(120);
    expect(resultado.lotesComEsperaMedida).toBe(1);
  });

  it("preserva desempenho observado por escala e estima economia abrangente", () => {
    const inicio = new Date("2026-09-09T10:00:00Z");
    const tarefas = [[1, 60], [1, 80], [3, 180], [5, 250]].flatMap(([notas, segundos], lote) =>
      Array.from({ length: notas }, (_, i) => ({ id: `${lote}-${i}`, loteId: String(lote),
        status: "EMITIDA", tentativas: 1, iniciadoEm: inicio,
        concluidoEm: new Date(inicio.getTime() + segundos * 1000) })));
    const resultado = calcularKpisOperacionais(tarefas);
    expect(resultado.desempenhoPorEscala).toEqual([
      { notasPorLote: 1, lotes: 2, segundosTotais: 140, mediaLoteSegundos: 70, tempoAmortizadoPorNotaSegundos: 70, notasPorMinuto: 0.86 },
      { notasPorLote: 3, lotes: 1, segundosTotais: 180, mediaLoteSegundos: 180, tempoAmortizadoPorNotaSegundos: 60, notasPorMinuto: 1 },
      { notasPorLote: 5, lotes: 1, segundosTotais: 250, mediaLoteSegundos: 250, tempoAmortizadoPorNotaSegundos: 50, notasPorMinuto: 1.2 },
    ]);
    expect(resultado.notasElegiveisEconomia).toBe(10);
    expect(resultado.notasComAutomacaoObservada).toBe(10);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(0);
    expect(resultado.tempoEconomizadoSegundos).toBe(553);
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
    expect(resultado.tempoAmortizadoPorItemSegundos).toBe(30);
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
      notasElegiveisEconomia: 3,
      notasComAutomacaoObservada: 3,
      notasComAutomacaoExtrapolada: 0,
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
    expect(resultado.tempoEconomizadoSegundos).toBe(494);
    expect(resultado.notasElegiveisEconomia).toBe(6);
    expect(resultado.notasComAutomacaoObservada).toBe(6);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(0);
    expect(resultado.distribuicoesMedidas).toBe(2);
  });

  it("extrapola o custo manual por nota para lotes de outras escalas", () => {
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
    expect(resultado.tempoAmortizadoPorNotaSegundos).toBe(60);
    expect(resultado.distribuicoesComparaveis).toBe(0);
    expect(resultado.notasElegiveisEconomia).toBe(5);
    expect(resultado.notasComAutomacaoObservada).toBe(5);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(0);
    expect(resultado.tempoEconomizadoSegundos).toBe(262);
  });

  it("mede itens sem confundir quantidade de produtos com notas", () => {
    const inicio = new Date("2026-09-08T10:00:00Z");
    const fim = new Date("2026-09-08T10:02:00Z");
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", quantidadeItens: 2, tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "2", loteId: "l1", status: "EMITIDA", quantidadeItens: 1, tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "3", loteId: "l1", status: "EMITIDA", quantidadeItens: 3, tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
    ]);

    expect(resultado.tempoAmortizadoPorNotaSegundos).toBe(40);
    expect(resultado.tempoAmortizadoPorItemSegundos).toBe(20);
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
    expect(resultado.tempoEconomizadoSegundos).toBe(369);
    expect(resultado.notasElegiveisEconomia).toBe(4);
    expect(resultado.notasComAutomacaoObservada).toBe(3);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(1);
    expect(resultado.tentativasRegistradas).toBe(5);
    expect(resultado.reprocessamentos).toBe(1);
  });

  it("separa reservas, retrabalho, throughput e tempo amortizado", () => {
    const inicio = new Date("2026-09-23T10:00:00Z");
    const resultado = calcularKpisOperacionais([
      { id: "1", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 120_000) },
      { id: "2", loteId: "l1", status: "EMITIDA", tentativas: 2, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 120_000) },
      { id: "3", loteId: "l1", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 120_000) },
    ]);

    expect(resultado.tentativasRegistradas).toBe(4);
    expect(resultado.reprocessamentos).toBe(1);
    // O retry torna o lote inelegível para velocidade: não inventamos latência
    // nem throughput a partir do intervalo acumulado entre tentativas.
    expect(resultado.distribuicoesMedidas).toBe(0);
    expect(resultado.desempenhoPorEscala).toEqual([]);
    expect(resultado.notasElegiveisEconomia).toBe(3);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(3);
    expect(resultado.tempoEconomizadoSegundos).toBeNull();
  });

  it("extrapola duração de lotes reprocessados pela média ponderada observada", () => {
    const inicio = new Date("2026-09-05T10:00:00Z");
    const resultado = calcularKpisOperacionais([
      ...[0, 1, 2].map((i) => ({ id: `limpo-${i}`, loteId: "limpo", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 90_000) })),
      ...[0, 1, 2].map((i) => ({ id: `retry-${i}`, loteId: "retry", status: "EMITIDA", tentativas: 2, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 200_000) })),
    ]);

    expect(resultado.notasElegiveisEconomia).toBe(6);
    expect(resultado.notasComAutomacaoObservada).toBe(3);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(3);
    expect(resultado.baselineManualEstimadoSegundos).toBe(674);
    expect(resultado.tempoAutomaticoEstimadoSegundos).toBe(180);
    expect(resultado.tempoEconomizadoSegundos).toBe(494);
    expect(resultado.distribuicoesComparaveis).toBe(1);
  });

  it("trata lote paralelo como wall-clock observado e identifica o rate como throughput amortizado", () => {
    const inicio = new Date("2026-09-23T10:00:00Z");
    const fim = new Date(inicio.getTime() + 40_000);
    const resultado = calcularKpisOperacionais([
      { id: "a", loteId: "paralelo", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
      { id: "b", loteId: "paralelo", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: fim },
    ]);

    // A UI pode mostrar 20 s amortizados por nota como vazão, mas a duração
    // observada do lote continua 40 s; não declaramos latência individual de 20 s.
    expect(resultado.tempoMedioLoteSegundos).toBe(40);
    expect(resultado.tempoAmortizadoPorNotaSegundos).toBe(20);
    expect(resultado.tempoAutomaticoEstimadoSegundos).toBe(40);
    expect(resultado.notasComAutomacaoObservada).toBe(2);
  });

  it("preserva saldo negativo quando a duração observada excede o baseline", () => {
    const inicio = new Date("2026-09-05T10:00:00Z");
    const resultado = calcularKpisOperacionais(
      [0, 1, 2].map((i) => ({ id: `lento-${i}`, loteId: "lento", status: "EMITIDA", tentativas: 1, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 400_000) })),
    );

    expect(resultado.tempoEconomizadoSegundos).toBe(-63);
  });

  it("não inventa economia quando não existe nenhuma medição limpa", () => {
    const inicio = new Date("2026-09-05T10:00:00Z");
    const resultado = calcularKpisOperacionais([
      { id: "retry-1", loteId: "retry", status: "EMITIDA", tentativas: 2, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 60_000) },
      { id: "retry-2", loteId: "retry", status: "EMITIDA", tentativas: 2, iniciadoEm: inicio, concluidoEm: new Date(inicio.getTime() + 60_000) },
    ]);

    expect(resultado.notasElegiveisEconomia).toBe(2);
    expect(resultado.notasComAutomacaoObservada).toBe(0);
    expect(resultado.notasComAutomacaoExtrapolada).toBe(2);
    expect(resultado.baselineManualEstimadoSegundos).toBe(225);
    expect(resultado.tempoAutomaticoEstimadoSegundos).toBeNull();
    expect(resultado.tempoEconomizadoSegundos).toBeNull();
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
