/**
 * Regras de cálculo da distribuição (RF07-RF11).
 * Deliberadamente sem dependência de banco/rede — pode ser testado isoladamente
 * hoje mesmo, sem precisar de acesso ao sistema fiscal.
 */

export type ItemDistribuicao = {
  clienteId: string;
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
  if (item.quantidadeDistribuida < 0 || item.quantidadeTroca < 0) {
    throw new DistribuicaoInvalidaError(
      "Quantidades não podem ser negativas."
    );
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
  const porCliente = new Map<string, TarefaPreparada>();

  for (const { produtoId, itens } of distribuicoesPorProduto) {
    for (const item of itens) {
      const faturavel = calcularFaturavel(item);
      if (faturavel.quantidadeFaturavel <= 0) continue; // nada a faturar

      const existente = porCliente.get(item.clienteId) ?? {
        clienteId: item.clienteId,
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

      porCliente.set(item.clienteId, existente);
    }
  }

  return Array.from(porCliente.values());
}

function arredondarMoeda(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function arredondarQuantidade(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}
