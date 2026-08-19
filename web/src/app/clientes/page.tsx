export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import { criarCliente, listarClientes, listarEmitentes } from "./actions";

export default async function ClientesPage() {
  const [clientes, emitentes] = await Promise.all([
    listarClientes(),
    listarEmitentes(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-medium">Clientes</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        O destinatário da nota. CEP e número bastam — o resto do endereço o
        próprio sistema fiscal preenche automaticamente ao emitir.
      </p>

      {emitentes.length === 0 && (
        <Card className="mt-5 p-4 text-sm text-[var(--wheat)]">
          Cadastre um emitente antes — é ele quem faz login no sistema
          fiscal para emitir a nota deste cliente.
        </Card>
      )}

      <Card className="mt-5 p-4">
        <form action={criarCliente} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nome</Label>
            <input name="nome" required className="w-full" placeholder="Mercado X" />
          </div>
          <div>
            <Label>CNPJ</Label>
            <input name="cnpj" className="font-mono-tab w-full" />
          </div>
          <div>
            <Label>Inscrição estadual (do cliente)</Label>
            <input name="inscricaoEstadual" className="font-mono-tab w-full" />
          </div>
          <div>
            <Label>CEP</Label>
            <input name="cep" className="font-mono-tab w-full" placeholder="00000-000" />
          </div>
          <div>
            <Label>Número</Label>
            <input name="numeroEndereco" className="font-mono-tab w-full" />
          </div>
          <div className="col-span-2">
            <Label>Emitente responsável</Label>
            <select name="emitenteId" required className="w-full">
              <option value="">Selecionar...</option>
              {emitentes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 mt-1">
            <PrimaryButton type="submit" className="w-full py-2.5 sm:w-auto">
              Cadastrar cliente
            </PrimaryButton>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Cadastrados ({clientes.length})
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {clientes.map((c) => {
            const emitente = emitentes.find((e) => e.id === c.emitenteId);
            return (
              <div key={c.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.nome}</span>
                  {c.cnpj && (
                    <span className="font-mono-tab text-[var(--ink-faint)]">{c.cnpj}</span>
                  )}
                </div>
                {emitente && (
                  <p className="mt-0.5 text-[13px] text-[var(--ink-faint)]">
                    via {emitente.nome}
                  </p>
                )}
              </div>
            );
          })}
          {clientes.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
              Nenhum cliente cadastrado ainda.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
