const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const CAMINHO_DOCUMENTO = new RegExp(
  `^notas/${UUID}/(?:xml-[0-9a-f]{64}\\.xml|danfe-[0-9a-f]{64}\\.pdf)$`,
);

export function caminhoStorageInternoValido(valor: string): boolean {
  return valor.length <= 180
    && !valor.includes("..")
    && !valor.includes("\\")
    && CAMINHO_DOCUMENTO.test(valor);
}
