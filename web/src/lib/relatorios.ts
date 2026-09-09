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
  // A tarefa registra o resultado da emissão; a nota pode ser cancelada
  // posteriormente sem desfazer esse histórico. Esse campo preserva as duas
  // perspectivas no relatório.
  notaStatus?: string | null;
  quantidadeItens?: number;
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
  notasProcessadas: number;
  emitidas: number;
  notasCanceladas: number;
  pendentes: number;
  emAndamento: number;
  erros: number;
  distribuicoesMedidas: number;
  distribuicoesComparaveis: number;
  tempoEconomizadoSegundos: number;
  tempoMedioLoteSegundos: number | null;
  tempoMedioPorNotaSegundos: number | null;
  tempoMedioPorItemSegundos: number | null;
  desempenhoPorEscala: { notasPorLote: number; lotes: number; segundosTotais: number;
    mediaLoteSegundos: number; mediaNotaSegundos: number }[];
};

// Benchmark humano de 25/08/2026: uma distribuição com EXATAMENTE 3 notas
// levou 337 s. Não é uma estimativa por nota e não deve ser extrapolado para
// lotes de tamanho diferente. O tempo automático vem dos timestamps reais.
export const BENCHMARK_MANUAL_SEGUNDOS_POR_LOTE = 337;
export const BENCHMARK_MANUAL_QUANTIDADE_NOTAS = 3;

const STATUS_SUCESSO = new Set(["EMITIDA", "DOCUMENTOS_ARMAZENADOS"]);

function chaveDoLote(tarefa: TarefaOperacional): string {
  // Tarefas legadas sem lote continuam visíveis, mas cada uma representa uma
  // distribuição isolada; tarefas novas sempre possuem loteId.
  return tarefa.loteId ?? `tarefa:${tarefa.id}`;
}

export function calcularKpisOperacionais(tarefas: TarefaOperacional[]): KpisOperacionais {
  const validas = tarefas.filter((t) => t.status !== "CANCELADA");
  const notasProcessadas = validas.filter((t) => STATUS_SUCESSO.has(t.status));
  const notasCanceladas = notasProcessadas.filter((t) => t.notaStatus === "CANCELADA");
  // "Emitida" aqui significa fiscalmente ativa. A tarefa de uma nota
  // cancelada continua concluída, mas não deve parecer uma nota vigente.
  const emitidas = notasProcessadas.filter((t) => t.notaStatus !== "CANCELADA");
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
  // `iniciado_em` preserva deliberadamente a primeira tentativa para auditoria.
  // Por isso, lotes reprocessados não medem o tempo da execução vencedora e
  // ficam fora dos KPIs de velocidade até termos telemetria por tentativa.
  const lotesMensuraveis = lotesConcluidos.filter(
    (lote) => lote.every((tarefa) => tarefa.tentativas === 1)
  );
  const medicoesDosLotes = lotesMensuraveis
    .map((lote) => {
      if (lote.some((t) => !t.iniciadoEm || !t.concluidoEm
        || !Number.isFinite(t.iniciadoEm.getTime()) || !Number.isFinite(t.concluidoEm.getTime())
        || t.concluidoEm.getTime() < t.iniciadoEm.getTime())) return null;
      const inicios = lote.map((t) => t.iniciadoEm?.getTime()).filter((v): v is number => v !== undefined);
      const conclusoes = lote.map((t) => t.concluidoEm?.getTime()).filter((v): v is number => v !== undefined);
      if (inicios.length !== lote.length || conclusoes.length !== lote.length) return null;
      const segundos = (Math.max(...conclusoes) - Math.min(...inicios)) / 1000;
      return segundos >= 0 && segundos <= 24 * 60 * 60
        ? {
            segundos,
            notas: lote.length,
            itens: lote.every((t) => Number.isInteger(t.quantidadeItens) && (t.quantidadeItens ?? 0) > 0)
              ? lote.reduce((total, tarefa) => total + tarefa.quantidadeItens!, 0) : 0,
          }
        : null;
    })
    .filter((medicao): medicao is { segundos: number; notas: number; itens: number } => medicao !== null);
  const medicoesComparaveis = medicoesDosLotes.filter(
    (medicao) => medicao.notas === BENCHMARK_MANUAL_QUANTIDADE_NOTAS,
  );
  const tempoEconomizadoSegundos = medicoesComparaveis.reduce(
    (total, medicao) => total + BENCHMARK_MANUAL_SEGUNDOS_POR_LOTE - medicao.segundos,
    0
  );
  const medicoesComItens = medicoesDosLotes.filter((m) => m.itens > 0);
  const porEscala = new Map<number, { lotes: number; segundos: number }>();
  for (const medicao of medicoesDosLotes) {
    const atual = porEscala.get(medicao.notas) ?? { lotes: 0, segundos: 0 };
    atual.lotes += 1;
    atual.segundos += medicao.segundos;
    porEscala.set(medicao.notas, atual);
  }

  return {
    desempenhoPorEscala: [...porEscala].sort(([a], [b]) => a - b).map(([notasPorLote, m]) => ({
      notasPorLote, lotes: m.lotes, segundosTotais: Math.round(m.segundos),
      mediaLoteSegundos: Math.round(m.segundos / m.lotes),
      mediaNotaSegundos: Math.round(m.segundos / (m.lotes * notasPorLote)),
    })),
    distribuicoes: porLote.size,
    distribuicoesConcluidas: lotesConcluidos.length,
    notasProcessadas: notasProcessadas.length,
    emitidas: emitidas.length,
    notasCanceladas: notasCanceladas.length,
    pendentes: validas.filter((t) => t.status === "PENDENTE").length,
    emAndamento: validas.filter((t) => ["PROCESSANDO", "AGUARDANDO_CONFERENCIA", "EMITINDO"].includes(t.status)).length,
    erros: validas.filter((t) => t.status === "ERRO").length,
    distribuicoesMedidas: medicoesDosLotes.length,
    distribuicoesComparaveis: medicoesComparaveis.length,
    tempoEconomizadoSegundos: Math.round(tempoEconomizadoSegundos),
    tempoMedioLoteSegundos: medicoesDosLotes.length
      ? Math.round(medicoesDosLotes.reduce((total, medicao) => total + medicao.segundos, 0) / medicoesDosLotes.length)
      : null,
    tempoMedioPorNotaSegundos: medicoesDosLotes.length
      ? Math.round(
          medicoesDosLotes.reduce((total, medicao) => total + medicao.segundos, 0)
          / medicoesDosLotes.reduce((total, medicao) => total + medicao.notas, 0),
        )
      : null,
    tempoMedioPorItemSegundos: medicoesComItens.length > 0
      ? Math.round(
          medicoesComItens.reduce((total, medicao) => total + medicao.segundos, 0)
          / medicoesComItens.reduce((total, medicao) => total + medicao.itens, 0),
        )
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
