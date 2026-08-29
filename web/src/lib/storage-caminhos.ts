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

type DadosNomeDocumento = {
  tipo: "danfe" | "xml";
  cliente: string;
  emitente: string;
  numeroDistribuicao: number | null;
  data: string;
};

function slugNome(valor: string, maximo: number): string {
  return valor
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximo)
    .replace(/-+$/g, "") || "Sem-nome";
}

export function nomeDownloadDocumento(dados: DadosNomeDocumento): string {
  const tipo = dados.tipo === "danfe" ? "DANFE" : "XML";
  const extensao = dados.tipo === "danfe" ? "pdf" : "xml";
  const cliente = slugNome(dados.cliente, 56);
  const emitente = slugNome(dados.emitente, 48);
  const distribuicao = dados.numeroDistribuicao === null
    ? "Distribuicao-historica"
    : `Distribuicao-${String(dados.numeroDistribuicao).padStart(6, "0")}`;
  const data = dados.data.replace(/\D/g, "").slice(0, 8) || "Sem-data";
  return `${tipo}_${cliente}_${emitente}_${distribuicao}_${data}.${extensao}`;
}
