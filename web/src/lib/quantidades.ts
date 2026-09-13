/**
 * O banco guarda quantidades fiscais em milésimos. Trabalhar em inteiros aqui
 * evita que 0,1 + 0,2 vire 0,30000000000000004 antes da baixa do saldo.
 */
export function emMilesimos(valor: number, campo = "Quantidade"): number {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`${campo} precisa ser uma quantidade válida.`);
  }
  const milesimos = Math.round(valor * 1000);
  if (Math.abs(valor * 1000 - milesimos) > 1e-7) {
    throw new Error(`${campo} aceita no máximo três casas decimais.`);
  }
  return milesimos;
}

export function deMilesimos(valor: number): string {
  return (valor / 1000).toFixed(3);
}

/** Converte milésimos de volta para número apenas para cálculos/props de UI.
 * A conversão só ocorre depois que toda a aritmética foi feita em inteiros. */
export function numeroDeMilesimos(valor: number): number {
  return Number(deMilesimos(valor));
}

/** Exibição fiscal estável: nunca deixa vazar 0.30000000000000004 na tela. */
export function formatarQuantidade(valor: number, campo = "Quantidade"): string {
  return deMilesimos(emMilesimos(valor, campo)).replace(/\.?(?:0+)$/, "");
}

export function somarMilesimos(valores: number[], campo = "Quantidade"): number {
  return valores.reduce((total, valor) => total + emMilesimos(valor, campo), 0);
}
