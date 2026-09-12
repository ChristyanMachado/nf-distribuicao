import type { ParadaEntrega } from "@/lib/entregas";

function escapar(valor: string) {
  return valor.replace(/[&<>"']/g, (caractere) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caractere]!);
}

/** HTML sem scripts, valores ou recursos externos para a impressão automática. */
export function montarHtmlRoteiroImpressao(
  numero: number | null,
  data: string,
  roteiro: ParadaEntrega[],
) {
  const titulo = `Distribuição ${String(numero ?? "—").padStart(6, "0")}`;
  const paradas = roteiro.map((parada, indice) => `
    <section class="parada"><header><b>${indice + 1}</b><div><h2>${escapar(parada.clienteNome)}</h2><small>${escapar([parada.cep && `CEP ${parada.cep}`, parada.numeroEndereco && `nº ${parada.numeroEndereco}`].filter(Boolean).join(" · "))}</small></div></header>
    <table><thead><tr><th>Produto</th><th>Normal</th><th>Troca</th></tr></thead><tbody>${parada.itens.map((item) => `<tr><td>${escapar(item.produtoDescricao)} <small>${escapar(item.unidade)}</small></td><td>${Math.max(0, item.quantidadeDistribuida - item.quantidadeTroca).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td><td>${item.quantidadeTroca > 0 ? item.quantidadeTroca.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—"}</td></tr>`).join("")}</tbody></table>
    <footer>Entregue ( ) &nbsp; Parcial ( ) &nbsp; Não entregue ( ) &nbsp; Observação: __________________</footer></section>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>@page{size:105mm 190mm;margin:7mm}*{box-sizing:border-box}body{font:11px Arial;color:#202b32;margin:0}h1{font-size:19px;margin:2px 0}p{margin:2px 0 12px;color:#52616b}.parada{break-inside:avoid;border:1px solid #cad4d9;border-radius:7px;margin:0 0 9px;overflow:hidden}.parada header{display:flex;gap:8px;padding:8px;background:#edf4f2}.parada header>b{width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#3e6c65;color:#fff}.parada h2{font-size:13px;margin:0}.parada small{color:#52616b}table{width:100%;border-collapse:collapse}th,td{padding:5px 7px;text-align:left;border-top:1px solid #e2e7e9}th:nth-child(n+2),td:nth-child(n+2){text-align:right}th{font-size:9px;text-transform:uppercase;color:#52616b}footer{padding:7px;border-top:1px dashed #cad4d9;color:#52616b;font-size:9px}</style></head><body><h1>Graalyst · roteiro de entrega</h1><p>${escapar(titulo)} · ${escapar(data)} · ${roteiro.length} parada(s)</p>${paradas}</body></html>`;
}
