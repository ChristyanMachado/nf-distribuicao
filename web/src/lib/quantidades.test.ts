import { describe, expect, it } from "vitest";
import { emMilesimos, formatarQuantidade, numeroDeMilesimos } from "./quantidades";

describe("quantidades fiscais em milésimos", () => {
  it("normaliza o clássico 0,1 + 0,2 sem resíduo binário", () => {
    const total = emMilesimos(0.1) + emMilesimos(0.2);
    expect(numeroDeMilesimos(total)).toBe(0.3);
    expect(formatarQuantidade(numeroDeMilesimos(total))).toBe("0.3");
  });

  it("recusa mais de três casas decimais", () => {
    expect(() => emMilesimos(1.0001)).toThrow("no máximo três casas decimais");
  });
});
