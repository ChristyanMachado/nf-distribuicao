"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import Card from "@/components/Card";
import {
  calcularKpis,
  intervaloDoPreset,
  rankearPorCliente,
  rankearPorProduto,
  serieDiaria,
  type ItemRelatorio,
  type PresetPeriodo,
  type TrocaRelatorio,
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
}: {
  itensIniciais: ItemRelatorio[];
  trocasIniciais: TrocaRelatorio[];
}) {
  const [preset, setPreset] = useState<PresetPeriodo>("30dias");
  const [itens, setItens] = useState(itensIniciais);
  const [trocas, setTrocas] = useState(trocasIniciais);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const { inicio, fim } = intervaloDoPreset(preset, new Date());
    startTransition(async () => {
      const dados = await carregarRelatorio(inicio, fim);
      setItens(dados.itens);
      setTrocas(dados.trocas);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const kpis = useMemo(() => calcularKpis(itens, trocas), [itens, trocas]);
  const porCliente = useMemo(() => rankearPorCliente(itens), [itens]);
  const porProduto = useMemo(() => rankearPorProduto(itens), [itens]);
  const serie = useMemo(() => serieDiaria(itens), [itens]);

  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {/* Seletor de período — 1 toque, sem abrir formulário */}
      <div className="mt-5 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => setPreset(p.valor)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              preset === p.valor
                ? "border-[var(--field)] bg-[var(--field-tint)] text-[var(--field-strong)]"
                : "border-[var(--line-strong)] text-[var(--ink-faint)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-[12px] text-[var(--ink-faint)]">Faturamento</p>
          <p className="font-mono-tab mt-1 text-xl font-semibold text-[var(--wheat)]">
            {moeda.format(kpis.faturamentoTotal)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-[var(--ink-faint)]">Notas</p>
          <p className="font-mono-tab mt-1 text-xl font-semibold">{kpis.numeroNotas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] text-[var(--ink-faint)]">Ticket médio</p>
          <p className="font-mono-tab mt-1 text-xl font-semibold">{moeda.format(kpis.ticketMedio)}</p>
        </Card>
        <Card className="p-4 border-[var(--stamp)]">
          <p className="text-[12px] text-[var(--ink-faint)]">Perdido em trocas</p>
          <p className="font-mono-tab mt-1 text-xl font-semibold text-[var(--stamp)]">
            {moeda.format(kpis.perdidoEmTrocas)}
          </p>
        </Card>
      </div>

      {/* Gráfico de faturamento por dia */}
      {serie.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="mb-2 text-[13px] font-medium text-[var(--ink-soft)]">Faturamento por dia</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="data"
                tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                tick={{ fontSize: 11, fill: "#9a9c8c" }}
                axisLine={{ stroke: "#e4ddcb" }}
                tickLine={false}
              />
              <Tooltip
                formatter={(valor) => moeda.format(Number(valor))}
                labelFormatter={(d) => String(d).split("-").reverse().join("/")}
                contentStyle={{ fontSize: 13, borderRadius: 8, borderColor: "#e4ddcb" }}
              />
              <Bar dataKey="valor" fill="#38583f" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
  );
}

function BarraRanking({ nome, valor, maximo }: { nome: string; valor: number; maximo: number }) {
  const largura = Math.max(4, Math.round((valor / maximo) * 100));
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{nome}</span>
        <span className="font-mono-tab text-[var(--wheat)]">{moedaCompacta.format(valor)}</span>
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
