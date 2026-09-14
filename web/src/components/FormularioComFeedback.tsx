"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ESTADO_FORMULARIO_INICIAL,
  type EstadoFormulario,
} from "@/lib/formularios";

type AcaoFormulario = (
  estadoAnterior: EstadoFormulario,
  formData: FormData,
) => Promise<EstadoFormulario>;

function AvisoEnvioDemorado({ mensagem }: { mensagem: string }) {
  const { pending } = useFormStatus();
  const [demorado, setDemorado] = useState(false);

  useEffect(() => {
    if (!pending) {
      setDemorado(false);
      return;
    }
    const temporizador = window.setTimeout(() => setDemorado(true), 12_000);
    return () => window.clearTimeout(temporizador);
  }, [pending]);

  if (!pending || !demorado) return null;
  return (
    <p role="status" aria-live="polite" className="sm:col-span-2 rounded-[var(--radius-control)] border border-[var(--wheat)] bg-[var(--cream)] px-3 py-2 text-sm text-[var(--ink)]">
      {mensagem}
    </p>
  );
}

export default function FormularioComFeedback({
  action,
  children,
  className,
  confirmMessage,
  slowMessage,
}: {
  action: AcaoFormulario;
  children: React.ReactNode;
  className?: string;
  confirmMessage?: string;
  slowMessage?: string;
}) {
  const [estado, acao] = useActionState(action, ESTADO_FORMULARIO_INICIAL);

  return (
    <form
      action={acao}
      className={className}
      onSubmit={(evento) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          evento.preventDefault();
        }
      }}
    >
      {children}
      {slowMessage && <AvisoEnvioDemorado mensagem={slowMessage} />}
      {estado.erro && (
        <p
          role="alert"
          aria-live="assertive"
          className="sm:col-span-2 rounded-[var(--radius-control)] border border-[var(--stamp)] bg-[var(--stamp-tint)] px-3 py-2 text-sm text-[var(--stamp)]"
        >
          {estado.erro}
        </p>
      )}
    </form>
  );
}
