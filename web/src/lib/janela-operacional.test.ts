import { describe, expect, it } from "vitest";
import { descreverJanela, validarJanelaOperacional } from "./janela-operacional";

describe("janela operacional", () => {
  it("aceita a janela diária padrão", () => {
    expect(validarJanelaOperacional("0", "7")).toEqual({ inicioHora: 0, fimHora: 7 });
    expect(descreverJanela({ inicioHora: 0, fimHora: 7 })).toBe("00:00 até 07:00");
  });

  it("aceita uma janela que atravessa a meia-noite", () => {
    expect(validarJanelaOperacional("22", "2")).toEqual({ inicioHora: 22, fimHora: 2 });
  });

  it.each([["24", "6"], ["1.5", "6"], ["6", "6"], ["", "6"]])(
    "rejeita configuração inválida %s/%s",
    (inicio, fim) => expect(() => validarJanelaOperacional(inicio, fim)).toThrow(),
  );
});
