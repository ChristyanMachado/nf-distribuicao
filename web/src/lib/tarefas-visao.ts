export type VisaoTarefas =
  | "pendentes"
  | "andamento"
  | "atencao"
  | "concluidas"
  | "canceladas";

const STATUS_CONCLUIDO = new Set(["EMITIDA", "DOCUMENTOS_ARMAZENADOS"]);

export function normalizarVisaoTarefas(valor: string | undefined): VisaoTarefas {
  if (
    valor === "andamento"
    || valor === "atencao"
    || valor === "concluidas"
    || valor === "canceladas"
  ) return valor;
  return "pendentes";
}

export function visaoDaTarefa(status: string): VisaoTarefas {
  if (status === "PENDENTE") return "pendentes";
  if (status === "PROCESSANDO" || status === "EMITINDO") return "andamento";
  if (status === "ERRO" || status === "AGUARDANDO_CONFERENCIA") return "atencao";
  if (status === "CANCELADA") return "canceladas";
  if (STATUS_CONCLUIDO.has(status)) return "concluidas";
  // Estado futuro/desconhecido deve ficar visível para revisão humana.
  return "atencao";
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
