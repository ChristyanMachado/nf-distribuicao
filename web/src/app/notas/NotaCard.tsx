"use client";

import Stamp from "@/components/Stamp";
import { IconShare } from "@/components/icons";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Nota = {
  id: string;
  numero: string | null;
  clienteNome: string;
  status: string;
  valorTotal: string;
  dataEmissao: Date | null;
  pdfPath: string | null;
  xmlPath: string | null;
};

/**
 * RF20/RF21/RF22 — consulta, compartilhamento (Web Share API quando
 * disponível) e impressão via navegador. pdfPath/xmlPath viram URLs
 * assinadas do Supabase Storage quando essa integração entrar (RF19).
 */
export default function NotaCard({ nota }: { nota: Nota }) {
  async function compartilhar() {
    if (!nota.pdfPath) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `NF-e ${nota.numero ?? ""}`,
          text: `Nota fiscal de ${nota.clienteNome}`,
          url: nota.pdfPath,
        });
      } catch {
        // usuário cancelou — sem ação necessária
      }
    } else {
      await navigator.clipboard.writeText(nota.pdfPath);
    }
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            NF-e {nota.numero ?? "—"}
            <span className="ml-2 text-[13px] font-normal text-[var(--ink-soft)]">
              {nota.clienteNome}
            </span>
          </p>
          <p className="font-mono-tab mt-0.5 text-[13px] text-[var(--ink-faint)]">
            {nota.dataEmissao
              ? new Date(nota.dataEmissao).toLocaleDateString("pt-BR")
              : "Sem data"}{" "}
            · {moeda.format(Number(nota.valorTotal))}
          </p>
        </div>
        <Stamp status={nota.status} />
      </div>

      <div className="mt-3 flex gap-2">
        <a
          href={nota.pdfPath ?? "#"}
          download
          className={`tap-target flex flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] text-sm font-medium ${
            nota.pdfPath ? "active:bg-[var(--field-tint)]" : "pointer-events-none opacity-30"
          }`}
        >
          PDF
        </a>
        <a
          href={nota.xmlPath ?? "#"}
          download
          className={`tap-target flex flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] text-sm font-medium ${
            nota.xmlPath ? "active:bg-[var(--field-tint)]" : "pointer-events-none opacity-30"
          }`}
        >
          XML
        </a>
        <button
          onClick={compartilhar}
          disabled={!nota.pdfPath}
          aria-label="Compartilhar"
          className="flex w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] active:bg-[var(--field-tint)] disabled:opacity-30"
        >
          <IconShare className="h-[18px] w-[18px] text-[var(--ink-soft)]" />
        </button>
      </div>

      {!nota.pdfPath && (
        <p className="mt-2 text-[12px] text-[var(--wheat)]">
          Documento ainda não disponível — fora da janela de retenção ou
          aguardando o worker.
        </p>
      )}
    </div>
  );
}
