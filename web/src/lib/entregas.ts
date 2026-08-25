export type LinhaEntrega = {
  clienteId: string;
  clienteNome: string;
  logradouro: string | null;
  numeroEndereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  produtoId: string;
  produtoDescricao: string;
  unidade: string;
  quantidadeDistribuida: number;
  quantidadeTroca: number;
};

export type ParadaEntrega = Omit<LinhaEntrega, "produtoId" | "produtoDescricao" | "unidade" | "quantidadeDistribuida" | "quantidadeTroca"> & {
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
      logradouro: linha.logradouro,
      numeroEndereco: linha.numeroEndereco,
      bairro: linha.bairro,
      cidade: linha.cidade,
      uf: linha.uf,
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
