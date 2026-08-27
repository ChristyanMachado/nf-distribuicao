import { describe, expect, it } from "vitest";
import {
  pendenciasCliente,
  pendenciasEmitente,
  resumirPendencias,
} from "./prontidao-integracao";

describe("prontidão da integração fiscal", () => {
  it("aceita emitente completo sem expor credencial", () => {
    expect(pendenciasEmitente({
      cnpj: "48.188.487/0001-04",
      inscricaoEstadual: "1234567890",
      credencialReferencia: "CLIENTE_A",
      valorSelectNfpe: "emitente-homologacao",
    })).toEqual([]);
  });

  it("aceita emitente com CPF e sem inscrição estadual", () => {
    expect(pendenciasEmitente({
      cnpj: "529.982.247-25",
      inscricaoEstadual: null,
      credencialReferencia: "EMITENTE_JOAO",
      valorSelectNfpe: "emitente-homologacao",
    })).toEqual([]);
  });

  it("lista os campos ausentes do emitente", () => {
    expect(pendenciasEmitente({
      cnpj: null,
      inscricaoEstadual: null,
      credencialReferencia: "inválida",
      valorSelectNfpe: "",
    })).toEqual([
      "CPF ou CNPJ",
      "referência da credencial",
      "identificador NFP-e",
    ]);
  });

  it("não considera CNPJ de tamanho correto com dígito inválido como pronto", () => {
    expect(pendenciasEmitente({
      cnpj: "48.188.487/0001-05",
      inscricaoEstadual: "1234567890",
      credencialReferencia: "CLIENTE_A",
      valorSelectNfpe: "emitente-homologacao",
    })).toEqual(["CPF ou CNPJ"]);
  });

  it("exige IE apenas do cliente contribuinte e ao menos um emitente", () => {
    const base = {
      cnpj: "48.188.487/0001-04",
      inscricaoEstadual: null,
      indicadorIe: "NAO_CONTRIBUINTE" as const,
      destinatarioNome: "Mercado Teste Ltda.",
      cep: "80000-000",
      numeroEndereco: "10",
    };
    expect(pendenciasCliente(base, 1)).toEqual([]);
    expect(pendenciasCliente({ ...base, indicadorIe: "CONTRIBUINTE" }, 0)).toEqual([
      "inscrição estadual",
      "emitente habilitado",
    ]);
  });

  it("resume pendências em linguagem curta", () => {
    expect(resumirPendencias([])).toBe("Pronto para gerar tarefas fiscais");
    expect(resumirPendencias(["CEP"])).toBe("Falta CEP");
    expect(resumirPendencias(["CNPJ", "CEP"])).toBe("Faltam CNPJ e CEP");
  });
});
