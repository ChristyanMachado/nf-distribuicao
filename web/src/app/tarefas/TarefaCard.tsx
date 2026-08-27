"use client";

import { useState, useTransition } from "react";
import Stamp from "@/components/Stamp";
import { cancelarTarefa } from "./actions";
import { dataIsoParaBrasil } from "@/lib/datas";

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
  tentativas: number;
  reservaExpiraEm: Date | null;
  ultimoErro: string | null;
  mensagemStatus: string | null;
  valorTotal: string;
  numeroDistribuicao: number | null;
  clienteNome: string;
  emitenteNome: string;
  itens: Item[];
};

export default function TarefaCard({ tarefa }: { tarefa: Tarefa }) {
  const [aberto, setAberto] = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-4 py-3.5">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-controls={`detalhes-tarefa-${tarefa.id}`}
        className="tap-target flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="font-medium">
            {tarefa.clienteNome}
            <span className="ml-1.5 text-[var(--ink-faint)]">
              {aberto ? "▾" : "▸"}
            </span>
          </p>
          <p className="font-mono-tab text-[13px] text-[var(--ink-faint)]">
            {dataIsoParaBrasil(tarefa.data)} · {tarefa.itens.length} item(ns)
          </p>
          <p className="text-[12px] text-[var(--ink-faint)]">
            {tarefa.numeroDistribuicao
              ? `Distribuição ${String(tarefa.numeroDistribuicao).padStart(6, "0")} · `
              : ""}
            emitente: {tarefa.emitenteNome}
          </p>
        </div>
        <div className="text-right">
          <Stamp status={tarefa.status} />
          <p className="font-mono-tab mt-1 text-[13px] text-[var(--ink-soft)]">
            {moeda.format(Number(tarefa.valorTotal))}
          </p>
        </div>
      </button>

      {aberto && (
        <div
          id={`detalhes-tarefa-${tarefa.id}`}
          className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3"
        >
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
              onClick={() => {
                setErroCancelamento(null);
                startTransition(async () => {
                  const resultado = await cancelarTarefa(tarefa.id);
                  setErroCancelamento(resultado.erro ?? null);
                });
              }}
              className="mt-2 text-[13px] text-[var(--stamp)] disabled:opacity-40"
            >
              {pending ? "Cancelando…" : "Cancelar tarefa"}
            </button>
          )}
          {erroCancelamento && (
            <p role="alert" className="mt-2 text-[12px] text-[var(--stamp)]">
              {erroCancelamento}
            </p>
          )}

          {tarefa.status !== "PENDENTE" && (
            <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
              Tentativa{tarefa.tentativas === 1 ? "" : "s"}: {tarefa.tentativas}
              {tarefa.reservaExpiraEm
                ? ` · reserva até ${new Date(tarefa.reservaExpiraEm).toLocaleString("pt-BR")}`
                : ""}
            </p>
          )}
          {tarefa.ultimoErro && (
            <p className="mt-1 text-[12px] text-[var(--stamp)]">{tarefa.ultimoErro}</p>
          )}
          {!tarefa.ultimoErro && tarefa.mensagemStatus && (
            <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
              {tarefa.mensagemStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
