/**
 * Documentos fiscais só podem ser abertos por HTTPS. Isso impede que um valor
 * adulterado no banco injete esquemas executáveis, como javascript: ou data:.
 * A integração com Storage deverá fornecer URLs assinadas HTTPS e de curta duração.
 */
export function urlHttpsSegura(valor: string | null | undefined): string | null {
  if (!valor) return null;

  try {
    const url = new URL(valor);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
