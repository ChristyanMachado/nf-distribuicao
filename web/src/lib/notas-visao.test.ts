import { describe, expect, it } from "vitest";
import {
  agruparNotasPorDistribuicao,
  normalizarVisaoNotas,
  visaoDaNota,
} from "./notas-visao";

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
    expect(grupos[0].datasAutorizacao).toEqual(["2026-09-01"]);
    expect(grupos[0].dataDistribuicao).toBeNull();
  });

  it("separa autorização da nota e preparação da distribuição em dias diferentes", () => {
    const grupos = agruparNotasPorDistribuicao([{
      id: "1",
      loteId: "a",
      numeroDistribuicao: 7,
      dataDistribuicao: "2026-09-14",
      dataEmissao: new Date("2026-09-15T15:00:00Z"),
    }]);

    expect(grupos[0].dataDistribuicao).toBe("2026-09-14");
    expect(grupos[0].datasAutorizacao).toEqual(["2026-09-15"]);
  });

  it("preserva todas as datas quando notas do lote são autorizadas em dias diferentes", () => {
    const grupos = agruparNotasPorDistribuicao([
      { id: "1", loteId: "a", numeroDistribuicao: 7, dataDistribuicao: "2026-09-14", dataEmissao: new Date("2026-09-15T15:00:00Z") },
      { id: "2", loteId: "a", numeroDistribuicao: 7, dataDistribuicao: "2026-09-14", dataEmissao: new Date("2026-09-16T15:00:00Z") },
    ]);

    expect(grupos[0].datasAutorizacao).toEqual(["2026-09-15", "2026-09-16"]);
  });

  it("usa o dia operacional brasileiro, não o dia UTC", () => {
    const grupos = agruparNotasPorDistribuicao([{
      id: "1",
      loteId: "a",
      numeroDistribuicao: 7,
      dataDistribuicao: "2026-09-14",
      dataEmissao: new Date("2026-09-16T01:30:00Z"),
    }]);

    expect(grupos[0].datasAutorizacao).toEqual(["2026-09-15"]);
  });
});

describe("visão fiscal das notas", () => {
  it("separa somente o estado fiscal CANCELADA da listagem normal", () => {
    expect(visaoDaNota("AUTORIZADA")).toBe("ativas");
    expect(visaoDaNota("REJEITADA")).toBe("ativas");
    expect(visaoDaNota("CANCELADA")).toBe("canceladas");
  });

  it("normaliza parâmetros desconhecidos para a visão principal", () => {
    expect(normalizarVisaoNotas(undefined)).toBe("ativas");
    expect(normalizarVisaoNotas("qualquer")).toBe("ativas");
    expect(normalizarVisaoNotas("canceladas")).toBe("canceladas");
  });
});
