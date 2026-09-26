"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/Field";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import PrimaryButton from "@/components/PrimaryButton";
import { ajustarSaldoTroca } from "./actions";

type Saldo = {
  id: string;
  clienteNome: string;
  produtoDescricao: string;
  quantidadeDisponivel: string;
  unidade: string;
};

export default function SaldoTrocaPendente({ saldo }: { saldo: Saldo }) {
  const [chaves, setChaves] = useState({ ajuste: "", zerar: "" });
  useEffect(() => {
    setChaves({ ajuste: crypto.randomUUID(), zerar: crypto.randomUUID() });
  }, []);

  const comuns = <>
    <input type="hidden" name="saldoId" value={saldo.id} />
    <input type="hidden" name="quantidadeAntes" value={saldo.quantidadeDisponivel} />
  </>;
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-medium">{saldo.clienteNome}</p><p className="text-[12px] text-[var(--ink-faint)]">{saldo.produtoDescricao}</p></div>
        <span className="font-mono-tab text-right text-[var(--field-strong)]">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--ink-faint)]">A repor</span>
          {saldo.quantidadeDisponivel} {saldo.unidade}
        </span>
      </div>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--field)]">Corrigir pendente</summary>
        <p className="mb-3 text-xs text-[var(--ink-soft)]">Altera apenas o saldo ainda pendente. Reposições já usadas continuam no histórico.</p>
        <FormularioComFeedback action={ajustarSaldoTroca} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          {comuns}
          <input type="hidden" name="chaveIdempotencia" value={chaves.ajuste} />
          <div>
            <Label htmlFor={`saldo-novo-${saldo.id}`} required>Novo saldo pendente</Label>
            <input id={`saldo-novo-${saldo.id}`} type="number" name="quantidadeDepois" required min="0" max="999999999.999" step="0.001" inputMode="decimal" defaultValue={saldo.quantidadeDisponivel} className="font-mono-tab w-full" />
          </div>
          <PrimaryButton type="submit" disabled={!chaves.ajuste} pendingText="Ajustando…" className="w-full sm:w-auto">Salvar ajuste</PrimaryButton>
        </FormularioComFeedback>
        <FormularioComFeedback
          action={ajustarSaldoTroca}
          className="mt-3"
          confirmMessage={`Zerar o saldo pendente de ${saldo.produtoDescricao} para ${saldo.clienteNome}? O histórico já utilizado será preservado.`}
        >
          {comuns}
          <input type="hidden" name="chaveIdempotencia" value={chaves.zerar} />
          <input type="hidden" name="quantidadeDepois" value="0" />
          <button type="submit" disabled={!chaves.zerar} className="min-h-11 rounded-[var(--radius-control)] border border-[var(--stamp)] px-4 text-sm font-medium text-[var(--stamp)] disabled:opacity-40">
            Zerar pendente
          </button>
        </FormularioComFeedback>
      </details>
    </div>
  );
}
