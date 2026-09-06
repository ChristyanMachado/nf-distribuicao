import "server-only";

import { createHmac } from "node:crypto";
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

/**
 * Identificador estável, porém opaco, para dados locais do navegador.
 * Não substitui autorização no servidor; apenas impede que o mesmo navegador
 * reutilize por engano um rascunho de outra conta autenticada.
 */
export async function escopoRascunhoDistribuicao() {
  const sessao = await exigirSessaoAdministrativa();
  if (!sessao) return "desenvolvimento-local";
  const segredo = process.env.APP_SESSION_SECRET;
  if (!segredo || segredo.length < 32) throw new Error("Autenticação administrativa não configurada.");
  return createHmac("sha256", segredo)
    .update(`rascunho-distribuicao:${sessao.usuario}`)
    .digest("base64url");
}
