import { ErroFormulario } from "./formularios";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function exigirUuid(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || !UUID.test(valor)) {
    throw new ErroFormulario(`${campo} inválido.`);
  }
  return valor;
}

export function exigirNumeroFinito(
  valor: unknown,
  campo: string,
  { minimo = 0, maximo = 1_000_000_000 }: { minimo?: number; maximo?: number } = {}
): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw new ErroFormulario(`${campo} fora do intervalo permitido.`);
  }
  return valor;
}

export function exigirDataIso(valor: unknown, campo = "Data"): string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new ErroFormulario(`${campo} inválida.`);
  }
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new ErroFormulario(`${campo} inválida.`);
  }
  return valor;
}

export function limitarTexto(valor: string, campo: string, maximo: number): string {
  const texto = valor.trim();
  if (texto.length > maximo) throw new ErroFormulario(`${campo} é muito longo.`);
  return texto;
}

export function exigirCnpj(valor: string, campo = "CNPJ"): string {
  const cnpj = valor.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    throw new ErroFormulario(`${campo} inválido.`);
  }

  const calcularDigito = (base: string, pesos: number[]) => {
    const soma = base
      .split("")
      .reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(`${cnpj.slice(0, 12)}${primeiro}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (cnpj.slice(-2) !== `${primeiro}${segundo}`) throw new ErroFormulario(`${campo} inválido.`);
  return cnpj;
}

export function exigirCpf(valor: string, campo = "CPF"): string {
  const cpf = valor.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    throw new ErroFormulario(`${campo} inválido.`);
  }

  const calcularDigito = (tamanho: number) => {
    const soma = cpf
      .slice(0, tamanho)
      .split("")
      .reduce(
        (total, digito, indice) => total + Number(digito) * (tamanho + 1 - indice),
        0,
      );
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  if (Number(cpf[9]) !== calcularDigito(9) || Number(cpf[10]) !== calcularDigito(10)) {
    throw new ErroFormulario(`${campo} inválido.`);
  }
  return cpf;
}

export function exigirCpfOuCnpj(valor: string, campo = "CPF ou CNPJ"): string {
  const documento = valor.replace(/\D/g, "");
  if (documento.length === 11) return exigirCpf(documento, campo);
  if (documento.length === 14) return exigirCnpj(documento, campo);
  throw new ErroFormulario(`${campo} inválido.`);
}

export function exigirCep(valor: string, campo = "CEP"): string {
  const cep = valor.replace(/\D/g, "");
  if (cep.length !== 8 || cep === "00000000") {
    throw new ErroFormulario(`${campo} inválido.`);
  }
  return cep;
}

export function exigirInscricaoEstadual(valor: string): string {
  const ie = valor.replace(/\D/g, "");
  if (ie.length < 2 || ie.length > 20) {
    throw new ErroFormulario("Inscrição estadual inválida.");
  }
  return ie;
}
