"use client";

import { useMemo, useState } from "react";
import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import { calcularFaturavel, validarDistribuicaoTotal } from "@/lib/calculos";
import { processarDistribuicao } from "./actions";
import { dataOperacionalBrasil } from "@/lib/datas";

type Cliente = {
  id: string;
  nome: string;
  prontoParaEmissao: boolean;
  emitentes: { id: string; nome: string }[];
};
type Produto = { id: string; descricao: string; precoPadrao: string; unidade: string };

type Linha = {
  clienteId: string;
  emitenteId: string;
  quantidadeDistribuida: string;
  quantidadeTroca: string;
  precoUnitario: string;
  trocaAberta: boolean;
};

type ProdutoNaDistribuicao = {
  produtoId: string;
  quantidadeTotal: string;
  linhas: Linha[]; // uma por destino fiscal (par cliente + emitente)
};

type DestinoFiscal = {
  clienteId: string;
  emitenteId: string;
};

type UltimaDistribuicao = {
  loteId: string;
  numero: number | null;
  produtos: {
    produtoId: string;
    quantidadeTotal: string;
    linhas: {
      clienteId: string;
      emitenteId: string;
      quantidadeDistribuida: string;
      quantidadeTroca: string;
      precoUnitario: string;
    }[];
  }[];
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function DistribuicaoForm({
  clientes,
  produtos,
  precos,
  ultimaDistribuicao,
}: {
  clientes: Cliente[];
  produtos: Produto[];
  precos: Record<string, string>;
  ultimaDistribuicao: UltimaDistribuicao | null;
}) {
  const [data, setData] = useState(() => dataOperacionalBrasil());
  const [chaveIdempotencia, setChaveIdempotencia] = useState(() => crypto.randomUUID());
  const [resultado, setResultado] = useState<{ loteId: string; numero: number | null; tarefas: number } | null>(null);
  const [destinos, setDestinos] = useState<DestinoFiscal[]>([]);
  const [produtosDistribuicao, setProdutosDistribuicao] = useState<ProdutoNaDistribuicao[]>([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState("");
  const [status, setStatus] = useState<{ tipo: "ok" | "erro" | "aviso"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const produtosDisponiveisParaAdicionar = produtos.filter(
    (p) => !produtosDistribuicao.some((pd) => pd.produtoId === p.id)
  );
  const mercadosSelecionados = useMemo(
    () => new Set(destinos.map((destino) => destino.clienteId)),
    [destinos]
  );

  function precoInicial(produtoId: string, clienteId: string, precoPadrao: string): string {
    return precos[`${produtoId}:${clienteId}`] ?? precoPadrao;
  }

  function chaveDestino(destino: DestinoFiscal) {
    return `${destino.clienteId}:${destino.emitenteId}`;
  }

  function adicionarDestino(clienteId: string, emitenteId?: string) {
    const cliente = clientes.find((item) => item.id === clienteId);
    const escolhido = emitenteId ?? cliente?.emitentes.find(
      (emitente) => !destinos.some(
        (destino) => destino.clienteId === clienteId && destino.emitenteId === emitente.id
      )
    )?.id;
    if (!cliente?.prontoParaEmissao || !escolhido) return;
    const destino = { clienteId, emitenteId: escolhido };
    if (destinos.some((item) => chaveDestino(item) === chaveDestino(destino))) return;
    setDestinos((atual) => [...atual, destino]);
    setProdutosDistribuicao((atual) => atual.map((produto) => ({
      ...produto,
      linhas: [...produto.linhas, criarLinha(produto.produtoId, destino)],
    })));
  }

  function alternarMercado(clienteId: string) {
    const cliente = clientes.find((item) => item.id === clienteId);
    if (!cliente?.prontoParaEmissao) return;
    if (mercadosSelecionados.has(clienteId)) {
      setDestinos((atual) => atual.filter((destino) => destino.clienteId !== clienteId));
      setProdutosDistribuicao((atual) => atual.map((produto) => ({
        ...produto,
        linhas: produto.linhas.filter((linha) => linha.clienteId !== clienteId),
      })));
      return;
    }
    adicionarDestino(clienteId, cliente.emitentes[0]?.id);
  }

  function removerDestino(destino: DestinoFiscal) {
    const chave = chaveDestino(destino);
    setDestinos((atual) => atual.filter((item) => chaveDestino(item) !== chave));
    setProdutosDistribuicao((atual) => atual.map((produto) => ({
      ...produto,
      linhas: produto.linhas.filter((linha) => chaveDestino(linha) !== chave),
    })));
  }

  function criarLinha(produtoId: string, destino: DestinoFiscal): Linha {
    const produto = produtos.find((item) => item.id === produtoId)!;
    return {
      ...destino,
      quantidadeDistribuida: "",
      quantidadeTroca: "0",
      precoUnitario: precoInicial(produtoId, destino.clienteId, produto.precoPadrao),
      trocaAberta: false,
    };
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
        linhas: destinos.map((destino) => criarLinha(produto.id, destino)),
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

  function atualizarLinha(produtoId: string, destino: DestinoFiscal, campo: keyof Linha, valor: string | boolean) {
    const chave = chaveDestino(destino);
    setProdutosDistribuicao((atual) =>
      atual.map((p) =>
        p.produtoId !== produtoId
          ? p
          : {
              ...p,
              linhas: p.linhas.map((l) =>
                chaveDestino(l) === chave ? { ...l, [campo]: valor } : l
              ),
            }
      )
    );
  }

  function ajustarQuantidade(produtoId: string, destino: DestinoFiscal, delta: number) {
    const chave = chaveDestino(destino);
    setProdutosDistribuicao((atual) =>
      atual.map((p) =>
        p.produtoId !== produtoId
          ? p
          : {
              ...p,
              linhas: p.linhas.map((l) => {
                if (chaveDestino(l) !== chave) return l;
                const atual2 = Number(l.quantidadeDistribuida || 0);
                return { ...l, quantidadeDistribuida: String(Math.max(0, atual2 + delta)) };
              }),
            }
      )
    );
  }

  function repetirUltimaDistribuicao() {
    if (!ultimaDistribuicao) return;

    const clientesAtuais = new Map(clientes.map((cliente) => [cliente.id, cliente]));
    const produtosAtuais = new Map(produtos.map((produto) => [produto.id, produto]));
    const destinosValidos = new Map<string, DestinoFiscal>();

    for (const produtoAnterior of ultimaDistribuicao.produtos) {
      for (const linhaAnterior of produtoAnterior.linhas) {
        const cliente = clientesAtuais.get(linhaAnterior.clienteId);
        if (
          cliente?.prontoParaEmissao
          && cliente.emitentes.some((emitente) => emitente.id === linhaAnterior.emitenteId)
        ) {
          const destino = { clienteId: cliente.id, emitenteId: linhaAnterior.emitenteId };
          destinosValidos.set(chaveDestino(destino), destino);
        }
      }
    }

    const destinosRepetidos = [...destinosValidos.values()];
    const produtosRepetidos = ultimaDistribuicao.produtos.flatMap((produtoAnterior) => {
      const produtoAtual = produtosAtuais.get(produtoAnterior.produtoId);
      if (!produtoAtual) return [];

      const linhasAnteriores = new Map(
        produtoAnterior.linhas
          .filter((linha) => destinosValidos.has(chaveDestino(linha)))
          .map((linha) => [chaveDestino(linha), linha]),
      );
      if (linhasAnteriores.size === 0) return [];

      return [{
        produtoId: produtoAnterior.produtoId,
        quantidadeTotal: produtoAnterior.quantidadeTotal,
        linhas: destinosRepetidos.map((destino) => {
          const cliente = clientesAtuais.get(destino.clienteId)!;
          const anterior = linhasAnteriores.get(chaveDestino(destino));
          return {
            ...destino,
            quantidadeDistribuida: anterior?.quantidadeDistribuida ?? "",
            quantidadeTroca: anterior?.quantidadeTroca ?? "0",
            precoUnitario: anterior?.precoUnitario
              ?? precoInicial(produtoAnterior.produtoId, cliente.id, produtoAtual.precoPadrao),
            trocaAberta: Number(anterior?.quantidadeTroca ?? 0) > 0,
          };
        }),
      }];
    });

    if (produtosRepetidos.length === 0 || destinosRepetidos.length === 0) {
      setStatus({
        tipo: "erro",
        texto: "A última distribuição não possui mais clientes, produtos e emitentes ativos para repetir.",
      });
      return;
    }

    setData(dataOperacionalBrasil());
    setDestinos(destinosRepetidos);
    setProdutosDistribuicao(produtosRepetidos);
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("");
    setResultado(null);
    setChaveIdempotencia(crypto.randomUUID());
    setStatus({
      tipo: "aviso",
      texto: "Rascunho preenchido com a última distribuição. Confira as quantidades, trocas, preços e emitentes antes de processar.",
    });
  }

  // Preview por produto, considerando cada par mercado + emitente selecionado.
  const previewPorProduto = useMemo(() => {
    return produtosDistribuicao.map((p) => {
      const linhasAtivas = p.linhas;
      const resultados = linhasAtivas.map((l) => {
        const distribuida = Number(l.quantidadeDistribuida || 0);
        const troca = Number(l.quantidadeTroca || 0);
        const preco = Number(l.precoUnitario || 0);
        try {
          const r = calcularFaturavel({
            clienteId: l.clienteId,
            emitenteId: l.emitenteId,
            quantidadeDistribuida: distribuida,
            quantidadeTroca: troca,
            precoUnitario: preco,
          });
          return { ...r, erro: null as string | null };
        } catch (e) {
          return {
            clienteId: l.clienteId,
            emitenteId: l.emitenteId,
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
  }, [produtosDistribuicao]);

  const totalGeral = previewPorProduto.reduce((s, p) => s + p.subtotalProduto, 0);
  const temErro = previewPorProduto.some(
    (p) => p.resultados.some((r) => r.erro) || !p.validacao.valido
  );
  const algumaLinhaPreenchida = previewPorProduto.some((p) =>
    p.resultados.some((r) => r.quantidadeDistribuida > 0)
  );
  const podeEnviar = produtosDistribuicao.length > 0 && destinos.length > 0 && algumaLinhaPreenchida && !temErro && !enviando;

  async function handleSubmit() {
    setEnviando(true);
    setStatus(null);
    setResultado(null);
    try {
      const processado = await processarDistribuicao({
        chaveIdempotencia,
        data,
        produtos: produtosDistribuicao.map((p) => ({
          produtoId: p.produtoId,
          quantidadeTotal: Number(p.quantidadeTotal || 0),
          linhas: p.linhas.map((l) => ({
              clienteId: l.clienteId,
              emitenteId: l.emitenteId,
              quantidadeDistribuida: Number(l.quantidadeDistribuida || 0),
              quantidadeTroca: Number(l.quantidadeTroca || 0),
              precoUnitario: Number(l.precoUnitario || 0),
            })),
        })),
      });
      setStatus({ tipo: "ok", texto: processado.reutilizada ? "Esta distribuição já havia sido registrada — nenhum dado foi duplicado." : "Distribuição registrada com segurança." });
      setResultado({ loteId: processado.loteId, numero: processado.numeroDistribuicao, tarefas: processado.tarefasCriadas });
      setProdutosDistribuicao([]);
      setChaveIdempotencia(crypto.randomUUID());
    } catch (e) {
      setStatus({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao processar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pb-28 md:pb-6">
      {ultimaDistribuicao && (
        <Card className="mt-5 border-[var(--field)] bg-[var(--field-tint)] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--field-strong)]">
            Atalho do dia
          </p>
          <button
            type="button"
            onClick={repetirUltimaDistribuicao}
            aria-describedby="repetir-distribuicao-ajuda"
            className="tap-target mt-2 flex w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--field)] px-4 py-3 text-center text-sm font-semibold text-white shadow-sm active:translate-y-px"
          >
            Repetir distribuição {ultimaDistribuicao.numero
              ? String(ultimaDistribuicao.numero).padStart(6, "0")
              : "anterior"}
          </button>
          <p id="repetir-distribuicao-ajuda" className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
            Preenche o formulário para edição com os mesmos clientes e produtos. Nada é enviado automaticamente.
          </p>
        </Card>
      )}

      {/* Data + destinos fiscais participantes desta distribuição */}
      <Card className={`${ultimaDistribuicao ? "mt-4" : "mt-5"} p-4`}>
        <Label>Data</Label>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full max-w-[180px]"
        />

        <div className="mt-4">
          <Label>Mercados participantes</Label>
          <div className="flex flex-wrap gap-2">
            {clientes.map((cliente) => {
              const selecionado = mercadosSelecionados.has(cliente.id);
              return (
                <button
                  key={cliente.id}
                  type="button"
                  onClick={() => alternarMercado(cliente.id)}
                  aria-pressed={selecionado}
                  disabled={!cliente.prontoParaEmissao}
                  title={cliente.prontoParaEmissao ? undefined : "Complete o cadastro fiscal deste mercado"}
                  className={`tap-target rounded-full border px-3 py-1.5 text-sm ${
                    !cliente.prontoParaEmissao
                      ? "cursor-not-allowed border-[var(--line)] text-[var(--ink-faint)] opacity-50"
                      : selecionado
                        ? "border-[var(--field)] bg-[var(--field-tint)] text-[var(--field-strong)]"
                        : "border-[var(--line-strong)] text-[var(--ink-faint)]"
                  }`}
                >
                  {selecionado ? "✓ " : ""}{cliente.nome}{cliente.prontoParaEmissao ? "" : " · completar"}
                </button>
              );
            })}
          </div>
          {destinos.length === 0 && (
            <p className="mt-2 text-[12px] text-[var(--ink-soft)]">Selecione ao menos um mercado para começar.</p>
          )}
        </div>

        {destinos.length > 0 && (
        <div className="mt-4">
          <Label>Emitentes por mercado</Label>
          <p className="mb-3 text-[12px] leading-5 text-[var(--ink-soft)]">
            Cada combinação gera uma nota. Um mesmo mercado pode receber notas de vários emitentes.
          </p>
          <div className="space-y-3">
            {clientes.filter((cliente) => mercadosSelecionados.has(cliente.id)).map((cliente) => {
              const destinosDoCliente = destinos.filter((destino) => destino.clienteId === cliente.id);
              const emitentesDisponiveis = cliente.emitentes.filter(
                (emitente) => !destinosDoCliente.some((destino) => destino.emitenteId === emitente.id)
              );
              return (
                <div
                  key={cliente.id}
                  className={`rounded-[var(--radius-control)] border p-3 ${
                    cliente.prontoParaEmissao ? "border-[var(--line)]" : "border-[var(--line)] opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{cliente.nome}</span>
                    {!cliente.prontoParaEmissao && (
                      <span className="text-[11px] text-[var(--stamp)]">Completar cadastro</span>
                    )}
                  </div>
                  {destinosDoCliente.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {destinosDoCliente.map((destino) => {
                        const emitente = cliente.emitentes.find((item) => item.id === destino.emitenteId);
                        return (
                          <span
                            key={chaveDestino(destino)}
                            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--field)] bg-[var(--field-tint)] py-1 pl-3 pr-1 text-[13px] text-[var(--field-strong)]"
                          >
                            {emitente?.nome}
                            <button
                              type="button"
                              onClick={() => removerDestino(destino)}
                              aria-label={`Remover ${emitente?.nome} de ${cliente.nome}`}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-base active:bg-white/70"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {cliente.prontoParaEmissao && emitentesDisponiveis.length > 0 && (
                    <select
                      value=""
                      onChange={(event) => {
                        adicionarDestino(cliente.id, event.target.value);
                        event.currentTarget.value = "";
                      }}
                      className="mt-2 w-full"
                      aria-label={`Adicionar emitente para ${cliente.nome}`}
                    >
                      <option value="">+ Adicionar outro emitente...</option>
                      {emitentesDisponiveis.map((emitente) => (
                        <option key={emitente.id} value={emitente.id}>{emitente.nome}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {clientes.some((cliente) => !cliente.prontoParaEmissao) && (
          <p className="mt-3 text-[12px] leading-5 text-[var(--ink-soft)]">
            Mercados esmaecidos precisam de CNPJ, IE/CEP/endereço e emitente integrado.{" "}
            <a href="/clientes" className="font-medium text-[var(--field-strong)] underline underline-offset-2">
              Completar cadastros
            </a>
          </p>
        )}

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
            disabled={destinos.length === 0 || !produtoParaAdicionar || !quantidadeParaAdicionar}
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
                {p.linhas.map((linha) => {
                    const cliente = clientes.find((c) => c.id === linha.clienteId)!;
                    const emitente = cliente.emitentes.find((item) => item.id === linha.emitenteId)!;
                    const resultado = preview.resultados.find(
                      (r) => r.clienteId === linha.clienteId && r.emitenteId === linha.emitenteId
                    )!;
                    const preenchido = Number(linha.quantidadeDistribuida || 0) > 0;

                    return (
                      <div
                        key={chaveDestino(linha)}
                        className={`rounded-[var(--radius-control)] border p-2.5 ${
                          preenchido ? "border-[var(--field)]" : "border-[var(--line)]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm">{cliente.nome} — {emitente.nome}</span>
                          {preenchido && !resultado.erro && (
                            <span className="font-mono-tab text-[13px] text-[var(--wheat)]">
                              {moeda.format(resultado.subtotal)}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => ajustarQuantidade(p.produtoId, linha, -1)}
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
                              atualizarLinha(p.produtoId, linha, "quantidadeDistribuida", e.target.value)
                            }
                            placeholder="0"
                            className="font-mono-tab h-10! min-h-0! w-full text-center"
                          />
                          <button
                            type="button"
                            onClick={() => ajustarQuantidade(p.produtoId, linha, 1)}
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
                              onClick={() => atualizarLinha(p.produtoId, linha, "trocaAberta", true)}
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
                                  atualizarLinha(p.produtoId, linha, "quantidadeTroca", e.target.value)
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
                                atualizarLinha(p.produtoId, linha, "precoUnitario", e.target.value)
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
          role={status.tipo === "erro" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-4 rounded-[var(--radius-control)] px-4 py-2.5 text-sm ${
            status.tipo === "ok"
              ? "bg-[var(--field-tint)] text-[var(--field-strong)]"
              : status.tipo === "aviso"
                ? "border border-[var(--wheat)] bg-[var(--cream)] text-[var(--ink)]"
                : "bg-[var(--stamp-tint)] text-[var(--stamp)]"
          }`}
        >
          {status.texto}
        </p>
      )}

      {resultado && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <a href="/tarefas" className="tap-target flex items-center justify-center rounded-[var(--radius-control)] border border-[var(--field)] px-3 text-center font-medium text-[var(--field-strong)]">Acompanhar {resultado.tarefas} tarefa(s)</a>
          <a href={`/entregas?lote=${encodeURIComponent(resultado.loteId)}`} className="tap-target flex items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 text-center">Abrir roteiro {resultado.numero ? `000${resultado.numero}`.slice(-6) : ""}</a>
        </div>
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
