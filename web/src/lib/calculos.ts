/**
 * Regras de cálculo da distribuição (RF07-RF11).
 * Deliberadamente sem dependência de banco/rede — pode ser testado isoladamente
 * hoje mesmo, sem precisar de acesso ao sistema fiscal.
 */

export type ItemDistribuicao = {
  clienteId: string;
  // Só é obrigatório quando o item será agrupado em uma tarefa. Mantê-lo
  // opcional permite reutilizar os cálculos puros no preview da interface.
  emitenteId?: string;
  quantidadeDistribuida: number;
  quantidadeTroca: number;
  precoUnitario: number;
};

export type ItemFaturavel = ItemDistribuicao & {
  quantidadeFaturavel: number;
  subtotal: number;
};

export class DistribuicaoInvalidaError extends Error {}

/**
 * RF09 — quantidade faturável = distribuída - troca, nunca negativa.
 */
export function calcularFaturavel(item: ItemDistribuicao): ItemFaturavel {
  if (
    !Number.isFinite(item.quantidadeDistribuida) ||
    !Number.isFinite(item.quantidadeTroca) ||
    !Number.isFinite(item.precoUnitario)
  ) {
    throw new DistribuicaoInvalidaError("Quantidade e preço precisam ser números válidos.");
  }
  if (item.quantidadeDistribuida < 0 || item.quantidadeTroca < 0) {
    throw new DistribuicaoInvalidaError(
      "Quantidades não podem ser negativas."
    );
  }
  if (item.precoUnitario < 0) {
    throw new DistribuicaoInvalidaError("Preço não pode ser negativo.");
  }
  if (item.quantidadeTroca > item.quantidadeDistribuida) {
    throw new DistribuicaoInvalidaError(
      `Troca (${item.quantidadeTroca}) não pode ser maior que a quantidade distribuída (${item.quantidadeDistribuida}).`
    );
  }

  const quantidadeFaturavel = item.quantidadeDistribuida - item.quantidadeTroca;
  const subtotal = arredondarMoeda(quantidadeFaturavel * item.precoUnitario);

  return { ...item, quantidadeFaturavel, subtotal };
}

/**
 * Valida que a soma distribuída entre os clientes não ultrapassa
 * a quantidade disponível do produto naquele dia.
 */
export function validarDistribuicaoTotal(
  quantidadeDisponivel: number,
  itens: ItemDistribuicao[]
): { valido: boolean; totalDistribuido: number; sobra: number } {
  if (!Number.isFinite(quantidadeDisponivel) || quantidadeDisponivel < 0) {
    throw new DistribuicaoInvalidaError("Quantidade disponível precisa ser um número válido.");
  }
  const totalDistribuido = itens.reduce(
    (soma, item) => soma + item.quantidadeDistribuida,
    0
  );
  return {
    valido: totalDistribuido <= quantidadeDisponivel,
    totalDistribuido,
    sobra: arredondarQuantidade(quantidadeDisponivel - totalDistribuido),
  };
}

/**
 * RF11 — agrupa os itens faturáveis por cliente, no formato que vira uma
 * tarefa de emissão (um cliente pode ter vários produtos no mesmo dia).
 */
export type TarefaPreparada = {
  clienteId: string;
  emitenteId: string;
  itens: {
    produtoId: string;
    quantidade: number;
    precoUnitario: number;
    subtotal: number;
  }[];
  valorTotal: number;
};

export function agruparEmTarefas(
  distribuicoesPorProduto: {
    produtoId: string;
    quantidadeDisponivel: number;
    itens: ItemDistribuicao[];
  }[]
): TarefaPreparada[] {
  const porClienteEEmitente = new Map<string, TarefaPreparada>();

  for (const { produtoId, itens } of distribuicoesPorProduto) {
    for (const item of itens) {
      const faturavel = calcularFaturavel(item);
      if (faturavel.quantidadeFaturavel <= 0) continue; // nada a faturar
      if (!item.emitenteId) {
        throw new DistribuicaoInvalidaError(
          "Emitente é obrigatório para gerar uma tarefa de emissão."
        );
      }

      const chave = `${item.clienteId}:${item.emitenteId}`;
      const existente = porClienteEEmitente.get(chave) ?? {
        clienteId: item.clienteId,
        emitenteId: item.emitenteId,
        itens: [],
        valorTotal: 0,
      };

      existente.itens.push({
        produtoId,
        quantidade: faturavel.quantidadeFaturavel,
        precoUnitario: item.precoUnitario,
        subtotal: faturavel.subtotal,
      });
      existente.valorTotal = arredondarMoeda(
        existente.valorTotal + faturavel.subtotal
      );

      porClienteEEmitente.set(chave, existente);
    }
  }

  return Array.from(porClienteEEmitente.values());
}

function arredondarMoeda(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function arredondarQuantidade(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}
