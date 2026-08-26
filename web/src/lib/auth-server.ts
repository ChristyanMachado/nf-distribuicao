import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, validarTokenSessao } from "./auth-session";

/** Confirma a sessão também dentro da Server Action, não só no proxy. */
export async function exigirSessaoAdministrativa() {
  const obrigatoria =
    process.env.NODE_ENV === "production"
    || process.env.APP_AUTH_ENABLED === "true";
  if (!obrigatoria) return null;

  const segredo = process.env.APP_SESSION_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error("Autenticação administrativa não configurada.");
  }

  const armazenamento = await cookies();
  const sessao = validarTokenSessao(
    armazenamento.get(COOKIE_SESSAO)?.value,
    segredo,
  );
  if (!sessao) redirect("/login");
  return sessao;
}
