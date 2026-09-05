import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_SESSAO = "graalys_session";
export const DURACAO_SESSAO_SEGUNDOS = 30 * 60;

export type SessaoAdministrativa = {
  versao: 1;
  usuario: string;
  papel: "ADMIN";
  emitidoEm: number;
  expiraEm: number;
};

function assinatura(conteudo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(conteudo).digest("base64url");
}

export function criarTokenSessao(usuario: string, segredo: string, agoraMs = Date.now()): string {
  const emitidoEm = Math.floor(agoraMs / 1000);
  const payload: SessaoAdministrativa = {
    versao: 1,
    usuario,
    papel: "ADMIN",
    emitidoEm,
    expiraEm: emitidoEm + DURACAO_SESSAO_SEGUNDOS,
  };
  const conteudo = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${conteudo}.${assinatura(conteudo, segredo)}`;
}

export function validarTokenSessao(token: string | undefined, segredo: string, agoraMs = Date.now()): SessaoAdministrativa | null {
  if (!token || token.length > 2048) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [conteudo, recebida] = partes;
  const esperada = assinatura(conteudo, segredo);
  const bufferRecebido = Buffer.from(recebida, "utf8");
  const bufferEsperado = Buffer.from(esperada, "utf8");
  if (bufferRecebido.length !== bufferEsperado.length || !timingSafeEqual(bufferRecebido, bufferEsperado)) return null;
  try {
    const payload = JSON.parse(Buffer.from(conteudo, "base64url").toString("utf8")) as Partial<SessaoAdministrativa>;
    const agora = Math.floor(agoraMs / 1000);
    if (
      payload.versao !== 1 || payload.papel !== "ADMIN" ||
      typeof payload.usuario !== "string" || !payload.usuario ||
      typeof payload.emitidoEm !== "number" || typeof payload.expiraEm !== "number" ||
      payload.emitidoEm > agora + 60 || payload.expiraEm <= agora ||
      payload.expiraEm - payload.emitidoEm !== DURACAO_SESSAO_SEGUNDOS
    ) return null;
    return payload as SessaoAdministrativa;
  } catch {
    return null;
  }
}

export function retornoSeguro(valor: FormDataEntryValue | string | null): string {
  // Browsers remove control characters while parsing URLs. Reject them before
  // accepting a relative path, including backslashes normalized as slashes.
  if (typeof valor !== "string" || !/^\/(?![\\/])/.test(valor)
    || /[\\\u0000-\u0020\u007f]/.test(valor)) return "/";
  return valor;
}
