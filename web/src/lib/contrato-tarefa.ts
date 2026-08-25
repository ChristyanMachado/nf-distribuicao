import {
  exigirCep,
  exigirCnpj,
  exigirNumeroFinito,
  exigirUuid,
  limitarTexto,
} from "./validacao";

type IndicadorIe = "CONTRIBUINTE" | "CONTRIBUINTE_ISENTO" | "NAO_CONTRIBUINTE";

export type DadosContratoTarefa = {
  tarefa: {
    id: string;
      status: string;
      clienteId: string;
      emitenteId: string;
      numeroDistribuicao: number | null;
      nomeEmitente: string;
  };
  cliente: {
    nome: string;
    destinatarioNome: string | null;
    cnpj: string | null;
    indicadorIe: IndicadorIe;
    inscricaoEstadual: string | null;
    cep: string | null;
    numeroEndereco: string | null;
  };
  emitente: {
    credencialReferencia: string | null;
    valorSelectNfpe: string | null;
  };
  itens: Array<{
    produtoId: string;
    descricao: string;
    codigoFiscal: string | null;
    unidade: string;
    quantidade: string;
    precoUnitario: string;
    regra: {
      cfopTexto: string;
      cfopCodigo: string;
      situacaoTributariaIcms: string;
      origemMercadoria: string;
      possuiBeneficioFiscal: boolean;
      codigoBeneficioFiscal: string | null;
      naturezaOperacao: string;
      tipoOperacao: string;
      finalidadeEmissao: string;
      indicadorPresenca: string;
      modalidadeFrete: string;
    };
  }>;
};

/**
 * Projeta uma tarefa do banco no contrato v1 já aceito pelo Worker.
 * Mantém homologação fixa e falha antes de produzir um payload incompleto.
 * A função é pura para ser testada sem banco nem navegador.
 */
