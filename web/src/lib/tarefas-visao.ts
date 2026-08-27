export type VisaoTarefas = "pendentes" | "concluidas" | "canceladas";

const STATUS_CONCLUIDO = new Set(["EMITIDA", "DOCUMENTOS_ARMAZENADOS"]);

export function normalizarVisaoTarefas(valor: string | undefined): VisaoTarefas {
  if (valor === "concluidas" || valor === "canceladas") return valor;
  return "pendentes";
}

export function visaoDaTarefa(status: string): VisaoTarefas {
  if (status === "CANCELADA") return "canceladas";
  if (STATUS_CONCLUIDO.has(status)) return "concluidas";
  // PROCESSANDO, EMITINDO, ERRO e AGUARDANDO_CONFERENCIA continuam exigindo
  // acompanhamento e, portanto, ficam junto das pendentes.
  return "pendentes";
}

export function agruparPorDistribuicao<
  T extends {
    id: string;
    loteId: string | null;
    numeroDistribuicao: number | null;
    data: string;
  },
>(tarefas: T[]) {
  const grupos = new Map<
    string,
    {
      chave: string;
      loteId: string | null;
      numeroDistribuicao: number | null;
      data: string;
      tarefas: T[];
    }
  >();

  for (const tarefa of tarefas) {
    // Registros criados antes de lote_id não permitem reconstruir com certeza
    // qual foi a distribuição. Agrupá-los apenas pela data evita vários blocos
    // iguais sem inventar um número ou vínculo que o banco nunca registrou.
    const chave = tarefa.loteId ?? `legado-${tarefa.data}`;
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.tarefas.push(tarefa);
      continue;
    }
    grupos.set(chave, {
      chave,
      loteId: tarefa.loteId,
      numeroDistribuicao: tarefa.numeroDistribuicao,
      data: tarefa.data,
      tarefas: [tarefa],
    });
  }

  return [...grupos.values()];
}
