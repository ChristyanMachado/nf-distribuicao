export type LinhaEntrega = {
  clienteId: string;
  clienteNome: string;
  numeroEndereco: string | null;
  cep: string | null;
  produtoId: string;
  produtoDescricao: string;
  unidade: string;
  quantidadeDistribuida: number;
  quantidadeTroca: number;
};

export type ParadaEntrega = {
  clienteId: string;
  clienteNome: string;
  numeroEndereco: string | null;
  cep: string | null;
  itens: Array<{
    produtoId: string;
    produtoDescricao: string;
    unidade: string;
    quantidadeDistribuida: number;
    quantidadeTroca: number;
  }>;
};

/** Agrupa o roteiro por cliente sem trazer nenhum dado monetário. */
export function agruparRoteiroEntrega(linhas: LinhaEntrega[]): ParadaEntrega[] {
  const porCliente = new Map<string, ParadaEntrega>();
  for (const linha of linhas) {
    const parada = porCliente.get(linha.clienteId) ?? {
      clienteId: linha.clienteId,
      clienteNome: linha.clienteNome,
      numeroEndereco: linha.numeroEndereco,
      cep: linha.cep,
      itens: [],
    };
    parada.itens.push({
      produtoId: linha.produtoId,
      produtoDescricao: linha.produtoDescricao,
      unidade: linha.unidade,
      quantidadeDistribuida: linha.quantidadeDistribuida,
      quantidadeTroca: linha.quantidadeTroca,
    });
    porCliente.set(linha.clienteId, parada);
  }
  return [...porCliente.values()];
}