export function montarContratoTarefaV1(dados: DadosContratoTarefa) {
  if (dados.tarefa.status !== "PENDENTE") {
    throw new Error("Somente tarefa pendente pode gerar contrato.");
  }
  if (dados.itens.length < 1 || dados.itens.length > 200) {
    throw new Error("A tarefa deve conter entre 1 e 200 itens.");
  }

  const credencialReferencia = limitarTexto(
    dados.emitente.credencialReferencia ?? "",
    "Referência da credencial",
    64,
  );
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(credencialReferencia)) {
    throw new Error("Emitente sem referência de credencial válida.");
  }
  const valorSelect = limitarTexto(
    dados.emitente.valorSelectNfpe ?? "",
    "Identificador NFP-e",
    128,
  );
  if (!valorSelect || /[\u0000-\u001f\u007f]/.test(valorSelect)) {
    throw new Error("Emitente sem identificador NFP-e válido.");
  }

  const cnpj = exigirCnpj(dados.cliente.cnpj ?? "");
  const cep = exigirCep(dados.cliente.cep ?? "");
  const razaoSocial = limitarTexto(
    dados.cliente.destinatarioNome || dados.cliente.nome,
    "Razão social",
    200,
  );
  const numeroEndereco = limitarTexto(
    dados.cliente.numeroEndereco ?? "",
    "Número do endereço",
    32,
  );
  if (!razaoSocial || !numeroEndereco) throw new Error("Destinatário fiscal incompleto.");
  const nomeCliente = limitarTexto(dados.cliente.nome, "Nome do cliente", 160);
  const numeroDistribuicao = exigirNumeroFinito(
    dados.tarefa.numeroDistribuicao,
    "Número da distribuição",
    { minimo: 1, maximo: 1_000_000_000 },
  );

  const inscricaoEstadual = limitarTexto(
    dados.cliente.inscricaoEstadual ?? "",
    "Inscrição estadual",
    32,
  );
  if (dados.cliente.indicadorIe === "CONTRIBUINTE" && !inscricaoEstadual) {
    throw new Error("Inscrição estadual obrigatória para contribuinte.");
  }

  const primeiraRegra = dados.itens[0].regra;
  for (const item of dados.itens) {
    exigirUuid(item.produtoId, "Produto");
    validarMesmaOperacao(primeiraRegra, item.regra);
    if (item.regra.possuiBeneficioFiscal && !item.regra.codigoBeneficioFiscal) {
      throw new Error("Código de benefício fiscal obrigatório.");
    }
  }

  validarOpcao(primeiraRegra.naturezaOperacao, "Natureza", ["Venda"]);
  validarOpcao(primeiraRegra.tipoOperacao, "Tipo de operação", ["Entrada", "Saída"]);
  validarOpcao(primeiraRegra.finalidadeEmissao, "Finalidade", [
    "NF-e normal",
    "NF-e complementar",
    "NF-e de ajuste",
    "Devolução de Mercadoria",
  ]);
  validarOpcao(primeiraRegra.indicadorPresenca, "Indicador de presença", [
    "Não se aplica",
    "Operação presencial",
    "Operação não presencial, pela Internet",
    "Operação não presencial, Teleatendimento",
    "Operação não presencial, outros",
  ]);
  validarOpcao(primeiraRegra.modalidadeFrete, "Modalidade de frete", ["3"]);

  return {
    versaoContrato: 1 as const,
    ambiente: "teste" as const,
    tarefa: {
      id: exigirUuid(dados.tarefa.id, "Tarefa"),
      clienteId: exigirUuid(dados.tarefa.clienteId, "Cliente"),
      nomeCliente,
      nomeEmitente: limitarTexto(dados.tarefa.nomeEmitente, "Nome do emitente", 160),
      numeroDistribuicao,
      emitente: {
        id: exigirUuid(dados.tarefa.emitenteId, "Emitente"),
        valorSelect,
        credencialReferencia,
      },
      destinatario: {
        cnpj,
        indicadorIe: dados.cliente.indicadorIe,
        inscricaoEstadual: inscricaoEstadual || null,
        razaoSocial,
        cep,
        numeroEndereco,
      },
      operacao: {
        natureza: primeiraRegra.naturezaOperacao,
        tipo: primeiraRegra.tipoOperacao,
        finalidade: primeiraRegra.finalidadeEmissao,
        indicadorPresenca: primeiraRegra.indicadorPresenca,
        modalidadeFrete: primeiraRegra.modalidadeFrete,
      },
      itens: dados.itens.map((item) => ({
        produtoId: item.produtoId,
        descricao: textoObrigatorio(item.descricao, "Descrição do produto", 160),
        codigoFiscal: textoObrigatorio(item.codigoFiscal, "Código fiscal", 80),
        unidade: textoObrigatorio(item.unidade, "Unidade", 16),
        quantidade: numeroDecimal(item.quantidade, "Quantidade", { minimo: Number.EPSILON }),
        precoUnitario: numeroDecimal(item.precoUnitario, "Preço unitário"),
        cfopTexto: textoObrigatorio(item.regra.cfopTexto, "CFOP", 160),
        cfopCodigo: textoObrigatorio(item.regra.cfopCodigo, "Código CFOP", 16),
        situacaoTributariaIcms: textoObrigatorio(item.regra.situacaoTributariaIcms, "ICMS", 16),
        origemMercadoria: textoObrigatorio(item.regra.origemMercadoria, "Origem", 16),
        possuiBeneficioFiscal: item.regra.possuiBeneficioFiscal,
        codigoBeneficioFiscal: item.regra.possuiBeneficioFiscal
          ? textoObrigatorio(item.regra.codigoBeneficioFiscal, "Benefício fiscal", 80)
          : null,
      })),
    },
  };
}

function textoObrigatorio(valor: string | null, campo: string, maximo: number) {
  const texto = limitarTexto(valor ?? "", campo, maximo);
  if (!texto) throw new Error(`${campo} obrigatório.`);
  return texto;
}

function numeroDecimal(
  valor: string,
  campo: string,
  limites: { minimo?: number; maximo?: number } = {},
) {
  const numero = Number(valor);
  exigirNumeroFinito(numero, campo, limites);
  return numero;
}

function validarMesmaOperacao(
  esperada: DadosContratoTarefa["itens"][number]["regra"],
  recebida: DadosContratoTarefa["itens"][number]["regra"],
) {
  const campos = [
    "naturezaOperacao",
    "tipoOperacao",
    "finalidadeEmissao",
    "indicadorPresenca",
    "modalidadeFrete",
  ] as const;
  if (campos.some((campo) => recebida[campo] !== esperada[campo])) {
    throw new Error("Itens com operações fiscais incompatíveis não podem compartilhar a tarefa.");
  }
}

function validarOpcao(valor: string, campo: string, opcoes: readonly string[]) {
  if (!opcoes.includes(valor)) throw new Error(`${campo} não é uma opção fiscal permitida.`);
}
