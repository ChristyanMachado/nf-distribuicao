type FieldTextProps = {
  children: React.ReactNode;
  className?: string;
  required?: boolean;
};

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-[var(--wheat)]">
        *
      </span>
      <span className="sr-only"> (obrigatório)</span>
    </>
  );
}

export function Label({
  children,
  className = "",
  required = false,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & FieldTextProps) {
  return (
    <label
      {...props}
      className={`mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] ${className}`}
    >
      {children}
      {required && <RequiredMark />}
    </label>
  );
}

export function Legend({
  children,
  className = "",
  required = false,
  ...props
}: React.HTMLAttributes<HTMLLegendElement> & FieldTextProps) {
  return (
    <legend
      {...props}
      className={`mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] ${className}`}
    >
      {children}
      {required && <RequiredMark />}
    </legend>
  );
}
