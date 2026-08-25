"use client";

import { useState } from "react";
import Card from "@/components/Card";
import PrimaryButton from "@/components/PrimaryButton";
import type { ParadaEntrega } from "@/lib/entregas";

type Lote = { id: string; data: string; criadoEm: string };

function endereco(parada: ParadaEntrega) {
  const primeiraLinha = [parada.logradouro, parada.numeroEndereco && `nº ${parada.numeroEndereco}`]
    .filter(Boolean)
    .join(", ");
  const segundaLinha = [parada.bairro, [parada.cidade, parada.uf].filter(Boolean).join("/")]
    .filter(Boolean)
    .join(" · ");
  return { primeiraLinha, segundaLinha, cep: parada.cep };
}

export default function RoteiroEntregaView({
  lotes,
  loteSelecionado,
  roteiro,
}: {
  lotes: Lote[];
  loteSelecionado: Lote | null;
  roteiro: ParadaEntrega[];
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
                {lote.data} · criada às {new Date(lote.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMostrarEndereco((valor) => !valor)} className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm">
            {mostrarEndereco ? "✓ " : ""}Endereço
          </button>
          <button type="button" onClick={() => setMostrarTrocas((valor) => !valor)} className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm">
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
            <p className="font-mono-tab text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-faint)]">Graalys · roteiro de entrega</p>
            <h2 className="mt-1 text-3xl font-medium">Entregas do dia {loteSelecionado.data}</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Gerado em {new Date().toLocaleString("pt-BR")} · {roteiro.length} cliente(s)
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
                      {mostrarEndereco && (local.primeiraLinha || local.segundaLinha || local.cep) && (
                        <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
                          {[local.primeiraLinha, local.segundaLinha, local.cep && `CEP ${local.cep}`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-[var(--line)]">
                    {parada.itens.map((item) => (
                      <div key={`${parada.clienteId}-${item.produtoId}`} className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="font-medium">{item.produtoDescricao}</span>
                        <span className="font-mono-tab shrink-0 text-base font-bold">{item.quantidadeDistribuida} {item.unidade}</span>
                        {mostrarTrocas && item.quantidadeTroca > 0 && <span className="shrink-0 text-sm text-[var(--stamp)]">troca: {item.quantidadeTroca} {item.unidade}</span>}
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
