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
  let quantidadeDistribuidaMilesimos: number;
  let quantidadeTrocaMilesimos: number;
  try {
    quantidadeDistribuidaMilesimos = emMilesimos(item.quantidadeDistribuida, "Quantidade distribuída");
    quantidadeTrocaMilesimos = emMilesimos(item.quantidadeTroca, "Quantidade de troca");
  } catch (erro) {
    throw new DistribuicaoInvalidaError(
      erro instanceof Error ? erro.message : "Quantidades não podem ser negativas.",
    );
  }
  if (item.precoUnitario < 0) {
    throw new DistribuicaoInvalidaError("Preço não pode ser negativo.");
  }
  if (quantidadeTrocaMilesimos > quantidadeDistribuidaMilesimos) {
    throw new DistribuicaoInvalidaError(
      `Troca (${item.quantidadeTroca}) não pode ser maior que a quantidade distribuída (${item.quantidadeDistribuida}).`
    );
  }

  const quantidadeFaturavel = numeroDeMilesimos(
    quantidadeDistribuidaMilesimos - quantidadeTrocaMilesimos,
  );
  const subtotal = arredondarMoeda(quantidadeFaturavel * item.precoUnitario);

  return {
    ...item,
    quantidadeDistribuida: numeroDeMilesimos(quantidadeDistribuidaMilesimos),
    quantidadeTroca: numeroDeMilesimos(quantidadeTrocaMilesimos),
    quantidadeFaturavel,
    subtotal,
  };
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
  let quantidadeDisponivelMilesimos: number;
  let totalDistribuidoMilesimos: number;
  try {
    quantidadeDisponivelMilesimos = emMilesimos(quantidadeDisponivel, "Quantidade disponível");
    totalDistribuidoMilesimos = itens.reduce(
      (soma, item) => soma + emMilesimos(item.quantidadeDistribuida, "Quantidade distribuída"),
      0,
    );
  } catch (erro) {
    throw new DistribuicaoInvalidaError(
      erro instanceof Error ? erro.message : "Quantidade disponível precisa ser um número válido.",
    );
  }
  return {
    valido: totalDistribuidoMilesimos <= quantidadeDisponivelMilesimos,
    totalDistribuido: numeroDeMilesimos(totalDistribuidoMilesimos),
    sobra: numeroDeMilesimos(quantidadeDisponivelMilesimos - totalDistribuidoMilesimos),
  };
}

/** Preview editável: entrada incompleta/inválida vira mensagem, não tela de erro. */
export function validarDisponibilidadePreview(quantidade: number, itens: ItemDistribuicao[]) {
  try {
    return { ...validarDistribuicaoTotal(quantidade, itens), erro: null as string | null };
  } catch (erro) {
    return { valido: false, totalDistribuido: 0, sobra: 0,
      erro: erro instanceof Error ? erro.message : "Confira a quantidade disponível." };
  }
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

import { emMilesimos, numeroDeMilesimos } from "./quantidades";
