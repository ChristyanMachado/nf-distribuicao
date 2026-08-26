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
  serieDiaria,
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
  const [preset, setPreset] = useState<PresetPeriodo>("30dias");
  const [itens, setItens] = useState(itensIniciais);
  const [trocas, setTrocas] = useState(trocasIniciais);
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [erroFiltro, setErroFiltro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requisicaoAtual = useRef(0);

  function selecionarPeriodo(novoPreset: PresetPeriodo) {
    if (novoPreset === preset && !erroFiltro) return;

    setPreset(novoPreset);
    setErroFiltro(null);
    const numeroRequisicao = ++requisicaoAtual.current;
    const { inicio, fim } = intervaloDoPreset(novoPreset, dataOperacionalBrasil());

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
        }
      }
    });
  }

  const kpis = useMemo(() => calcularKpis(itens, trocas), [itens, trocas]);
  const porCliente = useMemo(() => rankearPorCliente(itens), [itens]);
  const porProduto = useMemo(() => rankearPorProduto(itens), [itens]);
  const serie = useMemo(() => serieDiaria(itens), [itens]);
  const operacao = useMemo(() => calcularKpisOperacionais(tarefas), [tarefas]);

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
      </div>

      <div className="min-h-6" aria-live="polite" aria-atomic="true">
        {pending && <p className="mt-2 text-sm text-[var(--ink-soft)]">Atualizando período…</p>}
      </div>
      {erroFiltro && (
        <div className="mt-2 rounded-lg border border-[var(--stamp)] p-3 text-sm" role="alert">
          <p>{erroFiltro}</p>
          <button
            type="button"
            onClick={() => selecionarPeriodo(preset)}
            className="mt-2 min-h-11 font-semibold text-[var(--field-strong)] underline underline-offset-4"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div id="conteudo-relatorio" aria-busy={pending}>
        {/* KPIs */}
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-4">
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Distribuído bruto</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold text-[var(--wheat)]">
              {moeda.format(kpis.valorDistribuidoBruto)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Notas</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold">{kpis.numeroNotas}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Valor médio por nota</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold">
              {moeda.format(kpis.valorMedioPorNota)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-[var(--ink-faint)]">Valor estimado em trocas</p>
            <p className="font-mono-tab mt-1 text-xl font-semibold">
              {moeda.format(kpis.valorEstimadoTrocas)}
            </p>
          </Card>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
          Valores operacionais brutos; custos, pagamentos, descontos e lucro entrarão no futuro módulo
          financeiro.
        </p>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
              Eficiência da operação
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Fila, emissões e valor de tempo entregue pelo sistema.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-3">
          <KpiOperacional
            titulo="Distribuições"
            valor={String(operacao.distribuicoes)}
            detalhe={`${formatarQuantidade(operacao.distribuicoesConcluidas, "completa", "completas")} · ${formatarQuantidade(operacao.emitidas, "nota emitida", "notas emitidas")}`}
          />
          <KpiOperacional
            titulo="Tempo economizado"
            valor={formatarDuracao(operacao.tempoEconomizadoSegundos)}
            detalhe={`${formatarQuantidade(operacao.distribuicoesConcluidas, "distribuição completa", "distribuições completas")} × benchmark`}
            destaque
          />
          <KpiOperacional
            titulo="Fila aberta"
            valor={String(operacao.pendentes + operacao.emAndamento)}
            detalhe={`${formatarQuantidade(operacao.pendentes, "pendente", "pendentes")} · ${operacao.emAndamento} em curso`}
          />
          <KpiOperacional
            titulo="Erros"
            valor={String(operacao.erros)}
            detalhe="tarefas que exigem atenção"
            alerta={operacao.erros > 0}
          />
          <KpiOperacional
            titulo="Média por distribuição"
            valor={
              operacao.tempoMedioLoteSegundos === null
                ? "—"
                : formatarDuracao(operacao.tempoMedioLoteSegundos)
            }
            detalhe="do início da primeira à última nota"
          />
          <KpiOperacional
            titulo="Taxa concluída"
            valor={
              operacao.emitidas + operacao.erros === 0
                ? "—"
                : `${Math.round((operacao.emitidas / (operacao.emitidas + operacao.erros)) * 100)}%`
            }
            detalhe="emitidas entre resultados finais"
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
          Economia estimada pelo teste de 25/08/2026: uma distribuição de 3 notas levou 5min 37s no
          processo manual e 42,18s no sistema. Cada distribuição completa entra uma única vez.
        </p>

      {/* Gráfico do valor bruto por dia */}
      {serie.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="mb-2 text-[13px] font-medium text-[var(--ink-soft)]">Valor distribuído por dia</p>
          <div role="img" aria-label={`Gráfico do valor bruto distribuído em ${serie.length} dia(s)`}>
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

      {/* Ranking por cliente */}
      <div className="mt-4">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Por cliente
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {porCliente.slice(0, 8).map((c) => (
            <BarraRanking key={c.id} nome={c.nome} valor={c.valor} maximo={porCliente[0]?.valor ?? 1} />
          ))}
          {porCliente.length === 0 && <VazioLista />}
        </Card>
      </div>

      {/* Ranking por produto */}
      <div className="mt-4">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Por produto
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {porProduto.slice(0, 8).map((p) => (
            <BarraRanking key={p.id} nome={p.nome} valor={p.valor} maximo={porProduto[0]?.valor ?? 1} />
          ))}
          {porProduto.length === 0 && <VazioLista />}
        </Card>
      </div>
      </div>
    </div>
  );
}

function BarraRanking({ nome, valor, maximo }: { nome: string; valor: number; maximo: number }) {
  const largura = Math.max(4, Math.round((valor / maximo) * 100));
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

function KpiOperacional({ titulo, valor, detalhe, destaque = false, alerta = false }: { titulo: string; valor: string; detalhe: string; destaque?: boolean; alerta?: boolean }) {
  return <Card className={`p-4 ${alerta ? "border-[var(--stamp)]" : destaque ? "border-[var(--field)] bg-[var(--field-tint)]" : ""}`}><p className="text-[12px] text-[var(--ink-faint)]">{titulo}</p><p className={`font-mono-tab mt-1 text-xl font-semibold ${alerta ? "text-[var(--stamp)]" : destaque ? "text-[var(--field-strong)]" : ""}`}>{valor}</p><p className="mt-1 text-[11px] leading-snug text-[var(--ink-faint)]">{detalhe}</p></Card>;
}
