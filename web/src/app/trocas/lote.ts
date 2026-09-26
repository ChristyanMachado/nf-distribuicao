import { ErroFormulario } from "@/lib/formularios";
import { deMilesimos, emMilesimos } from "@/lib/quantidades";
import { exigirNumeroFinito, exigirUuid } from "@/lib/validacao";

export type ItemLoteTroca = {
  produtoId: string;
  quantidade: string;
  chaveIdempotencia: string;
};

/** Valida a forma inteira antes de qualquer escrita: um envio é um lote atômico. */
export function lerItensLoteTrocas(formData: FormData): ItemLoteTroca[] {
  const produtos = formData.getAll("produtoId");
  const quantidades = formData.getAll("quantidade");
  const chaves = formData.getAll("chaveIdempotencia");
  if (
    produtos.length === 0 || produtos.length > 30 ||
    produtos.length !== quantidades.length || produtos.length !== chaves.length
  ) {
    throw new ErroFormulario("Informe de 1 a 30 produtos com quantidade para este mercado.");
  }

  const vistos = new Set<string>();
  const chavesVistas = new Set<string>();
  return produtos.map((produto, indice) => {
    const produtoId = exigirUuid(produto, `Produto ${indice + 1}`);
    const chaveIdempotencia = exigirUuid(chaves[indice], `Identificador do produto ${indice + 1}`);
    if (vistos.has(produtoId)) throw new ErroFormulario("Cada produto deve aparecer uma vez por envio.");
    if (chavesVistas.has(chaveIdempotencia)) throw new ErroFormulario("Identificadores repetidos no envio.");
    vistos.add(produtoId);
    chavesVistas.add(chaveIdempotencia);
    const quantidade = exigirNumeroFinito(Number(String(quantidades[indice]).trim()),
      `Quantidade do produto ${indice + 1}`, { minimo: 0.001, maximo: 999_999_999.999 });
    return {
      produtoId,
      chaveIdempotencia,
      quantidade: deMilesimos(emMilesimos(quantidade, `Quantidade do produto ${indice + 1}`)),
    };
  });
}
