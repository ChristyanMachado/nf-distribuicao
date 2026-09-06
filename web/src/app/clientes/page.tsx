export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label, Legend } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import {
  atualizarCliente,
  criarCliente,
  desativarCliente,
  listarClientes,
  listarEmitentes,
  reativarCliente,
} from "./actions";
import { db } from "@/db";
import { clienteEmitentes } from "@/db/schema";
import { pendenciasCliente, resumirPendencias } from "@/lib/prontidao-integracao";

const MENSAGENS_SALVAMENTO: Record<string, string> = {
  "cliente-criado": "Cliente cadastrado com sucesso. O formulário já está pronto para o próximo cadastro.",
  "cliente-atualizado": "Cadastro fiscal do cliente atualizado com sucesso.",
  "cliente-desativado": "Cliente desativado. O histórico foi preservado.",
  "cliente-reativado": "Cliente reativado e disponível novamente.",
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const [clientes, emitentes, relacoes, parametros] = await Promise.all([
    listarClientes(),
    listarEmitentes(),
    db.select().from(clienteEmitentes),
    searchParams,
  ]);
  const mensagemSalvamento = parametros.salvo
    ? MENSAGENS_SALVAMENTO[parametros.salvo]
    : undefined;
  const clientesAtivos = clientes.filter((cliente) => cliente.ativo);
  const clientesInativos = clientes.filter((cliente) => !cliente.ativo);

  return (
    <div>
      <h1 className="text-2xl font-medium">Clientes</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Destinatário da nota. O roteiro do motorista usa o CEP já cadastrado,
        sem adicionar etapas desnecessárias no dia a dia.
      </p>

      {emitentes.length === 0 && (
        <div role="status">
          <Card className="mt-5 p-4 text-sm text-[var(--wheat)]">
            Cadastre um emitente antes — ele será selecionado ao distribuir
            produtos para um cliente.
          </Card>
        </div>
      )}

      {mensagemSalvamento && (
        <p
          className="mt-5 rounded-[var(--radius-control)] border border-[var(--field)] bg-[var(--field-tint)] px-4 py-3 text-sm text-[var(--ink)]"
          role="status"
          aria-live="polite"
        >
          {mensagemSalvamento}
        </p>
      )}

      <Card className="mt-5 p-4">
        <FormularioComFeedback action={criarCliente} className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          <div className="sm:col-span-2">
            <Label htmlFor="novo-cliente-nome" required>Nome curto</Label>
            <input
              id="novo-cliente-nome"
              name="nome"
              required
              maxLength={160}
              autoComplete="off"
              enterKeyHint="next"
              className="w-full"
              placeholder="Mercado X"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="novo-cliente-razao-social" required>Razão social para a nota</Label>
            <input
              id="novo-cliente-razao-social"
              name="destinatarioNome"
              required
              maxLength={200}
              autoComplete="organization"
              enterKeyHint="next"
              className="w-full"
              placeholder="Razão social do destinatário"
            />
          </div>
          <div>
            <Label htmlFor="novo-cliente-cnpj" required>CNPJ</Label>
            <input id="novo-cliente-cnpj" name="cnpj" required inputMode="numeric" maxLength={18} autoComplete="off" enterKeyHint="next" className="font-mono-tab w-full" placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label htmlFor="novo-cliente-ie" required>Inscrição estadual (do cliente)</Label>
            <input id="novo-cliente-ie" name="inscricaoEstadual" required inputMode="numeric" maxLength={20} autoComplete="off" enterKeyHint="next" className="font-mono-tab w-full" />
          </div>
          <div>
            <Label htmlFor="novo-cliente-cep" required>CEP</Label>
            <input id="novo-cliente-cep" name="cep" required inputMode="numeric" maxLength={9} autoComplete="postal-code" enterKeyHint="next" className="font-mono-tab w-full" placeholder="00000-000" />
          </div>
          <div>
            <Label htmlFor="novo-cliente-numero" required>Número</Label>
            <input id="novo-cliente-numero" name="numeroEndereco" required maxLength={32} autoComplete="address-line2" enterKeyHint="next" className="font-mono-tab w-full" />
          </div>
          <fieldset className="min-w-0 sm:col-span-2" aria-describedby="novo-cliente-emitentes-ajuda" aria-required="true">
            <Legend required>Emitentes habilitados</Legend>
            <div className="flex flex-wrap gap-2">
              {emitentes.map((e) => (
                <label key={e.id} htmlFor={`novo-cliente-emitente-${e.id}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-3 py-2 text-sm">
                  <input
                    id={`novo-cliente-emitente-${e.id}`}
                    type="checkbox"
                    name="emitenteIds"
                    value={e.id}
                    defaultChecked={emitentes.length === 1}
                  />
                  {e.nome}
                </label>
              ))}
            </div>
            <p id="novo-cliente-emitentes-ajuda" className="mt-1 text-[12px] text-[var(--ink-faint)]">
              Escolha os emitentes que podem atender este cliente. A escolha final é feita em cada distribuição.
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
              O fluxo atual considera o destinatário contribuinte de ICMS; por isso a inscrição estadual é obrigatória.
            </p>
          </fieldset>
          <div className="sm:col-span-2 mt-1">
            <PrimaryButton type="submit" disabled={emitentes.length === 0} pendingText="Cadastrando…" className="w-full py-2.5 sm:w-auto">
              Cadastrar cliente
            </PrimaryButton>
          </div>
        </FormularioComFeedback>
      </Card>

      <div className="mt-6">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Ativos ({clientesAtivos.length})
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {clientesAtivos.map((c) => {
            const emitentesDoCliente = relacoes
              .filter((relacao) => relacao.clienteId === c.id)
              .map((relacao) => emitentes.find((e) => e.id === relacao.emitenteId))
              .filter((emitente): emitente is NonNullable<typeof emitente> => Boolean(emitente));
            const pendencias = pendenciasCliente(c, emitentesDoCliente.length);
            return (
              <div key={c.id} className="px-4 py-3 text-sm">
                <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-words font-medium">{c.nome}</span>
                  {c.cnpj && (
                    <span className="font-mono-tab break-all text-[var(--ink-faint)]">{c.cnpj}</span>
                  )}
                </div>
                {emitentesDoCliente.length > 0 && (
                  <p className="mt-0.5 text-[13px] text-[var(--ink-faint)]">
                    emitentes: {emitentesDoCliente.map((emitente) => emitente.nome).join(", ")}
                  </p>
                )}
                <p className={`mt-2 text-[12px] ${pendencias.length === 0 ? "text-[var(--field-strong)]" : "text-[var(--wheat)]"}`}>
                  {resumirPendencias(pendencias)}
                </p>
                <details className="mt-3 border-t border-[var(--line)] pt-3">
                  <summary className="tap-target flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-[var(--ink-soft)]">
                    Revisar ou corrigir cadastro fiscal
                  </summary>
                  <FormularioComFeedback action={atualizarCliente} className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                    <input type="hidden" name="clienteId" value={c.id} />
                    <div className="sm:col-span-2">
                      <Label htmlFor={`cliente-${c.id}-nome`} required>Nome curto</Label>
                      <input id={`cliente-${c.id}-nome`} name="nome" required maxLength={160} autoComplete="off" enterKeyHint="next" defaultValue={c.nome} className="w-full" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor={`cliente-${c.id}-razao-social`} required>Razão social para a nota</Label>
                      <input id={`cliente-${c.id}-razao-social`} name="destinatarioNome" required maxLength={200} autoComplete="organization" enterKeyHint="next" defaultValue={c.destinatarioNome ?? ""} className="w-full" />
                    </div>
                    <div>
                      <Label htmlFor={`cliente-${c.id}-cnpj`} required>CNPJ</Label>
                      <input id={`cliente-${c.id}-cnpj`} name="cnpj" required inputMode="numeric" maxLength={18} autoComplete="off" enterKeyHint="next" defaultValue={c.cnpj ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <div>
                      <Label htmlFor={`cliente-${c.id}-ie`} required>Inscrição estadual</Label>
                      <input id={`cliente-${c.id}-ie`} name="inscricaoEstadual" required inputMode="numeric" maxLength={20} autoComplete="off" enterKeyHint="next" defaultValue={c.inscricaoEstadual ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <div>
                      <Label htmlFor={`cliente-${c.id}-cep`} required>CEP</Label>
                      <input id={`cliente-${c.id}-cep`} name="cep" required inputMode="numeric" maxLength={9} autoComplete="postal-code" enterKeyHint="next" defaultValue={c.cep ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <div>
                      <Label htmlFor={`cliente-${c.id}-numero`} required>Número</Label>
                      <input id={`cliente-${c.id}-numero`} name="numeroEndereco" required maxLength={32} autoComplete="address-line2" enterKeyHint="next" defaultValue={c.numeroEndereco ?? ""} className="font-mono-tab w-full" />
                    </div>
                    <fieldset className="min-w-0 sm:col-span-2" aria-describedby={`cliente-${c.id}-emitentes-ajuda`} aria-required="true">
                      <Legend required>Emitentes habilitados</Legend>
                      <div className="flex flex-wrap gap-2">
                        {emitentes.map((emitente) => (
                          <label key={emitente.id} htmlFor={`cliente-${c.id}-emitente-${emitente.id}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-3 py-2 text-sm">
                            <input
                              id={`cliente-${c.id}-emitente-${emitente.id}`}
                              type="checkbox"
                              name="emitenteIds"
                              value={emitente.id}
                              defaultChecked={emitentesDoCliente.some((item) => item.id === emitente.id)}
                            />
                            {emitente.nome}
                          </label>
                        ))}
                      </div>
                      <p id={`cliente-${c.id}-emitentes-ajuda`} className="mt-1 text-[12px] text-[var(--ink-faint)]">
                        Selecione ao menos um emitente para este cliente.
                      </p>
                    </fieldset>
                    <div className="sm:col-span-2">
                      <PrimaryButton type="submit" pendingText="Salvando cadastro…" className="w-full py-2.5 sm:w-auto">
                        Salvar cadastro fiscal
                      </PrimaryButton>
                    </div>
                  </FormularioComFeedback>
                  <FormularioComFeedback action={desativarCliente} className="mt-3">
                    <input type="hidden" name="clienteId" value={c.id} />
                    <button
                      type="submit"
                      className="tap-target min-h-11 text-[13px] text-[var(--stamp)]"
                    >
                      Desativar cliente
                    </button>
                  </FormularioComFeedback>
                </details>
              </div>
            );
          })}
          {clientesAtivos.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
              Nenhum cliente cadastrado ainda.
            </div>
          )}
        </Card>
      </div>

      {clientesInativos.length > 0 && (
        <details className="mt-5">
          <summary className="tap-target flex min-h-11 cursor-pointer items-center text-sm font-medium text-[var(--ink-soft)]">
            Desativados ({clientesInativos.length})
          </summary>
          <Card className="divide-y divide-[var(--line)]">
            {clientesInativos.map((cliente) => (
              <div key={cliente.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{cliente.nome}</p>
                  <p className="font-mono-tab text-[12px] text-[var(--ink-faint)]">
                    {cliente.cnpj ?? "CNPJ não informado"}
                  </p>
                </div>
                <FormularioComFeedback action={reativarCliente}>
                  <input type="hidden" name="clienteId" value={cliente.id} />
                  <PrimaryButton type="submit" pendingText="Reativando…" className="w-full sm:w-auto">
                    Reativar
                  </PrimaryButton>
                </FormularioComFeedback>
              </div>
            ))}
          </Card>
        </details>
      )}
    </div>
  );
}
