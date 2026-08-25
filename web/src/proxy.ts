import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function iguaisEmTempoConstante(recebido: string, esperado: string): boolean {
  const hashRecebido = createHash("sha256").update(recebido).digest();
  const hashEsperado = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(hashRecebido, hashEsperado);
}

export function autorizacaoBasicaValida(
  cabecalho: string | null,
  usuarioEsperado: string,
  senhaEsperada: string,
): boolean {
  if (!cabecalho?.startsWith("Basic ")) return false;

  try {
    const credenciais = Buffer.from(cabecalho.slice(6), "base64").toString("utf8");
    const separador = credenciais.indexOf(":");
    if (separador < 0) return false;

    return (
      iguaisEmTempoConstante(credenciais.slice(0, separador), usuarioEsperado) &&
      iguaisEmTempoConstante(credenciais.slice(separador + 1), senhaEsperada)
    );
  } catch {
    return false;
  }
}

/**
 * Trava provisória para impedir que um deploy acidental exponha dados e
 * Server Actions antes da entrada do Supabase Auth. Em desenvolvimento local
 * ela não interfere. Em produção, a ausência das variáveis fecha o acesso.
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const usuarioEsperado = process.env.APP_BASIC_AUTH_USER;
  const senhaEsperada = process.env.APP_BASIC_AUTH_PASSWORD;
  if (!usuarioEsperado || !senhaEsperada) {
    return new NextResponse("Acesso não configurado.", { status: 503 });
  }

  if (
    autorizacaoBasicaValida(
      request.headers.get("authorization"),
      usuarioEsperado,
      senhaEsperada,
    )
  ) {
    return NextResponse.next();
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Graalys", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
