"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { COOKIE_SESSAO, DURACAO_SESSAO_SEGUNDOS, criarTokenSessao, retornoSeguro } from "@/lib/auth-session";

function igual(recebido: string, esperado: string): boolean {
  return timingSafeEqual(createHash("sha256").update(recebido).digest(), createHash("sha256").update(esperado).digest());
}

const tentativas = new Map<string, { quantidade: number; primeira: number }>();
const JANELA_MS = 15 * 60 * 1000;
const LIMITE = 5;
const MAX_CHAVES_RATE_LIMIT = 10_000;

function limparTentativasExpiradas(agora: number) {
  for (const [chave, tentativa] of tentativas) {
    if (agora - tentativa.primeira > JANELA_MS) tentativas.delete(chave);
  }
  // Em uma instância serverless o mapa é apenas uma defesa complementar.
  // Ainda assim, nunca permitimos crescimento ilimitado por IPs forjados.
  if (tentativas.size > MAX_CHAVES_RATE_LIMIT) tentativas.clear();
}

function registrarTentativa(chave: string): boolean {
  const agora = Date.now();
  if (tentativas.size >= MAX_CHAVES_RATE_LIMIT) limparTentativasExpiradas(agora);
  const atual = tentativas.get(chave);
  if (!atual || agora - atual.primeira > JANELA_MS) {
    tentativas.set(chave, { quantidade: 1, primeira: agora });
    return true;
  }
  atual.quantidade += 1;
  return atual.quantidade <= LIMITE;
}

export async function entrar(formData: FormData) {
  const usuario = String(formData.get("usuario") ?? "").slice(0, 160);
  const senha = String(formData.get("senha") ?? "").slice(0, 1024);
  const retorno = retornoSeguro(formData.get("retorno"));
  const usuarioEsperado = process.env.APP_ADMIN_USER ?? process.env.APP_BASIC_AUTH_USER;
  const senhaEsperada = process.env.APP_ADMIN_PASSWORD ?? process.env.APP_BASIC_AUTH_PASSWORD;
  const segredo = process.env.APP_SESSION_SECRET;
  if (!usuarioEsperado || !senhaEsperada || !segredo || segredo.length < 32) redirect("/login?config=1");
  const cabecalhos = await headers();
  const origem = (cabecalhos.get("x-forwarded-for") ?? cabecalhos.get("x-real-ip") ?? "local").split(",")[0].trim().slice(0, 80);
  if (!registrarTentativa(origem)) redirect(`/login?bloqueado=1&retorno=${encodeURIComponent(retorno)}`);
  if (!igual(usuario, usuarioEsperado) || !igual(senha, senhaEsperada)) redirect(`/login?erro=1&retorno=${encodeURIComponent(retorno)}`);
  tentativas.delete(origem);
  const armazenamento = await cookies();
  armazenamento.set(COOKIE_SESSAO, criarTokenSessao(usuarioEsperado, segredo), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });
  redirect(retorno);
}

export async function sair() {
  const armazenamento = await cookies();
  armazenamento.delete(COOKIE_SESSAO);
  redirect("/login");
}
