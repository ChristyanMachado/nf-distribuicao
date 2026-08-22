"use client";

import { useState, useTransition } from "react";
import Stamp from "@/components/Stamp";
import { cancelarTarefa } from "./actions";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Item = {
  produtoDescricao: string;
  quantidade: string;
  precoUnitario: string;
  subtotal: string;
};

type Tarefa = {
  id: string;
  data: string;
  status: string;
  valorTotal: string;
  clienteNome: string;
  emitenteNome: string;
  itens: Item[];
};

export default function TarefaCard({ tarefa }: { tarefa: Tarefa }) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-4 py-3.5">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="font-medium">
            {tarefa.clienteNome}
            <span className="ml-1.5 text-[var(--ink-faint)]">
              {aberto ? "▾" : "▸"}
            </span>
          </p>
          <p className="font-mono-tab text-[13px] text-[var(--ink-faint)]">
            {tarefa.data} · {tarefa.itens.length} item(ns)
          </p>
          <p className="text-[12px] text-[var(--ink-faint)]">emitente: {tarefa.emitenteNome}</p>
        </div>
        <div className="text-right">
          <Stamp status={tarefa.status} />
          <p className="font-mono-tab mt-1 text-[13px] text-[var(--ink-soft)]">
            {moeda.format(Number(tarefa.valorTotal))}
          </p>
        </div>
      </button>

      {aberto && (
        <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
          {tarefa.itens.map((item, i) => (
            <div key={i} className="flex justify-between text-[13px]">
              <span>
                {item.produtoDescricao}{" "}
                <span className="text-[var(--ink-faint)]">× {item.quantidade}</span>
              </span>
              <span className="font-mono-tab text-[var(--ink-soft)]">
                {moeda.format(Number(item.subtotal))}
              </span>
            </div>
          ))}

          {tarefa.status === "PENDENTE" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => cancelarTarefa(tarefa.id))}
              className="mt-2 text-[13px] text-[var(--stamp)] disabled:opacity-40"
            >
              {pending ? "Cancelando…" : "Cancelar tarefa"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
