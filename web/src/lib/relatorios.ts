/**
 * Agregações do relatório. Puras e testáveis sem banco — a mesma filosofia
 * de lib/calculos.ts: a regra de negócio não depende de rede nem de UI.
 */

export type ItemRelatorio = {
  tarefaId: string;
  data: string; // YYYY-MM-DD
  status: string;
  clienteId: string;
  clienteNome: string;
  produtoId: string;
  produtoDescricao: string;
  quantidade: number;
  subtotal: number;
};

export type TrocaRelatorio = {
  data: string;
  status: string;
  clienteId: string;
  clienteNome: string;
  produtoId: string;
  produtoDescricao: string;
  quantidadeTroca: number;
  precoUnitario: number;
};

export type Kpis = {
  faturamentoTotal: number;
  numeroNotas: number;
  ticketMedio: number;
  perdidoEmTrocas: number;
};

export type RankingItem = {
  id: string;
  nome: string;
  valor: number;
  quantidade: number;
};

export type PontoSerie = {
  data: string;
  valor: number;
};

const STATUS_EXCLUIDO_DO_FATURAMENTO = "CANCELADA";

function arredondarMoeda(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function itensValidos(itens: ItemRelatorio[]): ItemRelatorio[] {
  return itens.filter((i) => i.status !== STATUS_EXCLUIDO_DO_FATURAMENTO);
}

function trocasValidas(trocas: TrocaRelatorio[]): TrocaRelatorio[] {
  return trocas.filter((troca) => troca.status !== STATUS_EXCLUIDO_DO_FATURAMENTO);
}

/**
 * KPIs do período. Tarefas CANCELADA não entram no faturamento — as
 * demais (mesmo PENDENTE) entram, porque o valor já está comprometido
 * assim que a distribuição foi processada, mesmo antes da nota ser emitida.
 */
export function calcularKpis(itens: ItemRelatorio[], trocas: TrocaRelatorio[]): Kpis {
  const validos = itensValidos(itens);
  const faturamentoTotal = arredondarMoeda(validos.reduce((s, i) => s + i.subtotal, 0));
  const numeroNotas = new Set(validos.map((i) => i.tarefaId)).size;
  const ticketMedio = numeroNotas > 0 ? arredondarMoeda(faturamentoTotal / numeroNotas) : 0;
  const perdidoEmTrocas = arredondarMoeda(
    trocasValidas(trocas).reduce((s, t) => s + t.quantidadeTroca * t.precoUnitario, 0)
  );

  return { faturamentoTotal, numeroNotas, ticketMedio, perdidoEmTrocas };
}

/**
 * Ranking por cliente, ordenado do maior faturamento pro menor.
 */
export function rankearPorCliente(itens: ItemRelatorio[]): RankingItem[] {
  const mapa = new Map<string, RankingItem>();
  for (const item of itensValidos(itens)) {
    const atual = mapa.get(item.clienteId) ?? {
      id: item.clienteId,
      nome: item.clienteNome,
      valor: 0,
      quantidade: 0,
    };
    atual.valor = arredondarMoeda(atual.valor + item.subtotal);
    atual.quantidade += item.quantidade;
    mapa.set(item.clienteId, atual);
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
}

/**
 * Ranking por produto, ordenado do maior faturamento pro menor.
 */
export function rankearPorProduto(itens: ItemRelatorio[]): RankingItem[] {
  const mapa = new Map<string, RankingItem>();
  for (const item of itensValidos(itens)) {
    const atual = mapa.get(item.produtoId) ?? {
      id: item.produtoId,
      nome: item.produtoDescricao,
      valor: 0,
      quantidade: 0,
    };
    atual.valor = arredondarMoeda(atual.valor + item.subtotal);
    atual.quantidade += item.quantidade;
    mapa.set(item.produtoId, atual);
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
}

/**
 * Série diária de faturamento, ordenada cronologicamente — base do gráfico.
 */
export function serieDiaria(itens: ItemRelatorio[]): PontoSerie[] {
  const mapa = new Map<string, number>();
  for (const item of itensValidos(itens)) {
    mapa.set(item.data, arredondarMoeda((mapa.get(item.data) ?? 0) + item.subtotal));
  }
  return Array.from(mapa.entries())
    .map(([data, valor]) => ({ data, valor }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

export type PresetPeriodo = "hoje" | "7dias" | "30dias" | "mes_atual";

/**
 * Converte um preset em intervalo de datas (YYYY-MM-DD, inclusive nos dois
 * extremos). Recebe "hoje" como parâmetro pra ser testável sem depender do
 * relógio do sistema.
 */
export function intervaloDoPreset(preset: PresetPeriodo, hoje: Date): { inicio: string; fim: string } {
  const fim = formatarData(hoje);

  switch (preset) {
    case "hoje":
      return { inicio: fim, fim };
    case "7dias": {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 6);
      return { inicio: formatarData(inicio), fim };
    }
    case "30dias": {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 29);
      return { inicio: formatarData(inicio), fim };
    }
    case "mes_atual": {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { inicio: formatarData(inicio), fim };
    }
  }
}

function formatarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
