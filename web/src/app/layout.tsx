import type { Metadata, Viewport } from "next";
import "./globals.css";
import {
  IconHome,
  IconUsers,
  IconBuilding,
  IconCrate,
  IconScale,
  IconList,
  IconReceipt,
  IconChart,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Distribuição & Notas",
  description: "Distribuição de produtos e emissão de notas fiscais",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf8f2",
};

const NAV_ITEMS = [
  { href: "/", label: "Início", Icon: IconHome },
  { href: "/distribuicao", label: "Distribuir", Icon: IconScale },
  { href: "/tarefas", label: "Tarefas", Icon: IconList },
  { href: "/notas", label: "Notas", Icon: IconReceipt },
  { href: "/relatorios", label: "Relatórios", Icon: IconChart },
  { href: "/entregas", label: "Entregas", Icon: IconReceipt },
];

const NAV_ITEMS_SECUNDARIOS = [
  { href: "/clientes", label: "Clientes", Icon: IconUsers },
  { href: "/emitentes", label: "Emitentes", Icon: IconBuilding },
  { href: "/produtos", label: "Produtos", Icon: IconCrate },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-dvh flex-col md:flex-row">
          {/* Desktop: rail lateral fixo */}
          <aside className="hidden w-60 shrink-0 border-r border-[var(--line)] px-4 py-6 md:block">
            <p className="mb-6 px-2 font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
              Distribuição · NF
            </p>
            <nav className="flex flex-col gap-1">
              {[...NAV_ITEMS, ...NAV_ITEMS_SECUNDARIOS].map(
                ({ href, label, Icon }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-sm text-[var(--ink)] hover:bg-[var(--field-tint)]"
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--ink-soft)]" />
                    {label}
                  </a>
                )
              )}
            </nav>
          </aside>

          {/* Mobile: header curto só pra orientação, sem custar clique */}
          <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 md:hidden">
            <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
              Distribuição · NF
            </p>
            <a
              href="/clientes"
              className="font-mono-tab text-[11px] uppercase tracking-wide text-[var(--ink-soft)]"
            >
              Cadastros ›
            </a>
          </header>

          <main className="flex-1 px-4 py-6 pb-24 md:px-10 md:py-10 md:pb-10">
            <div className="mx-auto max-w-3xl">{children}</div>
          </main>
        </div>

        {/* Mobile: barra inferior fixa, alcançável com o polegar */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--line)] bg-[var(--paper-raised)] md:hidden">
          {NAV_ITEMS.map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[var(--ink-soft)] active:bg-[var(--field-tint)]"
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </a>
          ))}
        </nav>
      </body>
    </html>
  );
}
