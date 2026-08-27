import { describe, expect, it } from "vitest";
import { ErroFormulario, falhaFormulario } from "./formularios";

describe("falhaFormulario", () => {
  it("preserva somente mensagens preparadas para o usuário", () => {
    expect(
      falhaFormulario(new ErroFormulario("CNPJ inválido."), "Falha genérica."),
    ).toEqual({ erro: "CNPJ inválido." });
  });

  it("não expõe detalhes internos inesperados", () => {
    expect(
      falhaFormulario(
        new Error("connection string postgres://usuario:segredo@banco"),
        "Não foi possível salvar.",
      ),
    ).toEqual({ erro: "Não foi possível salvar." });
  });
});
