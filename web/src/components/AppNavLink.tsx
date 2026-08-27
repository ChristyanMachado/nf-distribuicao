"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
<<<<<<< HEAD
import type { ReactNode } from "react";
=======
import type { ComponentType } from "react";

type Icone = ComponentType<{ className?: string }>;
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d

export default function AppNavLink({
  href,
  label,
<<<<<<< HEAD
  icon,
=======
  Icon,
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
  mobile = false,
}: {
  href: string;
  label: string;
<<<<<<< HEAD
  icon: ReactNode;
=======
  Icon: Icone;
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
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
<<<<<<< HEAD
        <span aria-hidden="true">{icon}</span>
=======
        <span aria-hidden="true"><Icon className="h-5 w-5" /></span>
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
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
<<<<<<< HEAD
        {icon}
=======
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${
            ativo ? "text-[var(--field)]" : "text-[var(--ink-soft)]"
          }`}
        />
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
      </span>
      {label}
    </Link>
  );
}
