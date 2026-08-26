import { describe, expect, it } from "vitest";
import { dataIsoParaBrasil, dataOperacionalBrasil } from "./datas";

describe("datas operacionais", () => {
  it("não avança o dia brasileiro quando UTC já virou", () => {
    expect(dataOperacionalBrasil(new Date("2026-08-27T01:30:00Z"))).toBe("2026-08-26");
  });
  it("formata ISO sem conversão de fuso", () => expect(dataIsoParaBrasil("2026-08-26")).toBe("26/08/2026"));
});
