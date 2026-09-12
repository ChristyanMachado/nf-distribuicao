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

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
  const [mostrarValores, setMostrarValores] = useState(false);
  const [mostrarConferencia, setMostrarConferencia] = useState(true);

  const totalRoteiro = roteiro.reduce(
    (total, parada) => total + parada.itens.reduce((subtotal, item) => subtotal + item.subtotal, 0),
    0
  );
  const opcoesImpressao: Array<{ rotulo: string; ativo: boolean; alternar: () => void }> = [
    { rotulo: "Endereço", ativo: mostrarEndereco, alternar: () => setMostrarEndereco((valor) => !valor) },
    { rotulo: "Trocas", ativo: mostrarTrocas, alternar: () => setMostrarTrocas((valor) => !valor) },
    { rotulo: "Valores", ativo: mostrarValores, alternar: () => setMostrarValores((valor) => !valor) },
    { rotulo: "Conferência", ativo: mostrarConferencia, alternar: () => setMostrarConferencia((valor) => !valor) },
  ];
  const gradeItens = mostrarTrocas
    ? "grid-cols-[minmax(0,1fr)_auto_auto]"
    : "grid-cols-[minmax(0,1fr)_auto]";

  function trocarLote(id: string) {
    window.location.assign(`/entregas?lote=${encodeURIComponent(id)}`);
  }

  function quantidadeNormal(quantidadeDistribuida: number, quantidadeTroca: number) {
    return Number(Math.max(0, quantidadeDistribuida - quantidadeTroca).toFixed(3));
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
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Incluir no roteiro</p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {opcoesImpressao.map(({ rotulo, ativo, alternar }) => (
              <button
                key={String(rotulo)}
                type="button"
                aria-pressed={ativo}
                onClick={alternar}
                className={`min-h-11 rounded-[var(--radius-control)] border px-3 py-2 text-sm ${
                  ativo ? "border-[var(--field)] bg-[var(--field-tint)] text-[var(--field-strong)]" : "border-[var(--line-strong)]"
                }`}
              >
                {ativo ? "✓ " : ""}{rotulo}
              </button>
            ))}
          </div>
        </div>
        <PrimaryButton type="button" onClick={() => window.print()} className="w-full py-2.5 sm:w-auto">
          Imprimir ou salvar em PDF
        </PrimaryButton>
      </div>

      {loteSelecionado && (
        <section className="print-sheet mx-auto mt-6 max-w-xl overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--paper-raised)] shadow-sm">
          <header className="print-route-header bg-[var(--paper)] px-5 pb-4 pt-5">
            <p className="font-mono-tab text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-faint)]">Graalyst · roteiro de entrega</p>
            <h2 className="mt-1 text-3xl font-medium">Distribuição {String(loteSelecionado.numero ?? "—").padStart(6, "0")}</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Entregas de {dataIsoParaBrasil(loteSelecionado.data)} · gerado em {new Date(geradoEm).toLocaleString("pt-BR")} · {roteiro.length} cliente(s)
            </p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>Motorista: <span className="inline-block w-36 border-b border-[var(--ink-soft)]">&nbsp;</span></p>
              <p>Veículo: <span className="inline-block w-28 border-b border-[var(--ink-soft)]">&nbsp;</span></p>
              {mostrarValores && <p className="col-span-2 font-semibold">Valor total: {moeda.format(totalRoteiro)}</p>}
            </div>
          </header>

          <div className="print-route-list space-y-4 bg-[var(--paper)] px-3 py-4 sm:px-5">
            {roteiro.map((parada, indice) => {
              const local = endereco(parada);
              return (
                <Card key={parada.clienteId} className="print-card overflow-hidden bg-[var(--paper-raised)]">
                  <div className="print-stop-header flex items-start gap-3 border-b border-[var(--line)] bg-[var(--field-tint)] px-4 py-3">
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
                    <div className={`grid ${gradeItens} gap-x-3 bg-[var(--cream)] px-4 py-2 font-mono-tab text-[10px] font-bold uppercase tracking-wide text-[var(--ink-faint)]`}>
                      <span>Produto</span>
                      <span className="text-right">Normal</span>
                      {mostrarTrocas && <span className="text-right">Troca</span>}
                    </div>
                    {parada.itens.map((item) => (
                      <div key={`${parada.clienteId}-${item.produtoId}`} className={`print-item grid ${gradeItens} items-center gap-x-3 gap-y-1 px-4 py-3`}>
                        <span className="min-w-0 font-medium leading-snug">{item.produtoDescricao}</span>
                        <span className="font-mono-tab text-right text-base font-bold">{quantidadeNormal(item.quantidadeDistribuida, item.quantidadeTroca)} {item.unidade}</span>
                        {mostrarTrocas && <span className="font-mono-tab text-right text-base font-bold text-[var(--stamp)]">{item.quantidadeTroca > 0 ? `${item.quantidadeTroca} ${item.unidade}` : "—"}</span>}
                        {mostrarValores && <span className={`text-right text-sm font-semibold ${mostrarTrocas ? "col-span-3" : "col-span-2"}`}>{moeda.format(item.subtotal)}</span>}
                      </div>
                    ))}
                  </div>
                  {mostrarConferencia && (
                    <div className="print-check border-t border-[var(--line)] px-4 py-3 text-[12px] text-[var(--ink-soft)]">
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        <span>□ Entregue</span><span>□ Parcial</span><span>□ Não entregue</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <p>Recebido por: <span className="inline-block w-32 border-b border-[var(--line-strong)]">&nbsp;</span></p>
                        <p>Observação: <span className="inline-block w-36 border-b border-[var(--line-strong)]">&nbsp;</span></p>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
