import { describe, expect, it } from "vitest";
import { deMilesimos, emMilesimos, somarMilesimos } from "./quantidades";

describe("quantidades em milésimos", () => {
  it("preserva uma soma decimal que seria imprecisa em ponto flutuante", () => {
    expect(somarMilesimos([0.1, 0.2])).toBe(300);
    expect(deMilesimos(300)).toBe("0.300");
  });

  it("rejeita precisão maior que a aceita pelo saldo físico", () => {
    expect(() => emMilesimos(0.0001, "Troca")).toThrow("três casas decimais");
  });
});
