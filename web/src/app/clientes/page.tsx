export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import { atualizarCliente, criarCliente, listarClientes, listarEmitentes } from "./actions";
import { db } from "@/db";
import { clienteEmitentes } from "@/db/schema";

export default async function ClientesPage() {
  const [clientes, emitentes, relacoes] = await Promise.all([
    listarClientes(),
    listarEmitentes(),
    db.select().from(clienteEmitentes),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-medium">Clientes</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Destinatário da nota. O roteiro do motorista usa o CEP já cadastrado,
        sem adicionar etapas desnecessárias no dia a dia.
      </p>

      {emitentes.length === 0 && (
        <Card className="mt-5 p-4 text-sm text-[var(--wheat)]">
          Cadastre um emitente antes — ele será selecionado ao distribuir
          produtos para um cliente.
        </Card>
      )}

      <Card className="mt-5 p-4">
        <form action={criarCliente} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nome</Label>
            <input name="nome" required className="w-full" placeholder="Mercado X" />
          </div>
          <div className="sm:col-span-2">
            <Label>Razão social para a nota</Label>
            <input
              name="destinatarioNome"
              required
              className="w-full"
              placeholder="Razão social do destinatário"
            />
          </div>
          <div>
            <Label>CNPJ</Label>
            <input name="cnpj" required inputMode="numeric" className="font-mono-tab w-full" placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Inscrição estadual (do cliente)</Label>
            <input name="inscricaoEstadual" required inputMode="numeric" className="font-mono-tab w-full" />
          </div>
          <div>
            <Label>CEP</Label>
            <input name="cep" required inputMode="numeric" className="font-mono-tab w-full" placeholder="00000-000" />
          </div>
          <div>
            <Label>Número</Label>
            <input name="numeroEndereco" required className="font-mono-tab w-full" />
          </div>
          <div className="sm:col-span-2">
            <Label>Emitentes habilitados</Label>
            <div className="flex flex-wrap gap-2">
              {emitentes.map((e) => (
                <label key={e.id} className="flex items-center gap-2 rounded border border-[var(--line)] px-3 py-2 text-sm">
                  <input type="checkbox" name="emitenteIds" value={e.id} />
                  {e.nome}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
              Escolha os emitentes que podem atender este cliente. A escolha final é feita em cada distribuição.
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
              O fluxo atual considera o destinatário contribuinte de ICMS; por isso a inscrição estadual é obrigatória.
            </p>
          </div>
          <div className="sm:col-span-2 mt-1">
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
            const emitentesDoCliente = relacoes
              .filter((relacao) => relacao.clienteId === c.id)
              .map((relacao) => emitentes.find((e) => e.id === relacao.emitenteId))
              .filter((emitente): emitente is NonNullable<typeof emitente> => Boolean(emitente));
            return (
              <div key={c.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.nome}</span>
                  {c.cnpj && (
                    <span className="font-mono-tab text-[var(--ink-faint)]">{c.cnpj}</span>
                  )}
                </div>
                {emitentesDoCliente.length > 0 && (
                  <p className="mt-0.5 text-[13px] text-[var(--ink-faint)]">
                    emitentes: {emitentesDoCliente.map((emitente) => emitente.nome).join(", ")}
                  </p>
                )}
                <details className="mt-3 border-t border-[var(--line)] pt-3">
                  <summary className="tap-target cursor-pointer text-[13px] font-medium text-[var(--ink-soft)]">
                    Revisar ou corrigir cadastro fiscal
                  </summary>
                  <form action={atualizarCliente} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input type="hidden" name="clienteId" value={c.id} />
                    <div className="sm:col-span-2">
                      <Label>Nome curto</Label>
                      <input name="nome" required defaultValue={c.nome} className="w-full" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Razão social para a nota</Label>
                      <input name="destinatarioNome" required defaultValue={c.destinatarioNome ?? ""} className="w-full" />
                    </div>
                    <div>
                      <Label>CNPJ</Label>
                      <input name="cnpj" required inputMode="numeric" defaultValue={c.cnpj ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <div>
                      <Label>Inscrição estadual</Label>
                      <input name="inscricaoEstadual" required inputMode="numeric" defaultValue={c.inscricaoEstadual ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <div>
                      <Label>CEP</Label>
                      <input name="cep" required inputMode="numeric" defaultValue={c.cep ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <div>
                      <Label>Número</Label>
                      <input name="numeroEndereco" required defaultValue={c.numeroEndereco ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Emitentes habilitados</Label>
                      <div className="flex flex-wrap gap-2">
                        {emitentes.map((emitente) => (
                          <label key={emitente.id} className="flex items-center gap-2 rounded border border-[var(--line)] px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              name="emitenteIds"
                              value={emitente.id}
                              defaultChecked={emitentesDoCliente.some((item) => item.id === emitente.id)}
                            />
                            {emitente.nome}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <PrimaryButton type="submit" className="w-full py-2.5 sm:w-auto">
                        Salvar cadastro fiscal
                      </PrimaryButton>
                    </div>
                  </form>
                </details>
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
