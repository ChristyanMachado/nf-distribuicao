export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import { criarEmitente, listarEmitentes } from "./actions";

export default async function EmitentesPage() {
  const emitentes = await listarEmitentes();

  return (
    <div>
      <h1 className="text-2xl font-medium">Emitentes</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Quem vende e faz login no sistema fiscal. As credenciais aqui são as
        mesmas usadas pela automação para emitir em nome deste emitente.
      </p>

      <Card className="mt-5 p-4">
        <form action={criarEmitente} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nome</Label>
            <input name="nome" required className="w-full" placeholder="Razão social" />
          </div>
          <div>
            <Label>CNPJ</Label>
            <input name="cnpj" className="w-full" />
          </div>
          <div>
            <Label>Inscrição estadual</Label>
            <input name="inscricaoEstadual" className="w-full" />
          </div>
          <div className="col-span-2 mt-1 border-t border-[var(--line)] pt-3">
            <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
              Login no sistema fiscal
            </p>
          </div>
          <div>
            <Label>Usuário (CPF)</Label>
            <input name="loginUsuario" className="font-mono-tab w-full" placeholder="000.000.000-00" />
          </div>
          <div>
            <Label>Senha</Label>
            <input name="senha" type="password" className="w-full" />
          </div>
          <div className="col-span-2 mt-1">
            <PrimaryButton type="submit" className="w-full py-2.5 sm:w-auto">
              Cadastrar emitente
            </PrimaryButton>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Cadastrados ({emitentes.length})
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {emitentes.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <span className="font-medium">{e.nome}</span>
                {e.cnpj && (
                  <span className="font-mono-tab ml-2 text-[var(--ink-faint)]">{e.cnpj}</span>
                )}
              </div>
              {/* Senha nunca aparece na listagem, mesmo mascarada — RF05/RNF02 */}
              <span className="font-mono-tab text-[13px] text-[var(--ink-faint)]">
                {e.loginUsuario ? "login configurado" : "sem login"}
              </span>
            </div>
          ))}
          {emitentes.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
              Nenhum emitente cadastrado ainda.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
