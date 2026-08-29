import { describe, expect, it } from "vitest";
import {
  chavePublicaSupabase,
  perfilPermiteAdministracao,
  provedorAutenticacao,
} from "./auth-provider";

describe("provedor de autenticação", () => {
  it("preserva o login administrativo até a migração ser habilitada", () => {
    expect(provedorAutenticacao({})).toBe("administrativo");
    expect(provedorAutenticacao({ APP_AUTH_PROVIDER: "supabase" })).toBe("supabase");
  });

  it("prefere a chave publicável atual e aceita a anon legada", () => {
    expect(chavePublicaSupabase({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })).toBe("anon");
    expect(chavePublicaSupabase({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publicavel",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    })).toBe("publicavel");
  });

  it("aceita somente perfil gerente ativo", () => {
    expect(perfilPermiteAdministracao({ papel: "gerente", ativo: true })).toBe(true);
    expect(perfilPermiteAdministracao({ papel: "gerente", ativo: false })).toBe(false);
    expect(perfilPermiteAdministracao({ papel: "funcionario", ativo: true })).toBe(false);
    expect(perfilPermiteAdministracao(null)).toBe(false);
  });
});
