import { describe, expect, it } from "vitest";
import { validarDisponibilidadePreview, validarDistribuicaoTotal } from "./calculos";

describe("disponibilidade durante edição", () => {
  it.each([-1, NaN, Infinity])("não derruba a tela para %s", (quantidade) => {
    expect(validarDisponibilidadePreview(quantidade, [])).toMatchObject({ valido: false, erro: expect.any(String) });
    expect(() => validarDistribuicaoTotal(quantidade, [])).toThrow();
  });
  it("preserva sobra e bloqueio de excesso", () => {
    const item = { clienteId: "cliente", quantidadeDistribuida: 2, quantidadeTroca: 0, precoUnitario: 5 };
    expect(validarDisponibilidadePreview(3, [item])).toMatchObject({ valido: true, sobra: 1, erro: null });
    expect(validarDisponibilidadePreview(1, [item])).toMatchObject({ valido: false, sobra: -1, erro: null });
  });
});
