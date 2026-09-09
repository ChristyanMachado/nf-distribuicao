export type DestinoRascunho = {
  clienteId: string;
  emitenteId: string;
};

export type LinhaRascunho = DestinoRascunho & {
  quantidadeDistribuida: string;
  quantidadeTroca: string;
  precoUnitario: string;
  // Preço excepcional não substitui o preço sugerido para a próxima rodada.
  precoPromocional: boolean;
  trocaAberta: boolean;
};

export type ProdutoRascunho = {
  produtoId: string;
  quantidadeTotal: string;
  linhas: LinhaRascunho[];
};

export type RascunhoDistribuicao = {
  versao: 1;
  data: string;
  chaveIdempotencia: string;
  destinos: DestinoRascunho[];
  produtos: ProdutoRascunho[];
};

export type CatalogoRascunho = {
  produtoIds: readonly string[];
  destinosPermitidos: readonly DestinoRascunho[];
};

export type ProdutoParaBusca = {
  id: string;
  descricao: string;
};

const PREFIXO_CHAVE = "graalyst:distribuicao:rascunho:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PRODUTOS = 200;
const MAX_LINHAS = 2_000;

export function chaveRascunhoDistribuicao(escopo: string) {
  return `${PREFIXO_CHAVE}:${escopo}`;
}

export function chaveDestino(destino: DestinoRascunho) {
  return `${destino.clienteId}:${destino.emitenteId}`;
}

export function temConteudoRascunho(rascunho: Pick<RascunhoDistribuicao, "destinos" | "produtos">) {
  return rascunho.destinos.length > 0 || rascunho.produtos.length > 0;
}

export function ordenarProdutosParaBusca<T extends ProdutoParaBusca>(produtos: readonly T[]) {
  return [...produtos].sort((a, b) =>
    a.descricao.localeCompare(b.descricao, "pt-BR", { sensitivity: "base" }),
  );
}

function normalizarBusca(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function filtrarProdutosParaBusca<T extends ProdutoParaBusca>(produtos: readonly T[], termo: string) {
  const consulta = normalizarBusca(termo);
  const ordenados = ordenarProdutosParaBusca(produtos);
  if (!consulta) return ordenados;
  return ordenados.filter((produto) => normalizarBusca(produto.descricao).includes(consulta));
}

function textoNumericoSeguro(valor: unknown): valor is string {
  return typeof valor === "string"
    && valor.length <= 24
    && (valor === "" || Number.isFinite(Number(valor)));
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : null;
}

function destinoSeguro(valor: unknown): DestinoRascunho | null {
  const origem = objeto(valor);
  if (!origem || typeof origem.clienteId !== "string" || typeof origem.emitenteId !== "string") return null;
  return { clienteId: origem.clienteId, emitenteId: origem.emitenteId };
}

/**
 * Dados vindos do localStorage nunca são fonte confiável. Esta função conserva
 * somente ids ainda disponíveis para a sessão/catálogo atual e limites que a
 * Server Action também aplica antes de criar um lote.
 */
export function restaurarRascunhoDistribuicao(
  serializado: string | null,
  catalogo: CatalogoRascunho,
): RascunhoDistribuicao | null {
  if (!serializado || serializado.length > 1_000_000) return null;

  let origem: Record<string, unknown> | null;
  try {
    origem = objeto(JSON.parse(serializado));
  } catch {
    return null;
  }
  if (!origem || origem.versao !== 1 || typeof origem.data !== "string" || !DATA_ISO.test(origem.data)
    || typeof origem.chaveIdempotencia !== "string" || !UUID.test(origem.chaveIdempotencia)
    || !Array.isArray(origem.destinos) || !Array.isArray(origem.produtos)) return null;

  const produtoIds = new Set(catalogo.produtoIds);
  const destinosPermitidos = new Set(catalogo.destinosPermitidos.map(chaveDestino));
  const destinos = new Map<string, DestinoRascunho>();
  for (const valor of origem.destinos.slice(0, MAX_LINHAS)) {
    const destino = destinoSeguro(valor);
    if (destino && destinosPermitidos.has(chaveDestino(destino))) {
      destinos.set(chaveDestino(destino), destino);
    }
  }

  const produtos: ProdutoRascunho[] = [];
  const produtosVistos = new Set<string>();
  let totalLinhas = 0;
  for (const valor of origem.produtos.slice(0, MAX_PRODUTOS)) {
    const produto = objeto(valor);
    if (!produto || typeof produto.produtoId !== "string" || produtosVistos.has(produto.produtoId)
      || !produtoIds.has(produto.produtoId) || !textoNumericoSeguro(produto.quantidadeTotal)
      || !Array.isArray(produto.linhas)) continue;

    const linhas = new Map<string, LinhaRascunho>();
    for (const linhaValor of produto.linhas) {
      if (totalLinhas >= MAX_LINHAS) break;
      const linha = objeto(linhaValor);
      const destino = destinoSeguro(linha);
      if (!linha || !destino || !destinos.has(chaveDestino(destino))
        || !textoNumericoSeguro(linha.quantidadeDistribuida)
        || !textoNumericoSeguro(linha.quantidadeTroca)
        || !textoNumericoSeguro(linha.precoUnitario)) continue;
      const chave = chaveDestino(destino);
      if (linhas.has(chave)) continue;
      linhas.set(chave, {
        ...destino,
        quantidadeDistribuida: linha.quantidadeDistribuida,
        quantidadeTroca: linha.quantidadeTroca,
        precoUnitario: linha.precoUnitario,
        // Rascunhos anteriores à marcação continuam válidos e seguros.
        precoPromocional: linha.precoPromocional === true,
        trocaAberta: linha.trocaAberta === true,
      });
      totalLinhas += 1;
    }
    if (linhas.size === 0) continue;
    produtosVistos.add(produto.produtoId);
    produtos.push({
      produtoId: produto.produtoId,
      quantidadeTotal: produto.quantidadeTotal,
      linhas: [...linhas.values()],
    });
  }

  if (!temConteudoRascunho({ destinos: [...destinos.values()], produtos })) return null;
  return {
    versao: 1,
    data: origem.data,
    chaveIdempotencia: origem.chaveIdempotencia,
    destinos: [...destinos.values()],
    produtos,
  };
}
