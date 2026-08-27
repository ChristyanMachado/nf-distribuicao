"use client";

import { useEffect, useRef, useState } from "react";
import { sair } from "@/app/login/actions";

const LIMITE_INATIVIDADE_MS = 30 * 60 * 1000;

export default function IdleLock() {
  const [bloqueando, setBloqueando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    function agendar() {
      if (bloqueando) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setBloqueando(true); // cobre os dados antes mesmo da resposta do servidor
        await sair();
      }, LIMITE_INATIVIDADE_MS);
    }
    const eventos = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    eventos.forEach((evento) => window.addEventListener(evento, agendar, { passive: true }));
    agendar();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      eventos.forEach((evento) => window.removeEventListener(evento, agendar));
    };
  }, [bloqueando]);
  if (!bloqueando) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--field-strong)] px-6 text-center text-white" role="alert"><div><p className="text-lg font-semibold">Sessão bloqueada</p><p className="mt-2 text-sm text-white/75">Protegendo os dados administrativos…</p></div></div>;
}
