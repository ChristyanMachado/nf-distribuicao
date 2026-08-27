import { describe, expect, it } from "vitest";
import { montarContratoTarefaV1, type DadosContratoTarefa } from "./contrato-tarefa";

function dadosValidos(): DadosContratoTarefa {
  return {
    tarefa: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "PENDENTE",
      clienteId: "22222222-2222-4222-8222-222222222222",
      emitenteId: "33333333-3333-4333-8333-333333333333",
      numeroDistribuicao: 42,
      nomeEmitente: "Graalys",
    },
    cliente: {
      nome: "Mercado",
      destinatarioNome: "Mercado de Teste Ltda.",
      cnpj: "48.188.487/0001-04",
      indicadorIe: "CONTRIBUINTE",
      inscricaoEstadual: "1234567890",
      cep: "80000-000",
      numeroEndereco: "1",
    },
    emitente: { credencialReferencia: "EMITENTE_TESTE", valorSelectNfpe: "opcao-1" },
    itens: [
      {
        produtoId: "44444444-4444-4444-8444-444444444444",
        descricao: "Produto",
        codigoFiscal: "PROD-1",
        unidade: "UN",
        quantidade: "2.500",
        precoUnitario: "10.25",
        regra: {
          cfopTexto: "Venda de produção do estabelecimento",
          cfopCodigo: "5101",
          situacaoTributariaIcms: "40",
          origemMercadoria: "0",
          possuiBeneficioFiscal: true,
          codigoBeneficioFiscal: "PR810128",
          naturezaOperacao: "Venda",
          tipoOperacao: "Saída",
          finalidadeEmissao: "NF-e normal",
          indicadorPresenca: "Operação não presencial, pela Internet",
          modalidadeFrete: "3",
        },
      },
    ],
  };
}

describe("montarContratoTarefaV1", () => {
  it("produz contrato de homologação sem segredo", () => {
    const contrato = montarContratoTarefaV1(dadosValidos());

    expect(contrato.ambiente).toBe("teste");
    expect(contrato.tarefa.destinatario.cnpj).toBe("48188487000104");
    expect(contrato.tarefa.itens[0].quantidade).toBe(2.5);
    expect(contrato.tarefa.nomeCliente).toBe("Mercado");
    expect(contrato.tarefa.numeroDistribuicao).toBe(42);
    expect(contrato.tarefa.nomeEmitente).toBe("Graalys");
    expect(JSON.stringify(contrato)).not.toMatch(/senha|password|loginUsuario/);
  });

  it("bloqueia tarefa sem credencial ou identificador fiscal", () => {
    const dados = dadosValidos();
    dados.emitente.credencialReferencia = null;
    expect(() => montarContratoTarefaV1(dados)).toThrow(/credencial/i);

    dados.emitente.credencialReferencia = "EMITENTE_TESTE";
    dados.emitente.valorSelectNfpe = null;
    expect(() => montarContratoTarefaV1(dados)).toThrow(/NFP-e/i);
  });

  it("rejeita números não finitos e regras incompatíveis", () => {
    const dados = dadosValidos();
    dados.itens[0].quantidade = "NaN";
    expect(() => montarContratoTarefaV1(dados)).toThrow(/Quantidade/);

    const outraRegra = structuredClone(dadosValidos().itens[0]);
    outraRegra.produtoId = "55555555-5555-4555-8555-555555555555";
    outraRegra.regra.modalidadeFrete = "9";
    const misto = dadosValidos();
    misto.itens.push(outraRegra);
    expect(() => montarContratoTarefaV1(misto)).toThrow(/incompatíveis/);
  });
});
