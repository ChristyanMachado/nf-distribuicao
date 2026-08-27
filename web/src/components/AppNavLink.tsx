"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppNavLink({
  href,
  label,
  icon,
  mobile = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  mobile?: boolean;
}) {
  const caminho = usePathname();
  const ativo = href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(`${href}/`);

  if (mobile) {
    return (
      <Link
        href={href}
        aria-current={ativo ? "page" : undefined}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors active:bg-[var(--field-tint)] ${
          ativo ? "text-[var(--field-strong)]" : "text-[var(--ink-soft)]"
        }`}
      >
        <span aria-hidden="true">{icon}</span>
        <span className="text-[10px] font-medium">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`flex min-h-11 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-sm transition-colors ${
        ativo
          ? "bg-[var(--field-tint)] font-medium text-[var(--field-strong)]"
          : "text-[var(--ink)] hover:bg-[var(--field-tint)]"
      }`}
    >
      <span aria-hidden="true">
        {icon}
      </span>
      {label}
    </Link>
  );
}
