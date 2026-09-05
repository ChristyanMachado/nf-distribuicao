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

export type TarefaOperacional = {
  id: string;
  loteId: string | null;
  status: string;
  tentativas: number;
  iniciadoEm: Date | null;
  concluidoEm: Date | null;
};

export type Kpis = {
  valorDistribuidoBruto: number;
  numeroNotas: number;
  valorMedioPorNota: number;
  valorEstimadoTrocas: number;
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

export type KpisOperacionais = {
  distribuicoes: number;
  distribuicoesConcluidas: number;
  emitidas: number;
  pendentes: number;
  emAndamento: number;
  erros: number;
  distribuicoesMedidas: number;
  tempoEconomizadoSegundos: number;
  tempoMedioLoteSegundos: number | null;
};

// Benchmark humano de 25/08/2026: uma distribuição com 3 notas levou 337 s.
// O tempo automático não é constante: vem dos timestamps reais de cada lote.
// Recalibrar o referencial manual quando houver uma amostra humana maior.
export const BENCHMARK_MANUAL_SEGUNDOS_POR_LOTE = 337;

const STATUS_SUCESSO = new Set(["EMITIDA", "DOCUMENTOS_ARMAZENADOS"]);

function chaveDoLote(tarefa: TarefaOperacional): string {
  // Tarefas legadas sem lote continuam visíveis, mas cada uma representa uma
  // distribuição isolada; tarefas novas sempre possuem loteId.
  return tarefa.loteId ?? `tarefa:${tarefa.id}`;
}

export function calcularKpisOperacionais(tarefas: TarefaOperacional[]): KpisOperacionais {
  const validas = tarefas.filter((t) => t.status !== "CANCELADA");
  const emitidas = validas.filter((t) => STATUS_SUCESSO.has(t.status));
  const porLote = new Map<string, TarefaOperacional[]>();

  for (const tarefa of validas) {
    const chave = chaveDoLote(tarefa);
    porLote.set(chave, [...(porLote.get(chave) ?? []), tarefa]);
  }

  // Um lote só entrega o ganho do benchmark quando todas as suas tarefas
  // válidas chegaram a um estado final de sucesso. Lotes parciais, pendentes ou
  // com erro não inflam o indicador.
  const lotesConcluidos = Array.from(porLote.values()).filter(
    (lote) => lote.length > 0 && lote.every((tarefa) => STATUS_SUCESSO.has(tarefa.status))
  );
  const duracoesDosLotes = lotesConcluidos
    .map((lote) => {
      const inicios = lote.map((t) => t.iniciadoEm?.getTime()).filter((v): v is number => v !== undefined);
      const conclusoes = lote.map((t) => t.concluidoEm?.getTime()).filter((v): v is number => v !== undefined);
      if (inicios.length !== lote.length || conclusoes.length !== lote.length) return null;
      return (Math.max(...conclusoes) - Math.min(...inicios)) / 1000;
    })
    .filter((segundos): segundos is number => segundos !== null && segundos >= 0 && segundos <= 24 * 60 * 60);
  const tempoEconomizadoSegundos = duracoesDosLotes.reduce(
    (total, duracaoReal) => total + Math.max(0, BENCHMARK_MANUAL_SEGUNDOS_POR_LOTE - duracaoReal),
    0
  );

  return {
    distribuicoes: porLote.size,
    distribuicoesConcluidas: lotesConcluidos.length,
    emitidas: emitidas.length,
    pendentes: validas.filter((t) => t.status === "PENDENTE").length,
    emAndamento: validas.filter((t) => ["PROCESSANDO", "AGUARDANDO_CONFERENCIA", "EMITINDO"].includes(t.status)).length,
    erros: validas.filter((t) => t.status === "ERRO").length,
    distribuicoesMedidas: duracoesDosLotes.length,
    tempoEconomizadoSegundos: Math.round(tempoEconomizadoSegundos),
    tempoMedioLoteSegundos: duracoesDosLotes.length
      ? Math.round(duracoesDosLotes.reduce((a, b) => a + b, 0) / duracoesDosLotes.length)
      : null,
  };
}

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
 * KPIs operacionais do período. Tarefas CANCELADA não entram no valor — as
 * demais (mesmo PENDENTE) entram, porque o valor já está comprometido
 * assim que a distribuição foi processada, mesmo antes da nota ser emitida.
 */
export function calcularKpis(itens: ItemRelatorio[], trocas: TrocaRelatorio[]): Kpis {
  const validos = itensValidos(itens);
  const valorDistribuidoBruto = arredondarMoeda(validos.reduce((s, i) => s + i.subtotal, 0));
  const numeroNotas = new Set(validos.map((i) => i.tarefaId)).size;
  const valorMedioPorNota = numeroNotas > 0 ? arredondarMoeda(valorDistribuidoBruto / numeroNotas) : 0;
  const valorEstimadoTrocas = arredondarMoeda(
    trocasValidas(trocas).reduce((s, t) => s + t.quantidadeTroca * t.precoUnitario, 0)
  );

  return { valorDistribuidoBruto, numeroNotas, valorMedioPorNota, valorEstimadoTrocas };
}

/**
 * Ranking por cliente, ordenado do maior valor bruto pro menor.
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
 * Ranking por produto, ordenado do maior valor bruto pro menor.
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
 * Série diária do valor bruto distribuído, ordenada cronologicamente.
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
export function intervaloDoPreset(preset: PresetPeriodo, hoje: Date | string): { inicio: string; fim: string } {
  const fim = typeof hoje === "string" ? validarDataIso(hoje) : formatarData(hoje);
  const [ano, mes, dia] = fim.split("-").map(Number);
  const dataCivil = new Date(Date.UTC(ano, mes - 1, dia));

  switch (preset) {
    case "hoje":
      return { inicio: fim, fim };
    case "7dias": {
      const inicio = new Date(dataCivil);
      inicio.setUTCDate(inicio.getUTCDate() - 6);
      return { inicio: formatarDataUtc(inicio), fim };
    }
    case "30dias": {
      const inicio = new Date(dataCivil);
      inicio.setUTCDate(inicio.getUTCDate() - 29);
      return { inicio: formatarDataUtc(inicio), fim };
    }
    case "mes_atual": {
      return { inicio: `${fim.slice(0, 7)}-01`, fim };
    }
  }
}

/**
 * Validação defensiva usada também pela Server Action. Impede datas inválidas,
 * intervalos invertidos e consultas acidentalmente grandes no banco.
 */
export function validarIntervaloRelatorio(inicio: string, fim: string): { inicio: string; fim: string } {
  const inicioValido = validarDataIso(inicio);
  const fimValido = validarDataIso(fim);
  if (inicioValido > fimValido) throw new Error("O início do período deve ser anterior ao fim.");

  const inicioMs = Date.parse(`${inicioValido}T00:00:00Z`);
  const fimMs = Date.parse(`${fimValido}T00:00:00Z`);
  const diasInclusivos = Math.floor((fimMs - inicioMs) / 86_400_000) + 1;
  if (diasInclusivos > 366) throw new Error("O período do relatório não pode ultrapassar 366 dias.");
  return { inicio: inicioValido, fim: fimValido };
}

function validarDataIso(valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error("Data inválida no filtro do relatório.");
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || formatarDataUtc(data) !== valor) {
    throw new Error("Data inválida no filtro do relatório.");
  }
  return valor;
}

function formatarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDataUtc(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
