function digitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

export function cpfValido(valor) {
  const cpf = digitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (tamanho) => {
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

  return (
    Number(cpf[9]) === calcularDigito(9) &&
    Number(cpf[10]) === calcularDigito(10)
  );
}

export function cnpjValido(valor) {
  const cnpj = digitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcularDigito = (base, pesos) => {
    const soma = base
      .split("")
      .reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcularDigito(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const segundo = calcularDigito(
    `${cnpj.slice(0, 12)}${primeiro}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return cnpj.slice(-2) === `${primeiro}${segundo}`;
}

export function documentoEmitenteValido(valor) {
  const documento = digitos(valor);
  return documento.length === 11 ? cpfValido(documento) : cnpjValido(documento);
}

function preenchido(valor) {
  return typeof valor === "string" && valor.trim().length > 0;
}

export function clienteIncompleto(cliente) {
  const cep = digitos(cliente.cep);
  const inscricaoEstadual = digitos(cliente.inscricao_estadual);
  return (
    !preenchido(cliente.destinatario_nome) ||
    !cnpjValido(cliente.cnpj) ||
    cep.length !== 8 ||
    cep === "00000000" ||
    inscricaoEstadual.length < 2 ||
    inscricaoEstadual.length > 20 ||
    !preenchido(cliente.numero_endereco)
  );
}

export function emitenteIncompleto(emitente) {
  return (
    !documentoEmitenteValido(emitente.cnpj) ||
    !/^[A-Z][A-Z0-9_]{2,63}$/.test(
      String(emitente.credencial_referencia ?? "").trim(),
    ) ||
    !preenchido(emitente.valor_select_nfpe)
  );
}

export function produtoIncompleto(produto) {
  return !preenchido(produto.codigo_fiscal) || produto.regra_ativa !== true;
}
