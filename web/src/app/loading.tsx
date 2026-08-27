export default function CarregandoAplicacao() {
  return (
    <div aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando dados da operação</span>
      <div className="h-4 w-28 animate-pulse rounded bg-[var(--field-tint)]" />
      <div className="mt-3 h-9 w-56 animate-pulse rounded bg-[var(--field-tint)]" />
      <div className="mt-7 h-20 animate-pulse rounded-[var(--radius-card)] bg-[var(--field-tint)]" />
      <div className="mt-5 h-36 animate-pulse rounded-[var(--radius-card)] bg-[var(--field-tint)]" />
    </div>
  );
}
