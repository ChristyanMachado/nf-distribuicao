const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function exigirUuid(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || !UUID.test(valor)) {
    throw new Error(`${campo} inválido.`);
  }
  return valor;
}

export function exigirNumeroFinito(
  valor: unknown,
  campo: string,
  { minimo = 0, maximo = 1_000_000_000 }: { minimo?: number; maximo?: number } = {}
): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${campo} fora do intervalo permitido.`);
  }
  return valor;
}

export function exigirDataIso(valor: unknown, campo = "Data"): string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error(`${campo} inválida.`);
  }
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new Error(`${campo} inválida.`);
  }
  return valor;
}

export function limitarTexto(valor: string, campo: string, maximo: number): string {
  const texto = valor.trim();
  if (texto.length > maximo) throw new Error(`${campo} é muito longo.`);
  return texto;
}
