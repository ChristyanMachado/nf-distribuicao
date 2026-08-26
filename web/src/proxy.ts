import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_SEGUNDOS,
  criarTokenSessao,
  validarTokenSessao,
} from "./lib/auth-session";

function configuracao() {
  return {
    usuario: process.env.APP_ADMIN_USER ?? process.env.APP_BASIC_AUTH_USER,
    senha: process.env.APP_ADMIN_PASSWORD ?? process.env.APP_BASIC_AUTH_PASSWORD,
    segredo: process.env.APP_SESSION_SECRET,
  };
}

export function proxy(request: NextRequest) {
  const auth = configuracao();
  const obrigatoria = process.env.NODE_ENV === "production" || process.env.APP_AUTH_ENABLED === "true";
  if (!obrigatoria && (!auth.usuario || !auth.senha || !auth.segredo)) return NextResponse.next();
  if (!auth.usuario || !auth.senha || !auth.segredo || auth.segredo.length < 32) {
    return new NextResponse("Acesso administrativo não configurado.", { status: 503 });
  }
  if (request.nextUrl.pathname === "/login") return NextResponse.next();

  const sessao = validarTokenSessao(request.cookies.get(COOKIE_SESSAO)?.value, auth.segredo);
  if (!sessao) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    destino.searchParams.set("retorno", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(destino);
  }

  const resposta = NextResponse.next();
  const agora = Math.floor(Date.now() / 1000);
  if (sessao.expiraEm - agora < DURACAO_SESSAO_SEGUNDOS / 2) {
    resposta.cookies.set(COOKIE_SESSAO, criarTokenSessao(sessao.usuario, auth.segredo), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: DURACAO_SESSAO_SEGUNDOS,
    });
  }
  return resposta;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
