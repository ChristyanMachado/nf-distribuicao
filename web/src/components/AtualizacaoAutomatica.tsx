"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

const INTERVALO_MS = 10_000;

export default function AtualizacaoAutomatica({
  ativa,
  descricao = "Acompanhando atualizações automaticamente",
}: {
  ativa: boolean;
  descricao?: string;
}) {
  const router = useRouter();
  const [atualizando, iniciarAtualizacao] = useTransition();

  useEffect(() => {
    if (!ativa) return;

    const atualizar = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || atualizando) return;
      iniciarAtualizacao(() => router.refresh());
    };
    const intervalo = window.setInterval(atualizar, INTERVALO_MS);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [ativa, router, atualizando]);

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
