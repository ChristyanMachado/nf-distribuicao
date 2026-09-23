"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import Card from "@/components/Card";
import { dataOperacionalBrasil } from "@/lib/datas";
import {
  calcularKpis,
  calcularKpisOperacionais,
  intervaloDoPreset,
  rankearPorCliente,
  rankearPorProduto,
  rankearQuantidadeFisicaPorProduto,
  rankearTrocasPorCliente,
  serieDiaria,
  serieQuantidadeProduto,
  validarIntervaloRelatorio,
  type ItemRelatorio,
  type PresetPeriodo,
  type TrocaRelatorio,
  type TarefaOperacional,
} from "@/lib/relatorios";
import { carregarRelatorio } from "./actions";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
});

const PRESETS: { valor: PresetPeriodo; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "7dias", label: "7 dias" },
  { valor: "30dias", label: "30 dias" },
  { valor: "mes_atual", label: "Este mês" },
];

export default function RelatoriosView({
  itensIniciais,
  trocasIniciais,
  tarefasIniciais,
}: {
  itensIniciais: ItemRelatorio[];
  trocasIniciais: TrocaRelatorio[];
  tarefasIniciais: TarefaOperacional[];
}) {
  const [preset, setPreset] = useState<PresetPeriodo | "personalizado">("30dias");
  const [periodoAtual, setPeriodoAtual] = useState(() =>
    intervaloDoPreset("30dias", dataOperacionalBrasil())
  );
  const [inicioPersonalizado, setInicioPersonalizado] = useState(periodoAtual.inicio);
  const [fimPersonalizado, setFimPersonalizado] = useState(periodoAtual.fim);
  const [mostrarPersonalizado, setMostrarPersonalizado] = useState(false);
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState("");
  const [itens, setItens] = useState(itensIniciais);
  const [trocas, setTrocas] = useState(trocasIniciais);
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [erroFiltro, setErroFiltro] = useState<string | null>(null);
  const [erroRecarregavel, setErroRecarregavel] = useState(false);
  const [pending, startTransition] = useTransition();
  const requisicaoAtual = useRef(0);

  function carregarPeriodo(
    inicio: string,
    fim: string,
    novoPreset: PresetPeriodo | "personalizado"
  ) {
    setPeriodoAtual({ inicio, fim });
    setPreset(novoPreset);
    setErroFiltro(null);
    setErroRecarregavel(false);
    const numeroRequisicao = ++requisicaoAtual.current;

    startTransition(async () => {
      try {
        const dados = await carregarRelatorio(inicio, fim);
        if (numeroRequisicao !== requisicaoAtual.current) return;
        setItens(dados.itens);
        setTrocas(dados.trocas);
        setTarefas(dados.tarefas);
      } catch {
        if (numeroRequisicao === requisicaoAtual.current) {
          setErroFiltro("Não foi possível atualizar o relatório. Os dados anteriores continuam visíveis.");
          setErroRecarregavel(true);
        }
      }
    });
  }

  function selecionarPeriodo(novoPreset: PresetPeriodo) {
    if (novoPreset === preset && !erroFiltro) return;

    const { inicio, fim } = intervaloDoPreset(novoPreset, dataOperacionalBrasil());
    setInicioPersonalizado(inicio);
    setFimPersonalizado(fim);
    setMostrarPersonalizado(false);
    carregarPeriodo(inicio, fim, novoPreset);
  }

  function aplicarPeriodoPersonalizado() {
    try {
      const periodo = validarIntervaloRelatorio(inicioPersonalizado, fimPersonalizado);
      carregarPeriodo(periodo.inicio, periodo.fim, "personalizado");
      setMostrarPersonalizado(false);
    } catch (erro) {
      setErroFiltro(erro instanceof Error ? erro.message : "Não foi possível validar o período.");
      setErroRecarregavel(false);
    }
  }

  const kpis = useMemo(() => calcularKpis(itens, trocas), [itens, trocas]);
  const porCliente = useMemo(() => rankearPorCliente(itens), [itens]);
  const porProduto = useMemo(() => rankearPorProduto(itens), [itens]);
  const serie = useMemo(() => serieDiaria(itens), [itens]);
  const operacao = useMemo(() => calcularKpisOperacionais(tarefas), [tarefas]);
  const trocasPorCliente = useMemo(() => rankearTrocasPorCliente(trocas), [trocas]);
  const quantidadePorProduto = useMemo(
    () => rankearQuantidadeFisicaPorProduto(itens, trocas),
    [itens, trocas]
  );
  const produtoDoHistorico =
    quantidadePorProduto.find((produto) => produto.id === produtoSelecionadoId) ??
    quantidadePorProduto[0];
  const serieProduto = useMemo(
    () =>
      produtoDoHistorico
        ? serieQuantidadeProduto(itens, trocas, produtoDoHistorico.id)
        : [],
    [itens, produtoDoHistorico, trocas]
  );

  return (
    <div>
      {/* Seletor de período — 1 toque, sem abrir formulário */}
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Período do relatório">
        {PRESETS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => selecionarPeriodo(p.valor)}
            aria-pressed={preset === p.valor}
            aria-controls="conteudo-relatorio"
            className={`min-h-11 rounded-full border px-4 py-2 text-sm ${
              preset === p.valor
                ? "border-[var(--field)] bg-[var(--field-tint)] text-[var(--field-strong)]"
                : "border-[var(--line-strong)] text-[var(--ink-faint)]"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMostrarPersonalizado((aberto) => !aberto)}
          aria-expanded={mostrarPersonalizado}
          aria-controls="periodo-personalizado"
          className={`min-h-11 rounded-full border px-4 py-2 text-sm ${
            preset === "personalizado"
              ? "border-[var(--field)] bg-[var(--field-tint)] text-[var(--field-strong)]"
              : "border-[var(--line-strong)] text-[var(--ink-faint)]"
          }`}
        >
          Período personalizado
        </button>
      </div>

      {mostrarPersonalizado && (
        <Card id="periodo-personalizado" className="mt-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Início
              <input
                type="date"
                value={inicioPersonalizado}
                onChange={(event) => setInicioPersonalizado(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-transparent px-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fim
              <input
                type="date"
                value={fimPersonalizado}
                onChange={(event) => setFimPersonalizado(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-transparent px-3"
              />
            </label>
            <button
              type="button"
              onClick={aplicarPeriodoPersonalizado}
              disabled={pending}
              className="min-h-11 rounded-[var(--radius-control)] bg-[var(--field)] px-4 font-semibold text-white disabled:opacity-60"
            >
              Aplicar período
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
            Consulte até 366 dias por vez. Os dados anteriores continuam visíveis se a atualização falhar.
          </p>
        </Card>
      )}

      <div className="min-h-6" aria-live="polite" aria-atomic="true">
        {pending && <p className="mt-2 text-sm text-[var(--ink-soft)]">Atualizando período…</p>}
      </div>
      {erroFiltro && (
        <div className="mt-2 rounded-lg border border-[var(--stamp)] p-3 text-sm" role="alert">
          <p>{erroFiltro}</p>
          {erroRecarregavel && (
            <button
              type="button"
              onClick={() => carregarPeriodo(periodoAtual.inicio, periodoAtual.fim, preset)}
              className="mt-2 min-h-11 font-semibold text-[var(--field-strong)] underline underline-offset-4"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      <div id="conteudo-relatorio" aria-busy={pending}>
        {/* KPIs */}
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-4">
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Valor registrado</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold text-[var(--wheat)]">
              {moeda.format(kpis.valorDistribuidoBruto)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Notas registradas</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold">{kpis.numeroNotas}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Média por nota registrada</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold">
              {moeda.format(kpis.valorMedioPorNota)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Valor das reposições usadas</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold">
              {moeda.format(kpis.valorEstimadoTrocas)}
            </p>
          </Card>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
          Valores registrados na distribuição; não representam recebimento, custo, lucro, estoque ou resultado financeiro.
        </p>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
              Eficiência da operação
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              O essencial da fila e das emissões. Detalhes técnicos ficam recolhidos abaixo.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-4">
          <KpiOperacional
            titulo="Distribuições"
            valor={String(operacao.distribuicoes)}
            detalhe={`${formatarQuantidade(operacao.distribuicoesConcluidas, "completa", "completas")} · ${formatarQuantidade(operacao.notasProcessadas, "nota processada", "notas processadas")}`}
          />
          <KpiOperacional
            titulo="Fila aberta"
            valor={String(operacao.pendentes + operacao.emAndamento)}
            detalhe={`${formatarQuantidade(operacao.pendentes, "pendente", "pendentes")} · ${operacao.emAndamento} em curso`}
          />
          <KpiOperacional
            titulo="Atenção / erros"
            valor={String(operacao.atencao + operacao.erros)}
            detalhe={`${formatarQuantidade(operacao.atencao, "tarefa para conferir", "tarefas para conferir")} · ${formatarQuantidade(operacao.erros, "erro", "erros")}`}
            alerta={operacao.atencao + operacao.erros > 0}
          />
          <KpiOperacional
            titulo="Tempo médio por distribuição"
            valor={
              operacao.tempoMedioLoteSegundos === null
                ? "—"
                : formatarDuracao(operacao.tempoMedioLoteSegundos)
            }
            detalhe={`${formatarQuantidade(operacao.distribuicoesMedidas, "distribuição medida", "distribuições medidas")} sem reprocessamento`}
          />
        </div>
        {operacao.notasCanceladas > 0 && (
          <p className="mt-2 rounded-[var(--radius-control)] border border-[var(--wheat)] bg-[var(--cream)] px-3 py-2 text-[12px] text-[var(--ink-soft)]">
            {formatarQuantidade(operacao.notasCanceladas, "nota cancelada", "notas canceladas")} após emissão. O cancelamento não muda o resultado da tarefa; sua causa precisa ser confirmada.
          </p>
        )}
        <details className="mt-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--paper)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Tempos e diagnóstico do Worker</summary>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-4">
            <KpiOperacional
              titulo="Saldo frente ao teste manual"
              valor={operacao.distribuicoesComparaveis === 0 ? "—" : `${operacao.tempoEconomizadoSegundos < 0 ? "−" : ""}${formatarDuracao(Math.abs(operacao.tempoEconomizadoSegundos))}`}
              detalhe={`${formatarQuantidade(operacao.distribuicoesComparaveis, "lote", "lotes")} de 3 notas; positivo indica menos tempo`}
              destaque
            />
            <KpiOperacional
              titulo="Erros"
              valor={String(operacao.erros)}
              detalhe="tarefas com falha que exigem diagnóstico"
              alerta={operacao.erros > 0}
            />
            <KpiOperacional
              titulo="Espera média na fila"
              valor={operacao.tempoMedioEsperaFilaSegundos === null ? "—" : formatarDuracao(operacao.tempoMedioEsperaFilaSegundos)}
              detalhe={operacao.lotesComEsperaMedida ? `${formatarQuantidade(operacao.lotesComEsperaMedida, "distribuição medida", "distribuições medidas")} até o primeiro início` : "Sem medições suficientes"}
            />
            <KpiOperacional
              titulo="Tempo médio por item"
              valor={operacao.tempoMedioPorItemSegundos === null ? "—" : formatarDuracao(operacao.tempoMedioPorItemSegundos)}
              detalhe="duração do lote dividida pelas linhas de itens"
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-faint)]">
            Duração medida da primeira tarefa iniciada à última autorização, apenas em lotes concluídos na primeira tentativa. A espera na fila fica separada. Nenhum destes tempos inclui montar a distribuição ou armazenar documentos. O teste manual de 5min 37s é apenas referência exploratória para 3 notas.
          </p>
          <h3 className="mt-4 text-sm font-semibold">Tempo observado por tamanho de lote</h3>
          <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
            {operacao.distribuicoesMedidas} de {operacao.distribuicoes} distribuições têm medição elegível; reprocessamentos, lotes incompletos e duração inválida ficam fora.
          </p>
          {operacao.desempenhoPorEscala.length === 0 ? <p className="mt-3 text-sm">Ainda sem lotes elegíveis neste período.</p> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[12px] font-mono-tab">
                <caption className="sr-only">Durações medidas, sem extrapolação do teste manual</caption>
                <thead><tr>{["Notas/lote", "Lotes medidos", "Tempo somado", "Média/lote", "Média/nota"].map((titulo) => <th key={titulo} scope="col" className="px-2 py-2 font-medium">{titulo}</th>)}</tr></thead>
                <tbody>{operacao.desempenhoPorEscala.map((escala) => <tr key={escala.notasPorLote} className="border-t border-[var(--line)]">
                  <th scope="row" className="px-2 py-2 font-normal">{escala.notasPorLote}</th>
                  <td className="px-2 py-2">{escala.lotes}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatarDuracao(escala.segundosTotais)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatarDuracao(escala.mediaLoteSegundos)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatarDuracao(escala.mediaNotaSegundos)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </details>

      {/* Gráfico do valor bruto por dia */}
      {serie.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="mb-2 text-[13px] font-medium text-[var(--ink-soft)]">Valor registrado por dia</p>
          <div role="img" aria-label={`Gráfico do valor registrado em ${serie.length} dia(s)`}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="data"
                tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                tick={{ fontSize: 11, fill: "#6f7164" }}
                axisLine={{ stroke: "#e4ddcb" }}
                tickLine={false}
                minTickGap={24}
                interval="preserveStartEnd"
              />
              <Tooltip
                formatter={(valor) => moeda.format(Number(valor))}
                labelFormatter={(d) => String(d).split("-").reverse().join("/")}
                contentStyle={{ fontSize: 13, borderRadius: 8, borderColor: "#e4ddcb" }}
              />
              <Bar dataKey="valor" fill="#38583f" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="mt-4">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Reposições usadas por mercado
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {trocasPorCliente.slice(0, 8).map((cliente) => (
            <BarraRanking
              key={cliente.id}
              nome={cliente.nome}
              valor={cliente.valor}
              maximo={trocasPorCliente[0]?.valor ?? 1}
            />
          ))}
          {trocasPorCliente.length === 0 && <VazioLista />}
        </Card>
        <p className="mt-1.5 px-1 text-[11px] text-[var(--ink-faint)]">
          Valor de referência das reposições efetivamente usadas no período; não é crédito, recebimento ou saldo pendente.
        </p>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
              Quantidade registrada por produto
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
              Total físico distribuído, incluindo a parcela usada como reposição.
            </p>
          </div>
          {quantidadePorProduto.length > 1 && (
            <label className="grid gap-1 text-[11px] text-[var(--ink-faint)]">
              Histórico do produto
              <select
                value={produtoDoHistorico?.id ?? ""}
                onChange={(event) => setProdutoSelecionadoId(event.target.value)}
                className="min-h-10 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-transparent px-2 text-sm text-[var(--ink)]"
              >
                {quantidadePorProduto.map((produto) => (
                  <option key={produto.id} value={produto.id}>{produto.nome}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <Card className="mt-2 divide-y divide-[var(--line)]">
          {quantidadePorProduto.slice(0, 8).map((produto) => (
            <BarraQuantidade
              key={produto.id}
              nome={produto.nome}
              quantidade={produto.quantidade}
              unidade={produto.unidade}
              maximo={quantidadePorProduto[0]?.quantidade ?? 1}
            />
          ))}
          {quantidadePorProduto.length === 0 && <VazioLista />}
        </Card>
        {produtoDoHistorico && serieProduto.length > 0 && (
          <Card className="mt-3 p-4">
            <p className="mb-2 text-[13px] font-medium text-[var(--ink-soft)]">
              Quantidade diária: {produtoDoHistorico.nome}
            </p>
            <div role="img" aria-label={`Histórico diário de quantidade de ${produtoDoHistorico.nome}`}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={serieProduto} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis
                    dataKey="data"
                    tickFormatter={(data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`}
                    tick={{ fontSize: 11, fill: "#6f7164" }}
                    axisLine={{ stroke: "#e4ddcb" }}
                    tickLine={false}
                    minTickGap={24}
                    interval="preserveStartEnd"
                  />
                  <Tooltip
                    formatter={(valor) => formatarNumero(Number(valor), produtoDoHistorico.unidade)}
                    labelFormatter={(data) => String(data).split("-").reverse().join("/")}
                    contentStyle={{ fontSize: 13, borderRadius: 8, borderColor: "#e4ddcb" }}
                  />
                  <Bar dataKey="quantidade" fill="#a05038" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <p className="mt-1.5 px-1 text-[11px] text-[var(--ink-faint)]">
          Histórico observado de distribuição. Não calcula estoque, previsão de demanda ou produção futura.
        </p>
      </div>

      {/* Ranking por cliente */}
      <div className="mt-4">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Valor registrado por mercado
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {porCliente.slice(0, 8).map((c) => (
            <BarraRanking key={c.id} nome={c.nome} valor={c.valor} maximo={porCliente[0]?.valor ?? 1} />
          ))}
          {porCliente.length === 0 && <VazioLista />}
        </Card>
        <p className="mt-1.5 px-1 text-[11px] text-[var(--ink-faint)]">As barras comparam o valor registrado no período; a maior ocupa toda a largura.</p>
      </div>

      {/* Ranking por produto */}
      <div className="mt-4">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Valor registrado por produto
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {porProduto.slice(0, 8).map((p) => (
            <BarraRanking key={p.id} nome={p.nome} valor={p.valor} maximo={porProduto[0]?.valor ?? 1} />
          ))}
          {porProduto.length === 0 && <VazioLista />}
        </Card>
        <p className="mt-1.5 px-1 text-[11px] text-[var(--ink-faint)]">Valores brutos das notas no período, antes de custos, pagamentos e lucro.</p>
      </div>
      </div>
    </div>
  );
}

