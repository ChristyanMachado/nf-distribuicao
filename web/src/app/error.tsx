"use client";

import Card from "@/components/Card";

export default function ErroAplicacao({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-8">
      <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--stamp)]">
        Serviço temporariamente indisponível
      </p>
      <h1 className="mt-2 text-2xl font-medium">Não foi possível carregar esta tela.</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
        Seus dados não foram enviados novamente. Verifique a conexão e tente
        recarregar; se o problema continuar, consulte as tarefas antes de
        repetir uma distribuição.
      </p>
      <Card className="mt-5 p-4">
        <button
          type="button"
          onClick={reset}
          className="tap-target min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--field)] px-4 font-semibold text-white sm:w-auto"
        >
          Tentar novamente
        </button>
        <a
          href="/tarefas"
          className="tap-target mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)] px-4 font-semibold text-[var(--field-strong)] sm:ml-2 sm:mt-0 sm:w-auto"
        >
          Conferir tarefas
        </a>
      </Card>
    </div>
  );
}
