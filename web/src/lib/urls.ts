/**
 * Documentos fiscais só podem ser abertos por HTTPS. Isso impede que um valor
 * adulterado no banco injete esquemas executáveis, como javascript: ou data:.
 * A integração com Storage deverá fornecer URLs assinadas HTTPS e de curta duração.
 */
function hostsConfigurados(): Set<string> {
  const hosts = (process.env.NEXT_PUBLIC_STORAGE_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  const urlPublica = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (urlPublica) {
    try {
      hosts.push(new URL(urlPublica).hostname.toLowerCase());
    } catch {
      // URL inválida não amplia a lista permitida.
    }
  }
  return new Set(hosts);
}

export function urlHttpsSegura(
  valor: string | null | undefined,
  hostsPermitidos = hostsConfigurados(),
): string | null {
  if (!valor) return null;

  try {
    const url = new URL(valor);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || (url.port && url.port !== "443")
      || url.hash
      || !hostsPermitidos.has(host)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
