export type ProvedorAutenticacao = "administrativo" | "supabase";
type AmbienteAuth = Readonly<Record<string, string | undefined>>;

export function provedorAutenticacao(
  ambiente: AmbienteAuth = process.env,
): ProvedorAutenticacao {
  return ambiente.APP_AUTH_PROVIDER === "supabase"
    ? "supabase"
    : "administrativo";
}

export function chavePublicaSupabase(
  ambiente: AmbienteAuth = process.env,
): string {
  return (
    ambiente.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? ambiente.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? ""
  ).trim();
}

export function perfilPermiteAdministracao(
  perfil: { papel?: unknown; ativo?: unknown } | null,
): boolean {
  return perfil?.papel === "gerente" && perfil.ativo === true;
}
