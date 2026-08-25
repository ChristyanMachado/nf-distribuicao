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
        Quem vende e emite. Login e senha fiscal ficam protegidos no Worker;
        o Web guarda somente uma referência sem segredo.
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
              Integração com o Worker
            </p>
          </div>
          <div className="col-span-2">
            <Label>Referência da credencial</Label>
            <input name="credencialReferencia" className="font-mono-tab w-full uppercase" placeholder="EMITENTE_GRAALYS_01" pattern="[A-Z][A-Z0-9_]{2,63}" />
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
              Não é CPF nem senha. É apenas o nome da credencial configurada no Worker.
            </p>
          </div>
          <div className="col-span-2">
            <Label>Identificador do emitente na NFP-e</Label>
            <input
              name="valorSelectNfpe"
              className="font-mono-tab w-full"
              maxLength={128}
              placeholder="Preencher após o reconhecimento"
            />
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
              Valor da opção no sistema fiscal. Pode ficar vazio por enquanto.
            </p>
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
              <div className="text-right">
                <span className="font-mono-tab block text-[13px] text-[var(--ink-faint)]">
                  {e.credencialReferencia ?? "credencial pendente"}
                </span>
                {!e.valorSelectNfpe && (
                  <span className="text-[12px] text-[var(--wheat)]">NFP-e pendente</span>
                )}
              </div>
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
