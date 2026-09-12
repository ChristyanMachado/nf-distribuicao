"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mensagemConfirmacaoDistribuicao } from "@/lib/confirmacao-distribuicao";
import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import { calcularFaturavel, validarDisponibilidadePreview } from "@/lib/calculos";
import { processarDistribuicao } from "./actions";
import { lerRascunhoLocal, gravarRascunhoLocal } from "@/lib/armazenamento-rascunho";
import { dataOperacionalBrasil } from "@/lib/datas";
import {
  chaveDestino,
  chaveRascunhoDistribuicao,
  filtrarProdutosParaBusca,
  restaurarRascunhoDistribuicao,
  temConteudoRascunho,
  type DestinoRascunho,
  type LinhaRascunho,
  type ProdutoRascunho,
} from "@/lib/rascunho-distribuicao";

type Cliente = {
  id: string;
  nome: string;
  prontoParaEmissao: boolean;
  emitentes: { id: string; nome: string }[];
};
type Produto = { id: string; descricao: string; precoPadrao: string; unidade: string };

type Linha = LinhaRascunho;
type ProdutoNaDistribuicao = ProdutoRascunho;
type DestinoFiscal = DestinoRascunho;

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
      precoPromocional: boolean;
    }[];
  }[];
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function DistribuicaoForm({
  clientes,
  produtos,
  precos,
  trocasDisponiveis,
  ultimaDistribuicao,
  escopoRascunho,
}: {
  clientes: Cliente[];
  produtos: Produto[];
  precos: Record<string, string>;
  trocasDisponiveis: Record<string, string>;
  ultimaDistribuicao: UltimaDistribuicao | null;
  escopoRascunho: string;
}) {
  const [data, setData] = useState(() => dataOperacionalBrasil());
  const [chaveIdempotencia, setChaveIdempotencia] = useState(() => crypto.randomUUID());
  const [resultado, setResultado] = useState<{ loteId: string; numero: number | null; tarefas: number } | null>(null);
  const [destinos, setDestinos] = useState<DestinoFiscal[]>([]);
  const [produtosDistribuicao, setProdutosDistribuicao] = useState<ProdutoNaDistribuicao[]>([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [seletorProdutoAberto, setSeletorProdutoAberto] = useState(false);
  const [indiceProdutoAtivo, setIndiceProdutoAtivo] = useState(0);
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState("");
  const [status, setStatus] = useState<{ tipo: "ok" | "erro" | "aviso"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [rascunhoCarregado, setRascunhoCarregado] = useState(false);
  const [falhaRascunho, setFalhaRascunho] = useState(false);
  const [sobrasConfirmadas, setSobrasConfirmadas] = useState("");
  const tituloResultado = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!resultado) return;
    tituloResultado.current?.focus({ preventScroll: true });
    tituloResultado.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [resultado]);

  const produtosDisponiveisParaAdicionar = useMemo(
    () => produtos.filter((p) => !produtosDistribuicao.some((pd) => pd.produtoId === p.id)),
    [produtos, produtosDistribuicao],
  );
  const produtosFiltrados = useMemo(
    () => filtrarProdutosParaBusca(produtosDisponiveisParaAdicionar, buscaProduto),
    [produtosDisponiveisParaAdicionar, buscaProduto],
  );
  const mercadosSelecionados = useMemo(
    () => new Set(destinos.map((destino) => destino.clienteId)),
    [destinos]
  );
  const chaveRascunho = useMemo(
    () => chaveRascunhoDistribuicao(escopoRascunho),
    [escopoRascunho],
  );
  const assinaturaCatalogo = useMemo(
    () => [
      produtos.map((produto) => produto.id).sort().join(","),
      clientes.flatMap((cliente) => cliente.emitentes.map((emitente) => `${cliente.id}:${emitente.id}`)).sort().join(","),
    ].join("|"),
    [clientes, produtos],
  );

  useEffect(() => {
    const leitura = lerRascunhoLocal(chaveRascunho);
    setFalhaRascunho(!leitura.ok);
    const rascunho = restaurarRascunhoDistribuicao(
      leitura.valor,
      {
        produtoIds: produtos.map((produto) => produto.id),
        destinosPermitidos: clientes.flatMap((cliente) =>
          cliente.prontoParaEmissao
            ? cliente.emitentes.map((emitente) => ({ clienteId: cliente.id, emitenteId: emitente.id }))
            : [],
        ),
      },
    );
    if (rascunho) {
      setData(rascunho.data);
      setChaveIdempotencia(rascunho.chaveIdempotencia);
      setDestinos(rascunho.destinos);
      setProdutosDistribuicao(rascunho.produtos);
      setStatus({
        tipo: "aviso",
        texto: "Rascunho restaurado. Confira os dados antes de processar a distribuição.",
      });
    }
    setRascunhoCarregado(true);
  }, [assinaturaCatalogo, chaveRascunho, clientes, produtos]);

  useEffect(() => {
    if (!rascunhoCarregado || resultado) return;
    const rascunho = {
      versao: 1 as const,
      data,
      chaveIdempotencia,
      destinos,
      produtos: produtosDistribuicao,
    };
    if (temConteudoRascunho(rascunho)) {
      setFalhaRascunho(!gravarRascunhoLocal(chaveRascunho, JSON.stringify(rascunho)));
    } else {
      setFalhaRascunho(!gravarRascunhoLocal(chaveRascunho, null));
    }
  }, [chaveIdempotencia, chaveRascunho, data, destinos, produtosDistribuicao, rascunhoCarregado, resultado]);

  function precoInicial(produtoId: string, clienteId: string, precoPadrao: string): string {
    return precos[`${produtoId}:${clienteId}`] ?? precoPadrao;
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
      precoPromocional: false,
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
    setBuscaProduto("");
    setQuantidadeParaAdicionar("");
  }

  function selecionarProduto(produto: Produto) {
    setProdutoParaAdicionar(produto.id);
    setBuscaProduto(produto.descricao);
    setSeletorProdutoAberto(false);
  }

  function iniciarNovaDistribuicao() {
    setFalhaRascunho(!gravarRascunhoLocal(chaveRascunho, null));
    setData(dataOperacionalBrasil());
    setChaveIdempotencia(crypto.randomUUID());
    setResultado(null);
    setDestinos([]);
    setProdutosDistribuicao([]);
    setProdutoParaAdicionar("");
    setBuscaProduto("");
    setQuantidadeParaAdicionar("");
    setStatus(null);
  }

  function descartarRascunho() {
    setFalhaRascunho(!gravarRascunhoLocal(chaveRascunho, null));
    setData(dataOperacionalBrasil());
    setDestinos([]);
    setProdutosDistribuicao([]);
    setProdutoParaAdicionar("");
    setBuscaProduto("");
    setQuantidadeParaAdicionar("");
    setChaveIdempotencia(crypto.randomUUID());
    setResultado(null);
    setStatus({ tipo: "aviso", texto: "Rascunho descartado. Nenhuma distribuição foi enviada." });
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
    const produto = produtos.find((item) => item.id === produtoId);
    const precoReferencia = produto
      ? Number(precoInicial(produtoId, destino.clienteId, produto.precoPadrao))
      : null;
    setProdutosDistribuicao((atual) =>
      atual.map((p) =>
        p.produtoId !== produtoId
          ? p
          : {
              ...p,
              linhas: p.linhas.map((l) => {
                if (chaveDestino(l) !== chave) return l;
                const proxima = { ...l, [campo]: valor };
                // Ao voltar ao preço de referência, não manter uma promoção
                // marcada por engano no rascunho.
                if (
                  campo === "precoUnitario"
                  && precoReferencia !== null
                  && Number.isFinite(Number(valor))
                  && Math.abs(Number(valor) - precoReferencia) <= 0.004
                ) {
                  return { ...proxima, precoPromocional: false };
                }
                return proxima;
              }),
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
            // Uma troca já usada foi baixada do saldo físico no lote anterior.
            quantidadeTroca: "0",
            precoUnitario: anterior?.precoUnitario
              ?? precoInicial(produtoAnterior.produtoId, cliente.id, produtoAtual.precoPadrao),
            precoPromocional: anterior?.precoPromocional ?? false,
            trocaAberta: false,
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
    setBuscaProduto("");
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
          return { ...r, precoPromocional: l.precoPromocional, erro: null as string | null };
        } catch (e) {
          return {
            clienteId: l.clienteId,
            emitenteId: l.emitenteId,
            quantidadeDistribuida: distribuida,
            quantidadeTroca: troca,
            precoUnitario: preco,
            quantidadeFaturavel: 0,
            subtotal: 0,
            precoPromocional: l.precoPromocional,
            erro: e instanceof Error ? e.message : "Erro",
          };
        }
      });

      const validacao = validarDisponibilidadePreview(
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
  const saldoTrocaDoMercado = (produtoId: string, clienteId: string) => {
    const produto = produtosDistribuicao.find((item) => item.produtoId === produtoId);
    const usado = produto?.linhas
      .filter((linha) => linha.clienteId === clienteId)
      .reduce((total, linha) => total + Number(linha.quantidadeTroca || 0), 0) ?? 0;
    return Number(trocasDisponiveis[`${produtoId}:${clienteId}`] ?? 0) - usado;
  };
  const temErroSaldoTroca = produtosDistribuicao.some((produto) =>
    [...new Set(produto.linhas.map((linha) => linha.clienteId))].some(
      (clienteId) => saldoTrocaDoMercado(produto.produtoId, clienteId) < -0.0005,
    ),
  );
  const sobras = previewPorProduto.filter((p) => p.validacao.sobra > 0);
  const assinaturaSobras = JSON.stringify(produtosDistribuicao);
  const confirmouSobras = sobras.length === 0 || sobrasConfirmadas === assinaturaSobras;
  const temErro = temErroSaldoTroca || previewPorProduto.some(
    (p) => p.resultados.some((r) => r.erro) || !p.validacao.valido
  );
  const algumaLinhaPreenchida = previewPorProduto.some((p) =>
    p.resultados.some((r) => r.quantidadeDistribuida > 0)
  );
  const podeEnviar = produtosDistribuicao.length > 0 && destinos.length > 0 && algumaLinhaPreenchida && !temErro && !enviando;

  async function handleSubmit() {
    if (!podeEnviar || !confirmouSobras) return;
    setEnviando(true);
    setStatus(null);
    setResultado(null);
    try {
      const processado = await processarDistribuicao({
        chaveIdempotencia,
        data,
        confirmouSobras,
        produtos: produtosDistribuicao.map((p) => ({
          produtoId: p.produtoId,
          quantidadeTotal: Number(p.quantidadeTotal || 0),
          linhas: p.linhas.map((l) => ({
              clienteId: l.clienteId,
              emitenteId: l.emitenteId,
              quantidadeDistribuida: Number(l.quantidadeDistribuida || 0),
              quantidadeTroca: Number(l.quantidadeTroca || 0),
              precoUnitario: Number(l.precoUnitario || 0),
              precoPromocional: l.precoPromocional,
            })),
        })),
      });
      setStatus({ tipo: "ok", texto: processado.reutilizada ? "Esta distribuição já havia sido registrada — nenhum dado foi duplicado." : "Distribuição registrada com segurança." });
      setResultado({ loteId: processado.loteId, numero: processado.numeroDistribuicao, tarefas: processado.tarefasCriadas });
      setFalhaRascunho(!gravarRascunhoLocal(chaveRascunho, null));
      setDestinos([]);
      setProdutosDistribuicao([]);
      setProdutoParaAdicionar("");
      setBuscaProduto("");
      setQuantidadeParaAdicionar("");
      setChaveIdempotencia(crypto.randomUUID());
    } catch (e) {
      setStatus({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao processar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pb-28 md:pb-6">
      {falhaRascunho && <p role="status" className="mt-4 rounded border border-[var(--wheat)] p-3 text-sm">
        Não foi possível atualizar o rascunho neste navegador. {resultado
          ? "A distribuição foi registrada. Um rascunho antigo pode reaparecer; confira as tarefas antes de reenviar."
          : "Você pode continuar, mas alterações podem se perder ao sair. Confira os dados se um rascunho antigo reaparecer."}
      </p>}
      {rascunhoCarregado && !resultado && temConteudoRascunho({ destinos, produtos: produtosDistribuicao }) && (
        <Card className="mt-5 flex flex-col gap-3 border-[var(--wheat)] bg-[var(--wheat-tint)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">{falhaRascunho ? "Preenchimento ainda aberto" : "Rascunho salvo neste dispositivo"}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--ink-soft)]">
              {falhaRascunho ? "O salvamento local não está confirmado." : "As alterações ficam disponíveis apenas nesta conta e neste navegador até você processar ou descartar."}
            </p>
          </div>
          <button
            type="button"
            onClick={descartarRascunho}
            className="tap-target shrink-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] active:bg-[var(--cream)]"
          >
            Descartar rascunho
          </button>
        </Card>
      )}

      {ultimaDistribuicao && (
        <Card className={`${rascunhoCarregado && !resultado && temConteudoRascunho({ destinos, produtos: produtosDistribuicao }) ? "mt-4" : "mt-5"} border-[var(--field)] bg-[var(--field-tint)] p-4`}>
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
        <Label htmlFor="busca-produto">Adicionar produto</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <input
              id="busca-produto"
              type="search"
              value={buscaProduto}
              onFocus={() => {
                setSeletorProdutoAberto(true);
                setIndiceProdutoAtivo(0);
              }}
              onBlur={() => window.setTimeout(() => setSeletorProdutoAberto(false), 120)}
              onChange={(event) => {
                setBuscaProduto(event.target.value);
                setProdutoParaAdicionar("");
                setSeletorProdutoAberto(true);
                setIndiceProdutoAtivo(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && produtosFiltrados.length > 0) {
                  event.preventDefault();
                  setSeletorProdutoAberto(true);
                  setIndiceProdutoAtivo((indice) => Math.min(indice + 1, produtosFiltrados.length - 1));
                  return;
                }
                if (event.key === "ArrowUp" && produtosFiltrados.length > 0) {
                  event.preventDefault();
                  setSeletorProdutoAberto(true);
                  setIndiceProdutoAtivo((indice) => Math.max(indice - 1, 0));
                  return;
                }
                if (event.key === "Enter" && produtosFiltrados.length > 0) {
                  event.preventDefault();
                  selecionarProduto(produtosFiltrados[Math.min(indiceProdutoAtivo, produtosFiltrados.length - 1)]);
                }
                if (event.key === "Escape") setSeletorProdutoAberto(false);
              }}
              placeholder="Digite o nome do produto..."
              autoComplete="off"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-controls="opcoes-produto"
              aria-expanded={seletorProdutoAberto}
              aria-activedescendant={seletorProdutoAberto && produtosFiltrados.length > 0
                ? `produto-opcao-${produtosFiltrados[Math.min(indiceProdutoAtivo, produtosFiltrados.length - 1)].id}`
                : undefined}
              role="combobox"
              className="w-full"
            />
            {seletorProdutoAberto && (
              <div
                id="opcoes-produto"
                role="listbox"
                aria-label="Produtos disponíveis em ordem alfabética"
                className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--paper-raised)] p-1 shadow-lg"
              >
                {produtosFiltrados.length > 0 ? produtosFiltrados.map((produto, indice) => (
                  <button
                    key={produto.id}
                    id={`produto-opcao-${produto.id}`}
                    type="button"
                    role="option"
                    aria-selected={produtoParaAdicionar === produto.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setIndiceProdutoAtivo(indice)}
                    onClick={() => selecionarProduto(produto)}
                    className={`tap-target flex min-h-10 w-full items-center rounded-[calc(var(--radius-control)-2px)] px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--field-tint)] focus:bg-[var(--field-tint)] ${
                      indice === Math.min(indiceProdutoAtivo, produtosFiltrados.length - 1)
                        ? "bg-[var(--field-tint)]"
                        : ""
                    }`}
                  >
                    {produto.descricao} · {produto.unidade}
                  </button>
                )) : (
                  <p className="px-3 py-2 text-sm text-[var(--ink-soft)]">Nenhum produto encontrado.</p>
                )}
              </div>
            )}
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={quantidadeParaAdicionar}
            aria-label="Quantidade disponível do produto a adicionar"
            min="0"
            onChange={(e) => setQuantidadeParaAdicionar(e.target.value)}
            placeholder="Qtd. total"
            className="font-mono-tab w-full sm:w-28"
          />
          <button
            type="button"
            onClick={adicionarProduto}
            disabled={destinos.length === 0 || !produtoParaAdicionar || !quantidadeParaAdicionar}
            className="tap-target min-h-11 rounded-[var(--radius-control)] border border-[var(--field)] px-4 text-sm font-medium text-[var(--field-strong)] active:bg-[var(--field-tint)] disabled:opacity-30"
          >
            + Adicionar
          </button>
        </div>
      </Card>

      {/* Primeiro define-se o total físico de cada produto; o preenchimento
          operacional abaixo acontece por mercado. O estado e as regras fiscais
          continuam os mesmos, apenas a ordem de trabalho muda. */}
      {produtosDistribuicao.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="font-medium">Produtos da distribuição</p>
          <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Informe o total carregado de cada produto antes de separar os mercados.</p>
          <div className="mt-3 space-y-2">
            {produtosDistribuicao.map((p) => {
              const produto = produtos.find((item) => item.id === p.produtoId)!;
              const preview = previewPorProduto.find((item) => item.produtoId === p.produtoId)!;
              return <div key={p.produtoId} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 font-medium">{produto.descricao}</span>
                <input type="number" inputMode="decimal" value={p.quantidadeTotal} min="0" aria-label={`Total disponível de ${produto.descricao}`} aria-invalid={Boolean(preview.validacao.erro)} onChange={(e) => atualizarQuantidadeTotal(p.produtoId, e.target.value)} className="font-mono-tab h-9! min-h-0! w-20 text-right" />
                <span className="text-[var(--ink-soft)]">{produto.unidade}</span>
                <button type="button" onClick={() => removerProduto(p.produtoId)} className="text-[13px] text-[var(--stamp)]">Remover</button>
              </div>;
            })}
          </div>
        </Card>
      )}

      {/* O mercado é a unidade de trabalho: conclua todos os produtos dele e
          avance para o próximo, sem alterar o agrupamento fiscal por emitente. */}
      <div className="mt-4 space-y-4">
        {clientes.filter((cliente) => mercadosSelecionados.has(cliente.id)).map((cliente, indiceMercado) => {
          return <Card key={cliente.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--field-strong)]">Mercado {indiceMercado + 1} de {mercadosSelecionados.size}</p><h2 className="mt-1 text-lg font-medium">{cliente.nome}</h2></div>
              <span className="rounded-full bg-[var(--field-tint)] px-2 py-1 text-[11px] font-medium text-[var(--field-strong)]">{produtosDistribuicao.length} produto(s)</span>
            </div>
            {produtosDistribuicao.length > 0 ? <div className="mt-4 space-y-3">
              {produtosDistribuicao.map((p) => {
                const produto = produtos.find((item) => item.id === p.produtoId)!;
                const preview = previewPorProduto.find((item) => item.produtoId === p.produtoId)!;
                const linhas = p.linhas.filter((linha) => linha.clienteId === cliente.id);
                return <div key={p.produtoId} className="rounded-[var(--radius-control)] border border-[var(--line)] p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{produto.descricao}</span><span className="text-[12px] text-[var(--ink-soft)]">Disponível: {p.quantidadeTotal || "0"} {produto.unidade}</span></div>
                  {preview.validacao.erro && <p role="alert" className="mt-1 text-[12px] text-[var(--stamp)]">{preview.validacao.erro}</p>}
                  <div className="mt-2 space-y-2">{linhas.map((linha) => {
                    const emitente = cliente.emitentes.find((item) => item.id === linha.emitenteId)!;
                    const resultadoLinha = preview.resultados.find((item) => item.clienteId === linha.clienteId && item.emitenteId === linha.emitenteId)!;
                    const preenchido = Number(linha.quantidadeDistribuida || 0) > 0;
                    const precoReferencia = Number(precoInicial(p.produtoId, cliente.id, produto.precoPadrao));
                    const precoAlterado = Number.isFinite(precoReferencia) && Math.abs(Number(linha.precoUnitario || 0) - precoReferencia) > 0.004;
                    const saldoInicialTroca = Number(trocasDisponiveis[`${p.produtoId}:${cliente.id}`] ?? 0);
                    const saldoRestanteTroca = saldoTrocaDoMercado(p.produtoId, cliente.id);
                    const maximoNestaLinha = Math.max(0, saldoRestanteTroca + Number(linha.quantidadeTroca || 0));
                    return <div key={chaveDestino(linha)} className={`rounded-[var(--radius-control)] border p-2.5 ${preenchido ? "border-[var(--field)]" : "border-[var(--line)]"}`}>
                      {linhas.length > 1 && <p className="mb-2 text-[12px] text-[var(--ink-soft)]">Emitente: {emitente.nome}</p>}
                      <div className="grid grid-cols-[1fr_auto] items-center gap-2"><Label>Quantidade total</Label>{preenchido && !resultadoLinha.erro && <span className="font-mono-tab text-[13px] text-[var(--wheat)]">{moeda.format(resultadoLinha.subtotal)}</span>}</div>
                      <div className="mt-1 flex items-center gap-1.5"><button type="button" onClick={() => ajustarQuantidade(p.produtoId, linha, -1)} aria-label={`Diminuir ${produto.descricao}`} className="w-9 shrink-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] text-[var(--ink-soft)] active:bg-[var(--field-tint)]">−</button><input type="number" inputMode="decimal" value={linha.quantidadeDistribuida} aria-label={`Quantidade total de ${produto.descricao} para ${cliente.nome} — ${emitente.nome}`} min="0" onChange={(e) => atualizarLinha(p.produtoId, linha, "quantidadeDistribuida", e.target.value)} placeholder="0" className="font-mono-tab h-10! min-h-0! w-full text-center" /><button type="button" onClick={() => ajustarQuantidade(p.produtoId, linha, 1)} aria-label={`Aumentar ${produto.descricao}`} className="w-9 shrink-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] text-[var(--ink-soft)] active:bg-[var(--field-tint)]">+</button></div>
                      <p className="mt-1 text-[11px] text-[var(--ink-faint)]">Inclui as unidades de troca desta entrega.</p>
                      {saldoInicialTroca > 0 || linha.trocaAberta ? <div className="mt-2 rounded border border-[var(--wheat)] bg-[var(--cream)] px-2 py-1.5"><div className="grid grid-cols-[1fr_auto] items-center gap-2"><Label>Troca nesta entrega</Label><input type="number" inputMode="decimal" value={linha.quantidadeTroca} aria-label={`Troca de ${produto.descricao} para ${cliente.nome} — ${emitente.nome}`} min="0" max={maximoNestaLinha} onChange={(e) => atualizarLinha(p.produtoId, linha, "quantidadeTroca", e.target.value)} className="font-mono-tab h-8! min-h-0! w-16 text-right text-[12px]" /></div><p className={`mt-1 text-[11px] ${saldoRestanteTroca < -0.0005 ? "text-[var(--stamp)]" : "text-[var(--ink-soft)]"}`}>{saldoRestanteTroca < -0.0005 ? `Excede o saldo registrado em ${Math.abs(saldoRestanteTroca)} ${produto.unidade}.` : `Saldo após esta distribuição: ${saldoRestanteTroca} ${produto.unidade}.`}</p></div> : <a href="/trocas" className="mt-2 inline-block text-[12px] text-[var(--ink-faint)] underline decoration-dotted underline-offset-2">Sem troca registrada · adicionar saldo</a>}
                      <div className="mt-2 flex items-center justify-end gap-1.5 text-[12px]"><span className="text-[var(--ink-soft)]">R$/un:</span><input type="number" step="0.01" inputMode="decimal" value={linha.precoUnitario} aria-label={`Preço de ${produto.descricao} para ${cliente.nome} — ${emitente.nome}`} min="0" onChange={(e) => atualizarLinha(p.produtoId, linha, "precoUnitario", e.target.value)} className="font-mono-tab h-8! min-h-0! w-20 text-right text-[12px]" /></div>
                      {precoAlterado && <label className="mt-2 flex items-center gap-2 text-[12px] text-[var(--ink-soft)]"><input type="checkbox" checked={linha.precoPromocional} onChange={(e) => atualizarLinha(p.produtoId, linha, "precoPromocional", e.target.checked)} className="h-4 w-4 shrink-0" />Preço promocional — não usar como sugestão na próxima distribuição.</label>}
                      {resultadoLinha.erro && <p className="mt-1 text-[12px] text-[var(--stamp)]">{resultadoLinha.erro}</p>}
                    </div>;
                  })}</div>
                </div>;
              })}
            </div> : <p className="mt-3 text-[13px] text-[var(--ink-faint)]">Adicione os produtos da rota para preencher este mercado.</p>}
          </Card>;
        })}
        {produtosDistribuicao.length === 0 && <p className="px-1 text-[13px] text-[var(--ink-faint)]">Nenhum produto adicionado ainda — use o campo acima.</p>}
      </div>

      {status && !resultado && (
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

      {podeEnviar && (
        <Card className="mt-5 border-[var(--field)] p-4">
          <h2 className="text-sm font-semibold">Confira antes de distribuir</h2>
          {sobras.length > 0 && <div className="mt-2 rounded border border-[var(--wheat)] p-3 text-sm">
            <p className="font-medium">Quantidades que ficarão sem distribuir:</p>
            {sobras.map((p) => { const produto = produtos.find((item) => item.id === p.produtoId); return <p key={p.produtoId}>{produto?.descricao}: {p.validacao.sobra} {produto?.unidade}</p>; })}
            <label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={confirmouSobras} onChange={(e) => setSobrasConfirmadas(e.target.checked ? assinaturaSobras : "")} />Conferi e quero manter essas sobras.</label>
          </div>}
          <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Cada mercado e emitente com quantidade faturável receberá uma nota. Destinos somente com trocas não geram nota.</p>
          <div className="mt-3 divide-y divide-[var(--line)]">
            {destinos.map((destino) => {
              const cliente = clientes.find((c) => c.id === destino.clienteId);
              const linhas = previewPorProduto.flatMap((p) => p.resultados
                .filter((r) => r.clienteId === destino.clienteId && r.emitenteId === destino.emitenteId && r.quantidadeDistribuida > 0)
                .map((r) => ({ ...r, produtoId: p.produtoId })));
              if (!linhas.length) return null;
              return <div key={chaveDestino(destino)} className="py-3 text-sm">
                <p className="font-semibold">{cliente?.nome} — {cliente?.emitentes.find((e) => e.id === destino.emitenteId)?.nome}</p>
                {linhas.map((linha) => {
                  const produto = produtos.find((p) => p.id === linha.produtoId);
                  const precoReferencia = produto
                    ? Number(precoInicial(produto.id, destino.clienteId, produto.precoPadrao))
                    : null;
                  const precoDiferenteDoUltimo = precoReferencia !== null
                    && Math.abs(linha.precoUnitario - precoReferencia) > 0.004;
                  return (
                    <div key={linha.produtoId} className="mt-2 text-[13px] text-[var(--ink-soft)]">
                      <p>
                        {produto?.descricao}: {linha.quantidadeDistribuida} {produto?.unidade}
                        {linha.quantidadeTroca > 0 ? ` · troca ${linha.quantidadeTroca}` : ""}
                        {linha.quantidadeTroca > 0 ? ` · na nota: ${linha.quantidadeFaturavel} ${produto?.unidade ?? ""}` : ""}
                      </p>
                      <p className="font-mono-tab text-[12px]">
                        {moeda.format(linha.precoUnitario)} por {produto?.unidade} · {moeda.format(linha.subtotal)}
                      </p>
                      {linha.precoPromocional && (
                        <p className="mt-1 text-[11px] text-[var(--field-strong)]">
                          Preço promocional — não altera a sugestão futura.
                        </p>
                      )}
                      {precoDiferenteDoUltimo && (
                        <p className="mt-1 rounded bg-[var(--cream)] px-2 py-1 text-[11px] text-[var(--ink)]">
                          Preço diferente da referência de {moeda.format(precoReferencia!)}. Confira o valor antes de enviar.
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="mt-2 font-mono-tab font-semibold">{moeda.format(linhas.reduce((s, l) => s + l.subtotal, 0))}</p>
              </div>;
            })}
          </div>
        </Card>
      )}

      {resultado && (
        <Card role="status" aria-live="polite" className="mt-5 border-2 border-[var(--field)] bg-[var(--field-tint)] p-4 shadow-sm">
          <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--field-strong)]">Distribuição enviada</p>
          <h2 ref={tituloResultado} tabIndex={-1} className="mt-1 text-xl font-semibold text-[var(--ink)]">
            Distribuição {resultado.numero ? String(resultado.numero).padStart(6, "0") : "registrada"}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {mensagemConfirmacaoDistribuicao(resultado.tarefas)}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 text-sm">
            {resultado.tarefas > 0 && <a href="/tarefas" className="tap-target flex items-center justify-center rounded-[var(--radius-control)] bg-[var(--field)] px-3 text-center font-semibold text-white">Acompanhar emissão</a>}
            <a href={`/entregas?lote=${encodeURIComponent(resultado.loteId)}`} className="tap-target flex items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 text-center font-medium">Abrir roteiro</a>
          </div>
          <button
            type="button"
            onClick={iniciarNovaDistribuicao}
            className="tap-target mt-2 flex w-full items-center justify-center rounded-[var(--radius-control)] px-3 text-sm font-semibold text-[var(--field-strong)] underline decoration-[var(--line-strong)] underline-offset-4"
          >
            Iniciar nova distribuição
          </button>
        </Card>
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
          <PrimaryButton onClick={handleSubmit} disabled={!podeEnviar || !confirmouSobras} className="px-6 py-2.5">
            {enviando ? "Processando…" : "Processar distribuição"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
