import { describe, expect, it } from "vitest";
import {
  clienteIncompleto,
  cnpjValido,
  documentoEmitenteValido,
  emitenteIncompleto,
  produtoIncompleto,
} from "./validacao-prontidao.mjs";

describe("auditoria de prontidão da integração", () => {
  it("usa os mesmos dígitos verificadores de CPF e CNPJ do formulário", () => {
    expect(documentoEmitenteValido("529.982.247-25")).toBe(true);
    expect(cnpjValido("48.188.487/0001-04")).toBe(true);
    expect(documentoEmitenteValido("529.982.247-24")).toBe(false);
    expect(cnpjValido("48.188.487/0001-03")).toBe(false);
  });

  it("aceita emitente com CPF, referência segura e sem inscrição estadual", () => {
    expect(
      emitenteIncompleto({
        cnpj: "52998224725",
        credencial_referencia: "CLIENTE_A",
        valor_select_nfpe: "opcao-1",
      }),
    ).toBe(false);
  });

  it("reprova documentos, referência e cadastro fiscal inválidos", () => {
    expect(
      emitenteIncompleto({
        cnpj: "11111111111",
        credencial_referencia: "insegura",
        valor_select_nfpe: "",
      }),
    ).toBe(true);
    expect(
      clienteIncompleto({
        destinatario_nome: "Mercado",
        cnpj: "48.188.487/0001-03",
        inscricao_estadual: "123",
        cep: "86300000",
        numero_endereco: "10",
      }),
    ).toBe(true);
  });

  it("exige regra ativa para produto ser elegível", () => {
    expect(produtoIncompleto({ codigo_fiscal: "1", regra_ativa: true })).toBe(false);
    expect(produtoIncompleto({ codigo_fiscal: "1", regra_ativa: false })).toBe(true);
  });
});
