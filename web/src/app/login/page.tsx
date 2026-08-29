import { redirect } from "next/navigation";
import Card from "@/components/Card";
import { entrar } from "./actions";
import { retornoSeguro } from "@/lib/auth-session";
import { provedorAutenticacao } from "@/lib/auth-provider";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; config?: string; bloqueado?: string; permissao?: string; indisponivel?: string; retorno?: string }> }) {
  const parametros = await searchParams;
  if (process.env.NODE_ENV !== "production" && process.env.APP_AUTH_ENABLED !== "true" && !process.env.APP_SESSION_SECRET) redirect("/");
  const retorno = retornoSeguro(parametros.retorno ?? null);
  const usaSupabase = provedorAutenticacao() === "supabase";
  return (
    <main className="login-screen fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-auto bg-[var(--paper)] px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="font-mono-tab text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--field)]">Graalys · Operação</p>
        <h1 className="mt-3 text-3xl font-medium">Área administrativa</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">Entre para acessar distribuição, notas, entregas e relatórios.</p>
        <Card className="mt-6 p-5 shadow-[0_18px_50px_rgba(36,38,31,0.08)]">
          <form action={entrar} className="space-y-4">
            <input type="hidden" name="retorno" value={retorno} />
            <label className="block text-sm font-medium">{usaSupabase ? "E-mail" : "Usuário"}<input name="usuario" type={usaSupabase ? "email" : "text"} autoComplete="username" required autoFocus className="mt-1.5 w-full" /></label>
            <label className="block text-sm font-medium">Senha<input name="senha" type="password" autoComplete="current-password" required className="mt-1.5 w-full" /></label>
            {parametros.erro && <p role="alert" className="text-sm text-[var(--stamp)]">Usuário ou senha incorretos.</p>}
            {parametros.bloqueado && <p role="alert" className="text-sm text-[var(--stamp)]">Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.</p>}
            {parametros.permissao && <p role="alert" className="text-sm text-[var(--stamp)]">Esta conta não possui acesso de gerente ativo.</p>}
            {parametros.indisponivel && <p role="alert" className="text-sm text-[var(--stamp)]">O login está temporariamente indisponível. Tente novamente em instantes.</p>}
            {parametros.config && <p role="alert" className="text-sm text-[var(--stamp)]">A autenticação ainda não foi configurada neste ambiente.</p>}
            <button className="w-full rounded-[var(--radius-control)] bg-[var(--field)] px-4 py-3 font-medium text-white hover:bg-[var(--field-strong)]">Entrar com segurança</button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-[var(--ink-faint)]">A sessão é bloqueada após 30 minutos sem atividade.</p>
      </div>
    </main>
  );
}