function BarraRanking({ nome, valor, maximo }: { nome: string; valor: number; maximo: number }) {
  const largura = maximo > 0 ? Math.max(4, Math.round((valor / maximo) * 100)) : 4;
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium" title={nome}>{nome}</span>
        <span className="font-mono-tab shrink-0 text-[var(--wheat)]">{moedaCompacta.format(valor)}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--field-tint)]">
        <div className="h-full rounded-full bg-[var(--field)]" style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

function BarraQuantidade({
  nome,
  quantidade,
  unidade,
  maximo,
}: {
  nome: string;
  quantidade: number;
  unidade?: string;
  maximo: number;
}) {
  const largura = maximo > 0 ? Math.max(4, Math.round((quantidade / maximo) * 100)) : 4;
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium" title={nome}>{nome}</span>
        <span className="font-mono-tab shrink-0 text-[var(--wheat)]">
          {formatarNumero(quantidade, unidade)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--field-tint)]">
        <div className="h-full rounded-full bg-[var(--wheat)]" style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

function VazioLista() {
  return (
    <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
      Sem dados nesse período.
    </div>
  );
}

function formatarDuracao(segundos: number) {
  const total = Math.max(0, Math.round(segundos));
  if (total < 60) return `${total}s`;
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundosRestantes = total % 60;
  if (horas) return `${horas}h ${minutos}min`;
  return `${minutos}min${segundosRestantes ? ` ${segundosRestantes}s` : ""}`;
}

function formatarQuantidade(valor: number, singular: string, plural: string) {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

function formatarNumero(valor: number, unidade?: string) {
  const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);
  return unidade ? `${numero} ${unidade}` : numero;
}

function KpiOperacional({ titulo, valor, detalhe, destaque = false, alerta = false }: { titulo: string; valor: string; detalhe: string; destaque?: boolean; alerta?: boolean }) {
  return <Card className={`p-4 ${alerta ? "border-[var(--stamp)]" : destaque ? "border-[var(--field)] bg-[var(--field-tint)]" : ""}`}><p className="text-[12px] text-[var(--ink-faint)]">{titulo}</p><p className={`font-mono-tab mt-1 text-xl font-semibold ${alerta ? "text-[var(--stamp)]" : destaque ? "text-[var(--field-strong)]" : ""}`}>{valor}</p><p className="mt-1 text-[11px] leading-snug text-[var(--ink-faint)]">{detalhe}</p></Card>;
}
