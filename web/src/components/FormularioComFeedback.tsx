"use client";

import { useActionState } from "react";
import {
  ESTADO_FORMULARIO_INICIAL,
  type EstadoFormulario,
} from "@/lib/formularios";

type AcaoFormulario = (
  estadoAnterior: EstadoFormulario,
  formData: FormData,
) => Promise<EstadoFormulario>;

export default function FormularioComFeedback({
  action,
  children,
  className,
}: {
  action: AcaoFormulario;
  children: React.ReactNode;
  className?: string;
}) {
  const [estado, acao] = useActionState(action, ESTADO_FORMULARIO_INICIAL);

  return (
    <form action={acao} className={className}>
      {children}
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
