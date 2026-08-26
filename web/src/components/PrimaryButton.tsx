"use client";

import { useFormStatus } from "react-dom";

export default function PrimaryButton({
  children,
  className = "",
  disabled,
  pendingText = "Salvando…",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  const indisponivel = disabled || pending;

  return (
    <button
      {...props}
      disabled={indisponivel}
      aria-busy={pending || undefined}
      className={`min-h-11 rounded-[var(--radius-control)] bg-[var(--field)] px-5 font-medium text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <span aria-live="polite">{pending ? pendingText : children}</span>
    </button>
  );
}
