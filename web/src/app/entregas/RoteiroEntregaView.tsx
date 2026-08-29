"use client";

import { useState } from "react";
import Card from "@/components/Card";
import PrimaryButton from "@/components/PrimaryButton";
import type { ParadaEntrega } from "@/lib/entregas";
import { dataIsoParaBrasil } from "@/lib/datas";

type Lote = { id: string; numero: number | null; data: string; criadoEm: string };

function endereco(parada: ParadaEntrega) {
  return [parada.cep && `CEP ${parada.cep}`, parada.numeroEndereco && `nº ${parada.numeroEndereco}`]
    .filter(Boolean)
    .join(" · ");
}

export default function RoteiroEntregaView({
  lotes,
  loteSelecionado,
  roteiro,
  geradoEm,
}: {
  lotes: Lote[];
  loteSelecionado: Lote | null;
  roteiro: ParadaEntrega[];
  geradoEm: string;
}) {
  const [mostrarEndereco, setMostrarEndereco] = useState(true);
  const [mostrarTrocas, setMostrarTrocas] = useState(true);

  function trocarLote(id: string) {
    window.location.assign(`/entregas?lote=${encodeURIComponent(id)}`);
  }

  return (
    <div className="pb-24">
      <div className="no-print mt-5 space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          Distribuição
          <select
            className="mt-1 w-full"
            value={loteSelecionado?.id ?? ""}
            onChange={(event) => trocarLote(event.target.value)}
          >
            {lotes.map((lote) => (
              <option key={lote.id} value={lote.id}>
                Distribuição {String(lote.numero ?? "—").padStart(6, "0")} · {dataIsoParaBrasil(lote.data)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={mostrarEndereco} onClick={() => setMostrarEndereco((valor) => !valor)} className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm">
            {mostrarEndereco ? "✓ " : ""}Endereço
          </button>
          <button type="button" aria-pressed={mostrarTrocas} onClick={() => setMostrarTrocas((valor) => !valor)} className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm">
            {mostrarTrocas ? "✓ " : ""}Trocas
          </button>
        </div>
        <PrimaryButton type="button" onClick={() => window.print()} className="w-full py-2.5 sm:w-auto">
          Imprimir roteiro
        </PrimaryButton>
      </div>

      {loteSelecionado && (
        <section className="print-sheet mt-6">
          <header className="border-b-2 border-[var(--ink)] pb-4">
            <p className="font-mono-tab text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-faint)]">Graalyst · roteiro de entrega</p>
            <h2 className="mt-1 text-3xl font-medium">Distribuição {String(loteSelecionado.numero ?? "—").padStart(6, "0")}</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Entregas de {dataIsoParaBrasil(loteSelecionado.data)} · gerado em {new Date(geradoEm).toLocaleString("pt-BR")} · {roteiro.length} cliente(s)
            </p>
          </header>

          <div className="mt-5 space-y-4">
            {roteiro.map((parada, indice) => {
              const local = endereco(parada);
              return (
                <Card key={parada.clienteId} className="print-card overflow-hidden">
                  <div className="flex items-start gap-3 border-b border-[var(--line)] bg-[var(--field-tint)] px-4 py-3">
                    <span className="font-mono-tab flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--field)] text-sm font-bold text-white">{indice + 1}</span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-medium">{parada.clienteNome}</h3>
                      {mostrarEndereco && local && (
                        <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
                          {local}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-[var(--line)]">
                    {parada.itens.map((item) => (
                      <div key={`${parada.clienteId}-${item.produtoId}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:flex sm:justify-between">
                        <span className="font-medium">{item.produtoDescricao}</span>
                        <span className="font-mono-tab shrink-0 text-base font-bold">{item.quantidadeDistribuida} {item.unidade}</span>
                        {mostrarTrocas && item.quantidadeTroca > 0 && <span className="col-span-2 shrink-0 text-sm text-[var(--stamp)] sm:col-span-1">troca: {item.quantidadeTroca} {item.unidade}</span>}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
