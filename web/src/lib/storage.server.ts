import "server-only";

import { createClient } from "@supabase/supabase-js";
import { caminhoStorageInternoValido } from "./storage-caminhos";

const DURACAO_URL_SEGUNDOS = 5 * 60;

function configuracaoStorage() {
  const baseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const chave = (
    process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? ""
  ).trim();
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET ?? "documentos-fiscais").trim();
  if (
    !baseUrl
    || chave.length < 24
    || chave.length > 4096
    || !/^[\x21-\x7e]+$/.test(chave)
    || !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)
  ) return null;

  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:"
      || !url.hostname.endsWith(".supabase.co")
      || url.username
      || url.password
      || (url.port && url.port !== "443")
      || (url.pathname !== "/" && url.pathname !== "")
      || url.search
      || url.hash
    ) return null;
    return { baseUrl, chave, bucket, host: url.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

export async function assinarDocumentosPrivados(
  documentos: Array<{ caminho: string | null; nomeDownload: string }>,
): Promise<Map<string, string>> {
  const config = configuracaoStorage();
  if (!config) return new Map();
  const porCaminho = new Map<string, string>();
  for (const documento of documentos) {
    if (documento.caminho && caminhoStorageInternoValido(documento.caminho)) {
      porCaminho.set(documento.caminho, documento.nomeDownload);
    }
  }
  const unicos = [...porCaminho.keys()];
  if (unicos.length === 0) return new Map();

  const supabase = createClient(config.baseUrl, config.chave, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const pares = await Promise.all(unicos.map(async (caminho) => {
    const { data, error } = await supabase.storage
      .from(config.bucket)
      .createSignedUrl(caminho, DURACAO_URL_SEGUNDOS, {
        download: porCaminho.get(caminho),
      });
    if (error || !data?.signedUrl) return null;
    try {
      const url = new URL(data.signedUrl);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== config.host) {
        return null;
      }
      return [caminho, url.toString()] as const;
    } catch {
      return null;
    }
  }));
  return new Map(pares.filter((item): item is readonly [string, string] => item !== null));
}
