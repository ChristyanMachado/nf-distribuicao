import "server-only";

import { createClient } from "@supabase/supabase-js";
import { chavePublicaSupabase, perfilPermiteAdministracao } from "./auth-provider";

export type ResultadoLoginSupabase =
  | { estado: "autorizado"; usuario: string }
  | { estado: "credenciais_invalidas" | "sem_permissao" | "configuracao_invalida" | "indisponivel" };

export async function autenticarGerenteSupabase(
  email: string,
  senha: string,
): Promise<ResultadoLoginSupabase> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const chave = chavePublicaSupabase();
  if (!url || !chave) return { estado: "configuracao_invalida" };

  try {
    const supabase = createClient(url, chave, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error || !data.user || !data.session) return { estado: "credenciais_invalidas" };

    const { data: perfil, error: erroPerfil } = await supabase
      .from("perfis")
      .select("papel,ativo")
      .eq("id", data.user.id)
      .maybeSingle();
    if (erroPerfil) return { estado: "indisponivel" };
    if (!perfilPermiteAdministracao(perfil)) {
      return { estado: "sem_permissao" };
    }

    return {
      estado: "autorizado",
      usuario: (data.user.email ?? email).toLowerCase(),
    };
  } catch {
    return { estado: "indisponivel" };
  }
}
