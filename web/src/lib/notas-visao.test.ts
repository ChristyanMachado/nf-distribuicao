import { describe, expect, it } from "vitest";
import { agruparNotasPorDistribuicao } from "./notas-visao";

describe("agruparNotasPorDistribuicao", () => {
  it("agrupa notas do mesmo lote e preserva a ordem recebida", () => {
    const notas = [
      { id: "1", loteId: "a", numeroDistribuicao: 12, dataDistribuicao: "2026-09-05", dataEmissao: null },
      { id: "2", loteId: "a", numeroDistribuicao: 12, dataDistribuicao: "2026-09-05", dataEmissao: null },
      { id: "3", loteId: "b", numeroDistribuicao: 11, dataDistribuicao: "2026-09-04", dataEmissao: null },
    ];

    const grupos = agruparNotasPorDistribuicao(notas);

    expect(grupos).toHaveLength(2);
    expect(grupos[0].notas.map((nota) => nota.id)).toEqual(["1", "2"]);
    expect(grupos[1].notas.map((nota) => nota.id)).toEqual(["3"]);
  });

  it("não inventa lote para notas legadas", () => {
    const data = new Date("2026-09-01T12:00:00Z");
    const grupos = agruparNotasPorDistribuicao([
      { id: "1", loteId: null, numeroDistribuicao: null, dataDistribuicao: null, dataEmissao: data },
      { id: "2", loteId: null, numeroDistribuicao: null, dataDistribuicao: null, dataEmissao: data },
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.every((grupo) => grupo.notas.length === 1)).toBe(true);
    expect(grupos[0].data).toBe("2026-09-01");
  });
});
