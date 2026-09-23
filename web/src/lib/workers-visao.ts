export type EstadoWorker = "ONLINE" | "BUSY" | "DRAINING" | "DISABLED" | "OFFLINE";

/** Contrato somente leitura de fiscal.worker_status; nunca usar a tabela privada. */
export type RegistroWorker = {
  worker_id: string;
  priority: number;
  enabled: boolean;
  capacity_limit: number;
  reported_capacity: number | null;
  heartbeat_at: string | Date | null;
  lease_expires_at: string | Date | null;
  version: string | null;
  draining: boolean;
  state: EstadoWorker;
  active_task_ids: string[];
  tasks_completed: string | number | bigint;
  last_error_code: string | null;
  preferred: boolean;
  coordination_enabled: boolean;
  server_now: string | Date;
  requested_mode: "MANUAL" | "AUTOMATICO";
  concurrency_mode: "MANUAL" | "AUTOMATICO";
  manual_capacity: number;
  automatic_max: number;
  local_capacity_limit: number;
  suggested_capacity: number;
  decision_reason: string;
  decision_at: string | Date | null;
  config_applied_at: string | Date | null;
  concurrency_updated_at: string | Date | null;
};

export type WorkerVisao = {
  id: string;
  prioridade: number;
  estado: EstadoWorker;
  ultimoContato: string | null;
  segundosSemContato: number | null;
  versao: string | null;
  capacidadePermitida: number;
  capacidadeInformada: number | null;
  operacoesAtivas: string[];
  operacoesConcluidas: string;
  ultimoErro: string | null;
  preferido: boolean;
  coordenacaoAtiva: boolean;
  modoSolicitado: "MANUAL" | "AUTOMATICO";
  modoAplicado: "MANUAL" | "AUTOMATICO";
  capacidadeManual: number;
  maximoAutomatico: number;
  limiteLocalInstalado: number;
  capacidadeSugerida: number;
  motivoDecisao: string;
  configuracaoAplicadaEm: string | null;
  concorrenciaAlteradaEm: string | null;
};

export type PainelWorkers =
  | { situacao: "nao_configurado" | "indisponivel"; workers: [] }
  | { situacao: "disponivel"; workers: WorkerVisao[] };

const ERROS_WORKER: Record<string, string> = {
  FALHA_AUTENTICACAO: "Acesso ao portal não confirmado",
  FALHA_NAVEGACAO: "Uma etapa do portal não abriu",
  FALHA_PREENCHIMENTO: "Preenchimento interrompido",
  FALHA_TECNICA: "Falha técnica antes da emissão",
  CONTRATO_INVALIDO: "Dados da distribuição incompatíveis",
  AMBIENTE_INCORRETO: "Ambiente de emissão incompatível",
  CREDENCIAL_INCOMPLETA: "Configuração do emitente incompleta",
  ACESSO_PORTAL_NEGADO: "Acesso ao módulo recusado pelo portal",
  EMITENTE_DIVERGENTE: "Emitente diferente do cadastro",
  RESULTADO_FISCAL_INCERTO: "Resultado fiscal exige conferência",
  CANCELAMENTO_NAO_ENVIADO: "Cancelamento interrompido antes do envio",
  CANCELAMENTO_RESULTADO_INCERTO: "Cancelamento exige conferência",
  RESULTADO_CANCELAMENTO_INCERTO: "Cancelamento exige conferência",
  WORKER_ABANDONED_BEFORE_EFFECT: "Executor interrompido antes do envio fiscal",
  WORKER_CYCLE_TIMEOUT: "Execução excedeu o prazo de supervisão",
  WORKER_INDISPONIVEL: "Comunicação do executor interrompida",
  WORKER_LEASE_EXPIRED: "Prazo de comunicação do executor expirado",
  WORKER_CYCLE_FAILED: "Ciclo do executor interrompido",
  WORKER_HEARTBEAT_FAILED: "Falha na confirmação de atividade",
};

export function erroWorkerSeguro(codigo: string | null): string | null {
  if (!codigo) return null;
  return Object.hasOwn(ERROS_WORKER, codigo)
    ? ERROS_WORKER[codigo]
    : "Ocorrência registrada; confira o diagnóstico com o suporte";
}

function dataValida(valor: string | Date): Date {
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) throw new Error("Data de monitoramento inválida.");
  return data;
}

