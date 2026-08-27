export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label, Legend } from "@/components/Field";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import PrimaryButton from "@/components/PrimaryButton";
import {
  atualizarProduto,
  criarProduto,
  desativarProduto,
  listarProdutos,
  listarRegrasFiscaisAtivas,
  reativarProduto,
} from "./actions";

const MENSAGENS_SALVAMENTO: Record<string, string> = {
  "produto-criado":
    "Produto cadastrado com sucesso. O formulário já está pronto para o próximo produto.",
  "produto-atualizado": "Produto atualizado com sucesso.",
  "produto-desativado": "Produto desativado. O histórico foi preservado.",
  "produto-reativado": "Produto reativado e disponível novamente.",
};

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
  const mensagemSalvamento = parametros.salvo
    ? MENSAGENS_SALVAMENTO[parametros.salvo]
    : undefined;
  const produtosAtivos = produtos.filter((produto) => produto.ativo);
  const produtosInativos = produtos.filter((produto) => !produto.ativo);

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
        <p
          className="mt-5 rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-3 text-sm text-[var(--wheat)]"
          role="status"
        >
          Nenhuma regra fiscal ativa está disponível. Ative uma regra antes de
          cadastrar ou editar produtos.
        </p>
      )}

      <Card className="mt-5 p-4">
        <FormularioComFeedback
          action={criarProduto}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="novo-produto-descricao" required>
              Descrição
            </Label>
            <input
              id="novo-produto-descricao"
              name="descricao"
              required
              maxLength={160}
              autoComplete="off"
              enterKeyHint="next"
              className="w-full"
              placeholder="Couve-flor"
            />
          </div>
          <div>
            <Label htmlFor="novo-produto-codigo-fiscal" required>
              Código fiscal
            </Label>
            <input
              id="novo-produto-codigo-fiscal"
              name="codigoFiscal"
              required
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="next"
              className="w-full"
              placeholder="Código usado na NFP-e"
            />
          </div>
          <div>
            <Label htmlFor="novo-produto-unidade" required>
              Unidade
            </Label>
            <input
              id="novo-produto-unidade"
              name="unidade"
              required
              maxLength={16}
              defaultValue="UN"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="next"
              className="w-full"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="novo-produto-preco" required>
              Preço padrão (R$)
            </Label>
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
                <p className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--field-tint)] px-3 py-2.5 text-sm text-[var(--ink-soft)]">
                  {regraUnica.nome}{" "}
                  <span className="text-[var(--ink-faint)]">
                    · aplicada automaticamente
                  </span>
                </p>
              </>
            ) : (
              <select
                name="regraFiscalId"
                required
                defaultValue=""
                aria-label="Regra fiscal"
                className="w-full"
              >
                <option value="" disabled>
                  Selecione a regra
                </option>
                {regrasFiscais.map((regra) => (
                  <option key={regra.id} value={regra.id}>
                    {regra.nome}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
          <div className="sm:col-span-2 mt-1">
            <PrimaryButton
              type="submit"
              disabled={regrasFiscais.length === 0}
              pendingText="Cadastrando…"
              className="w-full py-2.5 sm:w-auto"
            >
              Cadastrar produto
            </PrimaryButton>
          </div>
        </FormularioComFeedback>
      </Card>

      <div className="mt-6">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Ativos ({produtosAtivos.length})
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {produtosAtivos.map((produto) => (
            <div key={produto.id} className="px-4 py-3 text-sm">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{produto.descricao}</p>
                  <p className="mt-0.5 break-words text-xs text-[var(--ink-faint)]">
                    {produto.codigoFiscal} · {produto.regraFiscalNome}
                  </p>
                </div>
                <span className="shrink-0 font-mono-tab text-[var(--ink-faint)] sm:text-right">
                  R$ {produto.precoPadrao} / {produto.unidade}
                </span>
              </div>

              <details className="mt-2 border-t border-[var(--line)] pt-2">
                <summary className="tap-target flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-[var(--ink-soft)]">
                  Editar ou desativar produto
                </summary>
                <FormularioComFeedback
                  action={atualizarProduto}
                  className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3"
                >
                  <input type="hidden" name="produtoId" value={produto.id} />
                  <div className="sm:col-span-2">
                    <Label htmlFor={`produto-${produto.id}-descricao`} required>
                      Descrição
                    </Label>
                    <input
                      id={`produto-${produto.id}-descricao`}
                      name="descricao"
                      required
                      maxLength={160}
                      defaultValue={produto.descricao}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`produto-${produto.id}-codigo`} required>
                      Código fiscal
                    </Label>
                    <input
                      id={`produto-${produto.id}-codigo`}
                      name="codigoFiscal"
                      required
                      maxLength={80}
                      defaultValue={produto.codigoFiscal ?? ""}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`produto-${produto.id}-unidade`} required>
                      Unidade
                    </Label>
                    <input
                      id={`produto-${produto.id}-unidade`}
                      name="unidade"
                      required
                      maxLength={16}
                      defaultValue={produto.unidade}
                      className="w-full"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`produto-${produto.id}-preco`} required>
                      Preço padrão (R$)
                    </Label>
                    <input
                      id={`produto-${produto.id}-preco`}
                      name="precoPadrao"
                      type="number"
                      required
                      inputMode="decimal"
                      min="0"
                      max="1000000000"
                      step="0.01"
                      defaultValue={produto.precoPadrao}
                      className="font-mono-tab w-full"
                    />
                  </div>
                  <fieldset className="min-w-0 sm:col-span-2">
                    <Legend required>Regra fiscal</Legend>
                    {regraUnica ? (
                      <>
                        <input
                          type="hidden"
                          name="regraFiscalId"
                          value={regraUnica.id}
                        />
                        <p className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--field-tint)] px-3 py-2.5 text-sm text-[var(--ink-soft)]">
                          {regraUnica.nome}
                        </p>
                      </>
                    ) : (
                      <select
                        name="regraFiscalId"
                        required
                        defaultValue={produto.regraFiscalId}
                        aria-label={`Regra fiscal de ${produto.descricao}`}
                        className="w-full"
                      >
                        {regrasFiscais.map((regra) => (
                          <option key={regra.id} value={regra.id}>
                            {regra.nome}
                          </option>
                        ))}
                      </select>
                    )}
                  </fieldset>
                  <div className="sm:col-span-2">
                    <PrimaryButton
                      type="submit"
                      disabled={regrasFiscais.length === 0}
                      pendingText="Salvando…"
                      className="w-full sm:w-auto"
                    >
                      Salvar produto
                    </PrimaryButton>
                  </div>
                </FormularioComFeedback>
                <FormularioComFeedback action={desativarProduto} className="mt-3">
                  <input type="hidden" name="produtoId" value={produto.id} />
                  <button
                    type="submit"
                    className="tap-target min-h-11 text-[13px] text-[var(--stamp)]"
                  >
                    Desativar produto
                  </button>
                </FormularioComFeedback>
              </details>
            </div>
          ))}
          {produtosAtivos.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
              Nenhum produto ativo.
            </div>
          )}
        </Card>
      </div>

      {produtosInativos.length > 0 && (
        <details className="mt-5">
          <summary className="tap-target flex min-h-11 cursor-pointer items-center text-sm font-medium text-[var(--ink-soft)]">
            Desativados ({produtosInativos.length})
          </summary>
          <Card className="divide-y divide-[var(--line)]">
            {produtosInativos.map((produto) => (
              <div
                key={produto.id}
                className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{produto.descricao}</p>
                  <p className="text-[12px] text-[var(--ink-faint)]">
                    {produto.codigoFiscal} · {produto.regraFiscalNome}
                  </p>
                </div>
                <FormularioComFeedback action={reativarProduto}>
                  <input type="hidden" name="produtoId" value={produto.id} />
                  <PrimaryButton
                    type="submit"
                    pendingText="Reativando…"
                    className="w-full sm:w-auto"
                  >
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
