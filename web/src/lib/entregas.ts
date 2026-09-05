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
  quantidadeFaturavel: number;
  precoUnitario: number;
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
    subtotal: number;
  }>;
};

/** Agrupa o roteiro por parada e soma o mesmo produto vindo de emitentes diferentes. */
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
    const itemExistente = parada.itens.find((item) => item.produtoId === linha.produtoId);
    const subtotal = linha.quantidadeFaturavel * linha.precoUnitario;
    if (itemExistente) {
      itemExistente.quantidadeDistribuida += linha.quantidadeDistribuida;
      itemExistente.quantidadeTroca += linha.quantidadeTroca;
      itemExistente.subtotal += subtotal;
    } else {
      parada.itens.push({
        produtoId: linha.produtoId,
        produtoDescricao: linha.produtoDescricao,
        unidade: linha.unidade,
        quantidadeDistribuida: linha.quantidadeDistribuida,
        quantidadeTroca: linha.quantidadeTroca,
        subtotal,
      });
    }
    porCliente.set(linha.clienteId, parada);
  }
  return [...porCliente.values()];
}
