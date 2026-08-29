import { describe, expect, it } from "vitest";
import {
  agruparPorDistribuicao,
  normalizarVisaoTarefas,
  visaoDaTarefa,
} from "./tarefas-visao";

describe("visões da lista de tarefas", () => {
  it("separa fila, andamento, atenção, concluídas e canceladas", () => {
    expect(visaoDaTarefa("EMITIDA")).toBe("concluidas");
    expect(visaoDaTarefa("DOCUMENTOS_ARMAZENADOS")).toBe("concluidas");
    expect(visaoDaTarefa("CANCELADA")).toBe("canceladas");
    expect(visaoDaTarefa("PENDENTE")).toBe("pendentes");
    expect(visaoDaTarefa("PROCESSANDO")).toBe("andamento");
    expect(visaoDaTarefa("EMITINDO")).toBe("andamento");
    expect(visaoDaTarefa("AGUARDANDO_CONFERENCIA")).toBe("atencao");
    expect(visaoDaTarefa("ERRO")).toBe("atencao");
    expect(visaoDaTarefa("STATUS_FUTURO")).toBe("atencao");
  });

  it("usa pendentes como visão padrão", () => {
    expect(normalizarVisaoTarefas(undefined)).toBe("pendentes");
    expect(normalizarVisaoTarefas("qualquer")).toBe("pendentes");
    expect(normalizarVisaoTarefas("andamento")).toBe("andamento");
    expect(normalizarVisaoTarefas("atencao")).toBe("atencao");
    expect(normalizarVisaoTarefas("concluidas")).toBe("concluidas");
  });

  it("agrupa lote real e consolida legado pela data sem inventar distribuição", () => {
    const grupos = agruparPorDistribuicao([
      { id: "1", loteId: "lote-a", numeroDistribuicao: 12, data: "2026-08-27" },
      { id: "2", loteId: "lote-a", numeroDistribuicao: 12, data: "2026-08-27" },
      { id: "3", loteId: null, numeroDistribuicao: null, data: "2026-08-20" },
      { id: "4", loteId: null, numeroDistribuicao: null, data: "2026-08-20" },
    ]);

    expect(grupos.map((grupo) => grupo.tarefas.length)).toEqual([2, 2]);
    expect(grupos[0].numeroDistribuicao).toBe(12);
    expect(grupos[1].numeroDistribuicao).toBeNull();
  });
});
