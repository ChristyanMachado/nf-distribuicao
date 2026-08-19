export default function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--paper-raised)] ${className}`}
    >
      {children}
    </div>
  );
}
