import type { ComponentPropsWithoutRef } from "react";

type CardProps = ComponentPropsWithoutRef<"div">;

export default function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      {...props}
      className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--paper-raised)] ${className}`}
    >
      {children}
    </div>
  );
}
