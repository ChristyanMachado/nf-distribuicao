"use client";

import Stamp from "@/components/Stamp";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import PrimaryButton from "@/components/PrimaryButton";
import { IconShare } from "@/components/icons";
import {
  recuperacaoEmAndamento,
  type StatusRecuperacaoDocumento,
} from "@/lib/documentos-nota";
import { urlHttpsSegura } from "@/lib/urls";
import { solicitarRecuperacaoDocumento } from "./actions";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Nota = {
  id: string;
  numero: string | null;
  clienteNome: string;
  status: string;
  valorTotal: string;
  dataEmissao: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  podeRecuperar: boolean;
  recuperacaoStatus: StatusRecuperacaoDocumento | null;
  recuperacaoMensagem: string | null;
};

/**
 * RF20/RF21/RF22 — consulta, compartilhamento (Web Share API quando
 * disponível) e impressão via navegador. pdfPath/xmlPath viram URLs
 * assinadas do Supabase Storage quando essa integração entrar (RF19).
 */
export default function NotaCard({ nota }: { nota: Nota }) {
  const pdfUrl = urlHttpsSegura(nota.pdfUrl);
  const xmlUrl = urlHttpsSegura(nota.xmlUrl);
  const documentosDisponiveis = Boolean(pdfUrl && xmlUrl);
  const recuperando = recuperacaoEmAndamento(nota.recuperacaoStatus);

  async function compartilhar() {
    if (!pdfUrl) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `NF-e ${nota.numero ?? ""}`,
          text: `Nota fiscal de ${nota.clienteNome}`,
          url: pdfUrl,
        });
      } catch {
        // usuário cancelou — sem ação necessária
      }
    } else {
      await navigator.clipboard.writeText(pdfUrl);
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

      {documentosDisponiveis && <div className="mt-3 flex gap-2">
        <a
          href={pdfUrl ?? "#"}
          download
          className={`tap-target flex flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] text-sm font-medium ${
            pdfUrl ? "active:bg-[var(--field-tint)]" : "pointer-events-none opacity-30"
          }`}
        >
          PDF
        </a>
        <a
          href={xmlUrl ?? "#"}
          download
          className={`tap-target flex flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] text-sm font-medium ${
            xmlUrl ? "active:bg-[var(--field-tint)]" : "pointer-events-none opacity-30"
          }`}
        >
          XML
        </a>
        <button
          onClick={compartilhar}
          disabled={!pdfUrl}
          aria-label="Compartilhar"
          className="flex w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] active:bg-[var(--field-tint)] disabled:opacity-30"
        >
          <IconShare className="h-[18px] w-[18px] text-[var(--ink-soft)]" />
        </button>
      </div>}

      {!documentosDisponiveis && recuperando && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--field-tint)] px-3 py-2.5"
        >
          <p className="text-sm font-medium">
            {nota.recuperacaoStatus === "PROCESSANDO"
              ? "Recuperando documentos…"
              : "Recuperação solicitada"}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
            Pode sair desta tela. Os botões reaparecerão quando o Worker concluir.
          </p>
        </div>
      )}

      {!documentosDisponiveis && !recuperando && nota.podeRecuperar && (
        <FormularioComFeedback action={solicitarRecuperacaoDocumento} className="mt-3">
          <input type="hidden" name="notaId" value={nota.id} />
          {nota.recuperacaoStatus === "ERRO" && (
            <p className="mb-2 text-[12px] text-[var(--stamp)]">
              {nota.recuperacaoMensagem
                ?? "A tentativa anterior não foi concluída. Você pode tentar novamente."}
            </p>
          )}
          <PrimaryButton
            type="submit"
            pendingText="Solicitando recuperação…"
            className="w-full py-2.5"
          >
            {nota.recuperacaoStatus === "ERRO"
              ? "Tentar recuperar novamente"
              : "Recuperar PDF e XML"}
          </PrimaryButton>
          <p className="mt-1.5 text-center text-[11px] text-[var(--ink-faint)]">
            Os arquivos recuperados ficam disponíveis por 7 dias.
          </p>
        </FormularioComFeedback>
      )}

      {!documentosDisponiveis && !recuperando && !nota.podeRecuperar && (
        <p className="mt-2 text-[12px] text-[var(--stamp)]">
          A chave fiscal desta nota não está disponível. Chame o suporte para conferir.
        </p>
      )}
    </div>
  );
}
