"use client";

import { useMemo, useState } from "react";
import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import { calcularFaturavel, validarDistribuicaoTotal } from "@/lib/calculos";
import { processarDistribuicao } from "./actions";

type Cliente = { id: string; nome: string };
type Produto = { id: string; descricao: string; precoPadrao: string; unidade: string };

type Linha = {
  clienteId: string;
  quantidadeDistribuida: string;
  quantidadeTroca: string;
  precoUnitario: string;
  trocaAberta: boolean;
};

type ProdutoNaDistribuicao = {
  produtoId: string;
  quantidadeTotal: string;
  linhas: Linha[]; // uma por cliente cadastrado (só exibida se o cliente estiver selecionado)
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function DistribuicaoForm({
  clientes,
  produtos,
  precos,
}: {
  clientes: Cliente[];
  produtos: Produto[];
  precos: Record<string, string>;
}) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientesSelecionados, setClientesSelecionados] = useState<Set<string>>(
    () => new Set(clientes.map((c) => c.id))
  );
  const [produtosDistribuicao, setProdutosDistribuicao] = useState<ProdutoNaDistribuicao[]>([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState("");
  const [status, setStatus] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const produtosDisponiveisParaAdicionar = produtos.filter(
    (p) => !produtosDistribuicao.some((pd) => pd.produtoId === p.id)
  );

  function precoInicial(produtoId: string, clienteId: string, precoPadrao: string): string {
    return precos[`${produtoId}:${clienteId}`] ?? precoPadrao;
  }

  function alternarCliente(clienteId: string) {
    setClientesSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(clienteId)) novo.delete(clienteId);
      else novo.add(clienteId);
      return novo;
    });
  }

  function adicionarProduto() {
    if (!produtoParaAdicionar || !quantidadeParaAdicionar) return;
    const produto = produtos.find((p) => p.id === produtoParaAdicionar);
    if (!produto) return;

    setProdutosDistribuicao((atual) => [
      ...atual,
      {
        produtoId: produto.id,
        quantidadeTotal: quantidadeParaAdicionar,
        linhas: clientes.map((c) => ({
          clienteId: c.id,
          quantidadeDistribuida: "",
          quantidadeTroca: "0",
          precoUnitario: precoInicial(produto.id, c.id, produto.precoPadrao),
          trocaAberta: false,
        })),
      },
    ]);
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("");
  }

  function removerProduto(produtoId: string) {
    setProdutosDistribuicao((atual) => atual.filter((p) => p.produtoId !== produtoId));
  }

  function atualizarQuantidadeTotal(produtoId: string, valor: string) {
    setProdutosDistribuicao((atual) =>
      atual.map((p) => (p.produtoId === produtoId ? { ...p, quantidadeTotal: valor } : p))
    );
  }

  function atualizarLinha(produtoId: string, clienteId: string, campo: keyof Linha, valor: string | boolean) {
    setProdutosDistribuicao((atual) =>
      atual.map((p) =>
        p.produtoId !== produtoId
          ? p
          : {
              ...p,
              linhas: p.linhas.map((l) =>
                l.clienteId === clienteId ? { ...l, [campo]: valor } : l
              ),
            }
      )
    );
  }

  function ajustarQuantidade(produtoId: string, clienteId: string, delta: number) {
    setProdutosDistribuicao((atual) =>
      atual.map((p) =>
        p.produtoId !== produtoId
          ? p
          : {
              ...p,
              linhas: p.linhas.map((l) => {
                if (l.clienteId !== clienteId) return l;
                const atual2 = Number(l.quantidadeDistribuida || 0);
                return { ...l, quantidadeDistribuida: String(Math.max(0, atual2 + delta)) };
              }),
            }
      )
    );
  }

  // Preview calculado por produto, considerando só os clientes selecionados
  const previewPorProduto = useMemo(() => {
    return produtosDistribuicao.map((p) => {
      const linhasAtivas = p.linhas.filter((l) => clientesSelecionados.has(l.clienteId));
      const resultados = linhasAtivas.map((l) => {
        const distribuida = Number(l.quantidadeDistribuida || 0);
        const troca = Number(l.quantidadeTroca || 0);
        const preco = Number(l.precoUnitario || 0);
        try {
          const r = calcularFaturavel({
            clienteId: l.clienteId,
            quantidadeDistribuida: distribuida,
            quantidadeTroca: troca,
            precoUnitario: preco,
          });
          return { ...r, erro: null as string | null };
        } catch (e) {
          return {
            clienteId: l.clienteId,
            quantidadeDistribuida: distribuida,
            quantidadeTroca: troca,
            precoUnitario: preco,
            quantidadeFaturavel: 0,
            subtotal: 0,
            erro: e instanceof Error ? e.message : "Erro",
          };
        }
      });

      const validacao = validarDistribuicaoTotal(
        Number(p.quantidadeTotal || 0),
        linhasAtivas.map((l) => ({
          clienteId: l.clienteId,
          quantidadeDistribuida: Number(l.quantidadeDistribuida || 0),
          quantidadeTroca: Number(l.quantidadeTroca || 0),
          precoUnitario: Number(l.precoUnitario || 0),
        }))
      );

      const subtotalProduto = resultados.reduce((s, r) => s + r.subtotal, 0);

      return { produtoId: p.produtoId, resultados, validacao, subtotalProduto };
    });
  }, [produtosDistribuicao, clientesSelecionados]);

  const totalGeral = previewPorProduto.reduce((s, p) => s + p.subtotalProduto, 0);
  const temErro = previewPorProduto.some(
    (p) => p.resultados.some((r) => r.erro) || !p.validacao.valido
  );
  const algumaLinhaPreenchida = previewPorProduto.some((p) =>
    p.resultados.some((r) => r.quantidadeDistribuida > 0)
  );
  const podeEnviar = produtosDistribuicao.length > 0 && algumaLinhaPreenchida && !temErro && !enviando;

  async function handleSubmit() {
    setEnviando(true);
    setStatus(null);
    try {
      await processarDistribuicao({
        data,
        produtos: produtosDistribuicao.map((p) => ({
          produtoId: p.produtoId,
          quantidadeTotal: Number(p.quantidadeTotal || 0),
          linhas: p.linhas
            .filter((l) => clientesSelecionados.has(l.clienteId))
            .map((l) => ({
              clienteId: l.clienteId,
              quantidadeDistribuida: Number(l.quantidadeDistribuida || 0),
              quantidadeTroca: Number(l.quantidadeTroca || 0),
              precoUnitario: Number(l.precoUnitario || 0),
            })),
        })),
      });
      setStatus({ tipo: "ok", texto: "Distribuição registrada. Tarefas geradas." });
      setProdutosDistribuicao([]);
    } catch (e) {
      setStatus({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao processar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pb-28 md:pb-6">
      {/* Data + clientes participantes desta distribuição */}
      <Card className="mt-5 p-4">
        <Label>Data</Label>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full max-w-[180px]"
        />

        <div className="mt-4">
          <Label>Clientes participantes</Label>
          <div className="flex flex-wrap gap-2">
            {clientes.map((c) => {
              const ativo = clientesSelecionados.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => alternarCliente(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    ativo
                      ? "border-[var(--field)] bg-[var(--field-tint)] text-[var(--field-strong)]"
                      : "border-[var(--line-strong)] text-[var(--ink-faint)]"
                  }`}
                >
                  {c.nome}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Adicionar produto */}
      <Card className="mt-4 p-4">
        <Label>Adicionar produto</Label>
        <div className="flex gap-2">
          <select
            value={produtoParaAdicionar}
            onChange={(e) => setProdutoParaAdicionar(e.target.value)}
            className="flex-1"
          >
            <option value="">Selecionar produto...</option>
            {produtosDisponiveisParaAdicionar.map((p) => (
              <option key={p.id} value={p.id}>
                {p.descricao}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            value={quantidadeParaAdicionar}
            onChange={(e) => setQuantidadeParaAdicionar(e.target.value)}
            placeholder="Qtd. total"
            className="font-mono-tab w-28"
          />
          <button
            type="button"
            onClick={adicionarProduto}
            disabled={!produtoParaAdicionar || !quantidadeParaAdicionar}
            className="rounded-[var(--radius-control)] border border-[var(--field)] px-4 text-sm font-medium text-[var(--field-strong)] active:bg-[var(--field-tint)] disabled:opacity-30"
          >
            + Adicionar
          </button>
        </div>
      </Card>

      {/* Produtos adicionados, cada um com distribuição por cliente */}
      <div className="mt-4 space-y-4">
        {produtosDistribuicao.map((p) => {
          const produto = produtos.find((pr) => pr.id === p.produtoId)!;
          const preview = previewPorProduto.find((pv) => pv.produtoId === p.produtoId)!;

          return (
            <Card key={p.produtoId} className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{produto.descricao}</p>
                <button
                  type="button"
                  onClick={() => removerProduto(p.produtoId)}
                  className="text-[13px] text-[var(--stamp)]"
                >
                  Remover
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[13px] text-[var(--ink-soft)]">
                <span>Total disponível:</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={p.quantidadeTotal}
                  onChange={(e) => atualizarQuantidadeTotal(p.produtoId, e.target.value)}
                  className="font-mono-tab h-9! min-h-0! w-24 text-right"
                />
                <span>{produto.unidade}</span>
                <span className="ml-auto">
                  Distribuído: {preview.validacao.totalDistribuido} · Sobra:{" "}
                  <span className={preview.validacao.valido ? "" : "text-[var(--stamp)]"}>
                    {preview.validacao.sobra}
                  </span>
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {p.linhas
                  .filter((l) => clientesSelecionados.has(l.clienteId))
                  .map((linha) => {
                    const cliente = clientes.find((c) => c.id === linha.clienteId)!;
                    const resultado = preview.resultados.find((r) => r.clienteId === linha.clienteId)!;
                    const preenchido = Number(linha.quantidadeDistribuida || 0) > 0;

                    return (
                      <div
                        key={linha.clienteId}
                        className={`rounded-[var(--radius-control)] border p-2.5 ${
                          preenchido ? "border-[var(--field)]" : "border-[var(--line)]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm">{cliente.nome}</span>
                          {preenchido && !resultado.erro && (
                            <span className="font-mono-tab text-[13px] text-[var(--wheat)]">
                              {moeda.format(resultado.subtotal)}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => ajustarQuantidade(p.produtoId, linha.clienteId, -1)}
                            aria-label="Diminuir"
                            className="w-9 shrink-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] text-[var(--ink-soft)] active:bg-[var(--field-tint)]"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={linha.quantidadeDistribuida}
                            onChange={(e) =>
                              atualizarLinha(p.produtoId, linha.clienteId, "quantidadeDistribuida", e.target.value)
                            }
                            placeholder="0"
                            className="font-mono-tab h-10! min-h-0! w-full text-center"
                          />
                          <button
                            type="button"
                            onClick={() => ajustarQuantidade(p.produtoId, linha.clienteId, 1)}
                            aria-label="Aumentar"
                            className="w-9 shrink-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] text-[var(--ink-soft)] active:bg-[var(--field-tint)]"
                          >
                            +
                          </button>
                        </div>

                        <div className="mt-1.5 flex items-center justify-between text-[12px]">
                          {!linha.trocaAberta ? (
                            <button
                              type="button"
                              onClick={() => atualizarLinha(p.produtoId, linha.clienteId, "trocaAberta", true)}
                              className="text-[var(--ink-faint)] underline decoration-dotted underline-offset-2"
                            >
                              + troca?
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[var(--ink-soft)]">Troca:</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={linha.quantidadeTroca}
                                onChange={(e) =>
                                  atualizarLinha(p.produtoId, linha.clienteId, "quantidadeTroca", e.target.value)
                                }
                                className="font-mono-tab h-8! min-h-0! w-16 text-right text-[12px]"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--ink-soft)]">R$/un:</span>
                            <input
                              type="number"
                              step="0.01"
                              inputMode="decimal"
                              value={linha.precoUnitario}
                              onChange={(e) =>
                                atualizarLinha(p.produtoId, linha.clienteId, "precoUnitario", e.target.value)
                              }
                              className="font-mono-tab h-8! min-h-0! w-20 text-right text-[12px]"
                            />
                          </div>
                        </div>
                        {resultado.erro && (
                          <p className="mt-1 text-[12px] text-[var(--stamp)]">{resultado.erro}</p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </Card>
          );
        })}

        {produtosDistribuicao.length === 0 && (
          <p className="px-1 text-[13px] text-[var(--ink-faint)]">
            Nenhum produto adicionado ainda — use o campo acima.
          </p>
        )}
      </div>

      {status && (
        <p
          className={`mt-4 rounded-[var(--radius-control)] px-4 py-2.5 text-sm ${
            status.tipo === "ok"
              ? "bg-[var(--field-tint)] text-[var(--field-strong)]"
              : "bg-[var(--stamp-tint)] text-[var(--stamp)]"
          }`}
        >
          {status.texto}
        </p>
      )}

      {/* Barra de ação fixa */}
      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-[var(--line)] bg-[var(--paper)]/95 px-4 py-3 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="text-[13px] text-[var(--ink-soft)]">
            Total:{" "}
            <span className="font-mono-tab font-semibold text-[var(--ink)]">
              {moeda.format(totalGeral)}
            </span>
          </div>
          <PrimaryButton onClick={handleSubmit} disabled={!podeEnviar} className="px-6 py-2.5">
            {enviando ? "Processando…" : "Processar distribuição"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
