export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
<<<<<<< HEAD
import { pendenciasEmitente, resumirPendencias } from "@/lib/prontidao-integracao";
=======
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
import { atualizarEmitente, criarEmitente, listarEmitentes } from "./actions";

const MENSAGENS_SALVAMENTO: Record<string, string> = {
  "emitente-criado": "Emitente cadastrado com sucesso. O formulário já está pronto para o próximo cadastro.",
  "emitente-atualizado": "Integração do emitente atualizada com sucesso.",
};

export default async function EmitentesPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const [emitentes, parametros] = await Promise.all([listarEmitentes(), searchParams]);
  const mensagemSalvamento = parametros.salvo
    ? MENSAGENS_SALVAMENTO[parametros.salvo]
    : undefined;

  return (
    <div>
      <h1 className="text-2xl font-medium">Emitentes</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Quem vende e emite. Login e senha fiscal ficam protegidos no Worker;
        o Web guarda somente uma referência sem segredo.
      </p>

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
        <form
          action={criarEmitente}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="novo-emitente-nome" required>Nome</Label>
            <input id="novo-emitente-nome" name="nome" required maxLength={160} autoComplete="organization" enterKeyHint="next" className="w-full" placeholder="Razão social" />
          </div>
          <div>
            <Label htmlFor="novo-emitente-cnpj" required>CNPJ</Label>
            <input
              id="novo-emitente-cnpj"
              name="cnpj"
              required
              inputMode="numeric"
              maxLength={18}
              autoComplete="off"
              enterKeyHint="next"
              className="font-mono-tab w-full"
            />
          </div>
          <div>
            <Label htmlFor="novo-emitente-ie" required>Inscrição estadual</Label>
            <input
              id="novo-emitente-ie"
              name="inscricaoEstadual"
              required
              inputMode="numeric"
              maxLength={20}
              autoComplete="off"
              enterKeyHint="next"
              className="font-mono-tab w-full"
            />
          </div>
          <div className="sm:col-span-2 mt-1 border-t border-[var(--line)] pt-3">
            <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
              Integração com o Worker
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="novo-emitente-credencial" required>Referência da credencial</Label>
            <input
              id="novo-emitente-credencial"
              name="credencialReferencia"
              required
              maxLength={64}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="next"
              className="font-mono-tab w-full uppercase"
              placeholder="CLIENTE_A"
              pattern="[A-Z][A-Z0-9_]{2,63}"
              title="Use de 3 a 64 caracteres: letras maiúsculas, números e sublinhado."
              aria-describedby="novo-emitente-credencial-ajuda"
            />
            <p id="novo-emitente-credencial-ajuda" className="mt-1 text-[12px] text-[var(--ink-faint)]">
              Não é CPF nem senha. É apenas o nome da credencial configurada no Worker.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="novo-emitente-nfpe" required>Identificador do emitente na NFP-e</Label>
            <input
              id="novo-emitente-nfpe"
              name="valorSelectNfpe"
              required
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              className="font-mono-tab w-full"
              maxLength={128}
              placeholder="Valor da option na NFP-e"
              aria-describedby="novo-emitente-nfpe-ajuda"
            />
            <p id="novo-emitente-nfpe-ajuda" className="mt-1 text-[12px] text-[var(--ink-faint)]">
              Valor da opção no sistema fiscal, por exemplo o já confirmado no Worker.
            </p>
          </div>
          <div className="sm:col-span-2 mt-1">
            <PrimaryButton type="submit" pendingText="Cadastrando…" className="w-full py-2.5 sm:w-auto">
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
<<<<<<< HEAD
          {emitentes.map((e) => {
            const pendencias = pendenciasEmitente(e);
            return (
=======
          {emitentes.map((e) => (
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
            <div key={e.id} className="px-4 py-3 text-sm">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <span className="break-words font-medium">{e.nome}</span>
                  {e.cnpj && (
                    <span className="font-mono-tab mt-0.5 block break-all text-[var(--ink-faint)] sm:ml-2 sm:mt-0 sm:inline">{e.cnpj}</span>
                  )}
                </div>
                <div className="min-w-0 text-left sm:text-right">
                  <span className="font-mono-tab block break-all text-[13px] text-[var(--ink-faint)]">
                    {e.credencialReferencia ?? "credencial pendente"}
                  </span>
                  {!e.valorSelectNfpe && (
                    <span className="text-[12px] text-[var(--wheat)]">NFP-e pendente</span>
                  )}
                </div>
              </div>
<<<<<<< HEAD
              <p className={`mt-2 text-[12px] ${pendencias.length === 0 ? "text-[var(--field-strong)]" : "text-[var(--wheat)]"}`}>
                {resumirPendencias(pendencias)}
              </p>
=======
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
              <details className="mt-3 border-t border-[var(--line)] pt-3">
                <summary className="tap-target flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-[var(--ink-soft)]">
                  Revisar ou completar integração
                </summary>
                <form
                  action={atualizarEmitente}
                  className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3"
                >
                  <input type="hidden" name="emitenteId" value={e.id} />
                  <div className="sm:col-span-2">
                    <Label htmlFor={`emitente-${e.id}-nome`} required>Nome</Label>
                    <input id={`emitente-${e.id}-nome`} name="nome" required maxLength={160} autoComplete="organization" enterKeyHint="next" defaultValue={e.nome} className="w-full" />
                  </div>
                  <div>
                    <Label htmlFor={`emitente-${e.id}-cnpj`} required>CNPJ</Label>
                    <input
                      id={`emitente-${e.id}-cnpj`}
                      name="cnpj"
                      required
                      inputMode="numeric"
                      maxLength={18}
                      autoComplete="off"
                      enterKeyHint="next"
                      defaultValue={e.cnpj ?? ""}
                      className="font-mono-tab w-full"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`emitente-${e.id}-ie`} required>Inscrição estadual</Label>
                    <input
                      id={`emitente-${e.id}-ie`}
                      name="inscricaoEstadual"
                      required
                      inputMode="numeric"
                      maxLength={20}
                      autoComplete="off"
                      enterKeyHint="next"
                      defaultValue={e.inscricaoEstadual ?? ""}
                      className="font-mono-tab w-full"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`emitente-${e.id}-credencial`} required>Referência da credencial</Label>
                    <input
                      id={`emitente-${e.id}-credencial`}
                      name="credencialReferencia"
                      required
                      maxLength={64}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      enterKeyHint="next"
                      pattern="[A-Z][A-Z0-9_]{2,63}"
                      title="Use de 3 a 64 caracteres: letras maiúsculas, números e sublinhado."
                      defaultValue={e.credencialReferencia ?? ""}
                      className="font-mono-tab w-full uppercase"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`emitente-${e.id}-nfpe`} required>Identificador do emitente na NFP-e</Label>
                    <input
                      id={`emitente-${e.id}-nfpe`}
                      name="valorSelectNfpe"
                      required
                      maxLength={128}
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      defaultValue={e.valorSelectNfpe ?? ""}
                      className="font-mono-tab w-full"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <PrimaryButton type="submit" pendingText="Salvando integração…" className="w-full py-2.5 sm:w-auto">
                      Salvar integração
                    </PrimaryButton>
                  </div>
                </form>
              </details>
            </div>
            );
          })}
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
