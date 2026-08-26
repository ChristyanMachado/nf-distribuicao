export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label, Legend } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import {
  criarProduto,
  listarProdutos,
  listarRegrasFiscaisAtivas,
} from "./actions";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const [produtos, regrasFiscais, parametros] = await Promise.all([
    listarProdutos(),
    listarRegrasFiscaisAtivas(),
    searchParams,
  ]);
  const regraUnica = regrasFiscais.length === 1 ? regrasFiscais[0] : null;
  const mensagemSalvamento = parametros.salvo === "produto-criado"
    ? "Produto cadastrado com sucesso. O formulário já está pronto para o próximo produto."
    : undefined;

  return (
    <div>
      <h1 className="text-2xl font-medium">Produtos</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Cadastre o produto uma vez. A regra fiscal padrão é aplicada
        automaticamente, sem repetir CFOP, ICMS e benefício a cada cadastro.
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

      {regrasFiscais.length === 0 && (
        <p className="mt-5 rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-3 text-sm text-[var(--wheat)]" role="status">
          Nenhuma regra fiscal ativa está disponível. Ative uma regra antes de cadastrar produtos.
        </p>
      )}

      <Card className="mt-5 p-4">
        <form action={criarProduto} className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          <div className="sm:col-span-2">
            <Label htmlFor="novo-produto-descricao" required>Descrição</Label>
            <input id="novo-produto-descricao" name="descricao" required maxLength={160} autoComplete="off" enterKeyHint="next" className="w-full" placeholder="Couve-flor" />
          </div>
          <div>
            <Label htmlFor="novo-produto-codigo-fiscal" required>Código fiscal</Label>
            <input id="novo-produto-codigo-fiscal" name="codigoFiscal" required maxLength={80} autoComplete="off" spellCheck={false} enterKeyHint="next" className="w-full" placeholder="Código usado na NFP-e" />
          </div>
          <div>
            <Label htmlFor="novo-produto-unidade" required>Unidade</Label>
            <input id="novo-produto-unidade" name="unidade" required maxLength={16} defaultValue="UN" autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="next" className="w-full" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="novo-produto-preco" required>Preço padrão (R$)</Label>
            <input
              id="novo-produto-preco"
              name="precoPadrao"
              type="number"
              required
              inputMode="decimal"
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue="0"
              enterKeyHint="next"
              className="font-mono-tab w-full"
            />
          </div>
          <fieldset className="min-w-0 sm:col-span-2">
            <Legend required>Regra fiscal</Legend>
            {regraUnica ? (
              <>
                <input type="hidden" name="regraFiscalId" value={regraUnica.id} />
                <p id="novo-produto-regra" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--field-tint)] px-3 py-2.5 text-sm text-[var(--ink-soft)]">
                  {regraUnica.nome} <span className="text-[var(--ink-faint)]">· aplicada automaticamente</span>
                </p>
              </>
            ) : (
              <select id="novo-produto-regra" name="regraFiscalId" required defaultValue="" aria-label="Regra fiscal" className="w-full">
                <option value="" disabled>Selecione a regra</option>
                {regrasFiscais.map((regra) => (
                  <option key={regra.id} value={regra.id}>{regra.nome}</option>
                ))}
              </select>
            )}
          </fieldset>
          <div className="sm:col-span-2 mt-1">
            <PrimaryButton type="submit" disabled={regrasFiscais.length === 0} pendingText="Cadastrando…" className="w-full py-2.5 sm:w-auto">
              Cadastrar produto
            </PrimaryButton>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Cadastrados ({produtos.length})
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {produtos.map((p) => (
            <div key={p.id} className="flex flex-col items-start gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{p.descricao}</p>
                <p className="mt-0.5 break-words text-xs text-[var(--ink-faint)]">{p.regraFiscalNome}</p>
              </div>
              <span className="shrink-0 font-mono-tab text-[var(--ink-faint)] sm:text-right">
                R$ {p.precoPadrao} / {p.unidade}
              </span>
            </div>
          ))}
          {produtos.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
              Nenhum produto cadastrado ainda.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
