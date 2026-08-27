type EmitenteParaProntidao = {
  cnpj: string | null;
  inscricaoEstadual: string | null;
  credencialReferencia: string | null;
  valorSelectNfpe: string | null;
};

type ClienteParaProntidao = {
  cnpj: string | null;
  inscricaoEstadual: string | null;
  indicadorIe: "CONTRIBUINTE" | "CONTRIBUINTE_ISENTO" | "NAO_CONTRIBUINTE";
  destinatarioNome: string | null;
  cep: string | null;
  numeroEndereco: string | null;
};

function valido(validacao: () => unknown): boolean {
  try {
    validacao();
    return true;
  } catch {
    return false;
  }
}

export function pendenciasEmitente(emitente: EmitenteParaProntidao): string[] {
  const pendencias: string[] = [];
  if (!valido(() => exigirCnpj(emitente.cnpj ?? ""))) pendencias.push("CNPJ");
  if (!valido(() => exigirInscricaoEstadual(emitente.inscricaoEstadual ?? ""))) {
    pendencias.push("inscrição estadual");
  }
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test((emitente.credencialReferencia ?? "").trim())) {
    pendencias.push("referência da credencial");
  }
  if (!(emitente.valorSelectNfpe ?? "").trim()) pendencias.push("identificador NFP-e");
  return pendencias;
}

export function pendenciasCliente(
  cliente: ClienteParaProntidao,
  quantidadeEmitentes: number,
): string[] {
  const pendencias: string[] = [];
  if (!(cliente.destinatarioNome ?? "").trim()) pendencias.push("razão social");
  if (!valido(() => exigirCnpj(cliente.cnpj ?? ""))) pendencias.push("CNPJ");
  if (
    cliente.indicadorIe === "CONTRIBUINTE"
    && !valido(() => exigirInscricaoEstadual(cliente.inscricaoEstadual ?? ""))
  ) {
    pendencias.push("inscrição estadual");
  }
  if (!valido(() => exigirCep(cliente.cep ?? ""))) pendencias.push("CEP");
  if (!(cliente.numeroEndereco ?? "").trim()) pendencias.push("número do endereço");
  if (quantidadeEmitentes < 1) pendencias.push("emitente habilitado");
  return pendencias;
}

export function resumirPendencias(pendencias: string[]): string {
  if (pendencias.length === 0) return "Pronto para gerar tarefas fiscais";
  if (pendencias.length === 1) return `Falta ${pendencias[0]}`;
  return `Faltam ${pendencias.slice(0, -1).join(", ")} e ${pendencias.at(-1)}`;
}
import { exigirCep, exigirCnpj, exigirInscricaoEstadual } from "./validacao";
