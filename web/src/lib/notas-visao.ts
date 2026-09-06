export type NotaAgrupavel = {
  id: string;
  loteId: string | null;
  numeroDistribuicao: number | null;
  dataDistribuicao: string | null;
  dataEmissao: Date | null;
};

export type GrupoNotas<T extends NotaAgrupavel> = {
  chave: string;
  numeroDistribuicao: number | null;
  data: string | null;
  notas: T[];
};

export type VisaoNotas = "ativas" | "canceladas";

/**
 * O estado fiscal da nota não altera a tarefa que a originou. Esta função
 * existe apenas para separar a visualização do histórico de documentos.
 */
export function visaoDaNota(status: string): VisaoNotas {
  return status === "CANCELADA" ? "canceladas" : "ativas";
}

export function normalizarVisaoNotas(valor: string | undefined): VisaoNotas {
  return valor === "canceladas" ? "canceladas" : "ativas";
}

/**
 * Mantém uma distribuição como unidade visual. Notas legadas, sem lote,
 * permanecem isoladas porque não é seguro reconstruir seu agrupamento.
 */
export function agruparNotasPorDistribuicao<T extends NotaAgrupavel>(notas: T[]): GrupoNotas<T>[] {
  const grupos = new Map<string, GrupoNotas<T>>();

  for (const nota of notas) {
    const chave = nota.loteId ? `lote:${nota.loteId}` : `legado:${nota.id}`;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        numeroDistribuicao: nota.numeroDistribuicao,
        data: nota.dataDistribuicao ?? nota.dataEmissao?.toISOString().slice(0, 10) ?? null,
        notas: [],
      };
      grupos.set(chave, grupo);
    }
    grupo.notas.push(nota);
  }

  return [...grupos.values()];
}
