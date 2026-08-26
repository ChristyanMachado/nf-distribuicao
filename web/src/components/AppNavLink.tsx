"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

type Icone = ComponentType<{ className?: string }>;

export default function AppNavLink({
  href,
  label,
  Icon,
  mobile = false,
}: {
  href: string;
  label: string;
  Icon: Icone;
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
        <span aria-hidden="true"><Icon className="h-5 w-5" /></span>
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
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${
            ativo ? "text-[var(--field)]" : "text-[var(--ink-soft)]"
          }`}
        />
      </span>
      {label}
    </Link>
  );
}
