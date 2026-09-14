"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

export default function AtualizacaoAutomatica({
  ativa,
  descricao = "Acompanhando atualizações automaticamente",
  intervaloMs = 10_000,
}: {
  ativa: boolean;
  descricao?: string;
  intervaloMs?: 10_000 | 30_000;
}) {
  const router = useRouter();
  const [atualizando, iniciarAtualizacao] = useTransition();
  const atualizacaoEmVoo = useRef(false);

  useEffect(() => {
    if (!atualizando) atualizacaoEmVoo.current = false;
  }, [atualizando]);

  useEffect(() => {
    if (!ativa) return;

    const atualizar = () => {
      if (
        document.visibilityState !== "visible"
        || !navigator.onLine
        || atualizacaoEmVoo.current
      ) return;
      atualizacaoEmVoo.current = true;
      iniciarAtualizacao(() => router.refresh());
    };
    const intervalo = window.setInterval(atualizar, intervaloMs);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [ativa, router, intervaloMs]);

  if (!ativa) return null;

  return (
    <p
      aria-live="polite"
      className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ink-faint)]"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full bg-[var(--field)] ${atualizando ? "animate-pulse" : ""}`}
      />
      {atualizando ? "Atualizando andamento…" : descricao}
    </p>
  );
}
