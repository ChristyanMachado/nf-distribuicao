export type StatusRecuperacaoDocumento =
  | "PENDENTE"
  | "PROCESSANDO"
  | "CONCLUIDA"
  | "ERRO";

export function documentosDaNotaDisponiveis(
  pdfPath: string | null,
  xmlPath: string | null,
  expiraEm: Date | string | null,
  agora = new Date(),
): boolean {
  if (!pdfPath || !xmlPath || !expiraEm) return false;
  const expira = expiraEm instanceof Date ? expiraEm : new Date(expiraEm);
  return !Number.isNaN(expira.getTime()) && expira.getTime() > agora.getTime();
}

export function recuperacaoEmAndamento(
  status: StatusRecuperacaoDocumento | null,
): boolean {
  return status === "PENDENTE" || status === "PROCESSANDO";
}