export function projetarWorker(registro: RegistroWorker): WorkerVisao {
  const ultimoContato = registro.heartbeat_at ? dataValida(registro.heartbeat_at) : null;
  const agora = dataValida(registro.server_now);
  if (!["ONLINE", "BUSY", "DRAINING", "DISABLED", "OFFLINE"].includes(registro.state)) {
    throw new Error("Estado de monitoramento incompatível.");
  }
  const total = String(registro.tasks_completed);
  if (!/^\d+$/.test(total)) throw new Error("Contagem de monitoramento inválida.");

  // Projeção explícita: nem campos privados extras nem mensagens livres chegam à UI.
  return {
    id: registro.worker_id,
    prioridade: registro.priority,
    estado: registro.state,
    ultimoContato: ultimoContato?.toISOString() ?? null,
    segundosSemContato: ultimoContato
      ? Math.max(0, Math.floor((agora.getTime() - ultimoContato.getTime()) / 1000))
      : null,
    versao: registro.version && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(registro.version)
      ? registro.version : null,
    capacidadePermitida: Math.min(registro.capacity_limit, registro.local_capacity_limit),
    capacidadeInformada: registro.reported_capacity,
    operacoesAtivas: registro.active_task_ids,
    operacoesConcluidas: total,
    ultimoErro: erroWorkerSeguro(registro.last_error_code),
    preferido: registro.preferred,
    coordenacaoAtiva: registro.coordination_enabled,
    modoSolicitado: registro.requested_mode,
    modoAplicado: registro.concurrency_mode,
    capacidadeManual: registro.manual_capacity,
    maximoAutomatico: registro.automatic_max,
    limiteLocalInstalado: registro.local_capacity_limit,
    capacidadeSugerida: registro.suggested_capacity,
    motivoDecisao: motivoConcorrenciaSeguro(registro.decision_reason),
    configuracaoAplicadaEm: registro.config_applied_at
      ? dataValida(registro.config_applied_at).toISOString() : null,
    concorrenciaAlteradaEm: registro.concurrency_updated_at
      ? dataValida(registro.concurrency_updated_at).toISOString() : null,
  };
}

const MOTIVOS_CONCORRENCIA: Record<string, string> = {
  BOOTSTRAP: "iniciando com segurança",
  MANUAL: "configuração manual",
  AUTO_BASELINE: "modo automático conservador",
  NO_ELIGIBLE_TASKS: "sem tarefas para paralelizar",
  INSUFFICIENT_DISTINCT_CREDENTIALS: "aguardando emitentes diferentes",
  METRICS_UNAVAILABLE: "aguardando dados suficientes do computador",
  RESOURCE_PRESSURE: "reduzido para proteger o computador",
  CRITICAL_MEMORY: "memória baixa; usando capacidade mínima",
  MARGINAL_RESOURCES: "mantido no nível seguro",
  PREVIOUS_CYCLE_FAILED: "ciclo anterior exige cautela",
  LEASE_UNHEALTHY: "comunicação do Worker instável",
  FISCAL_RESULT_UNCERTAIN: "resultado fiscal exige conferência",
  HEALTHY_TWO_WINDOWS_PROMOTE_ONE: "margem confirmada; subindo um nível",
  HEALTHY_AT_CEILING: "limite automático atingido",
  PROMOTION_COOLDOWN: "mantido estável após ajuste recente",
  REDUCTION_COOLDOWN: "mantido estável durante janela de redução",
  SINGLE_PRESSURE_WINDOW_HOLD: "aguardando confirmar a pressão do computador",
  RESOURCE_PRESSURE_REDUCE_ONE: "pressão confirmada; reduzindo um nível",
  MARGINAL_RESOURCES_HOLD: "mantido no nível atual enquanto mede",
  INVALID_POLICY: "configuração inválida; usando mínimo",
  NOT_HEALTHY_REDUCE_ONE: "sem margem confirmada; reduzindo um nível",
};

function motivoConcorrenciaSeguro(codigo: string): string {
  return MOTIVOS_CONCORRENCIA[codigo] ?? "estado de concorrência registrado";
}

export function descreverEstadoWorker(worker: Pick<WorkerVisao, "estado" | "ultimoContato">): string {
  switch (worker.estado) {
    case "ONLINE": return "Online";
    case "BUSY": return "Em execução";
    case "DRAINING": return "Preparando parada";
    case "DISABLED": return "Desabilitado";
    case "OFFLINE": return worker.ultimoContato ? "Possivelmente desconectado" : "Sem primeiro contato";
  }
}

export function tempoSemContato(segundos: number | null): string {
  if (segundos === null) return "Nenhum contato registrado";
  if (segundos < 60) return "Há menos de 1 min";
  if (segundos < 3600) return `Há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `Há ${Math.floor(segundos / 3600)} h`;
  return `Há ${Math.floor(segundos / 86400)} dia(s)`;
}

export function intervaloAtualizacaoWorkers(temTarefaAtiva: boolean): 10_000 | 30_000 {
  return temTarefaAtiva ? 10_000 : 30_000;
}
