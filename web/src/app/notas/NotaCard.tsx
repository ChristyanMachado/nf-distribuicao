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
import { solicitarCancelamentoFiscal, solicitarRecuperacaoDocumento } from "./actions";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Nota = {
  id: string;
  numero: string | null;
  clienteNome: string;
  emitenteNome: string;
  status: string;
  valorTotal: string;
  dataEmissao: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  temChaveFiscal: boolean;
  podeRecuperar: boolean;
  recuperacaoStatus: StatusRecuperacaoDocumento | null;
  recuperacaoMensagem: string | null;
  podeCancelar: boolean;
  cancelamentoStatus: "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO" | "AGUARDANDO_CONFERENCIA" | null;
  cancelamentoMensagem: string | null;
  cancelamentoMotivo: string | null;
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
  const cancelando = nota.cancelamentoStatus === "PENDENTE" || nota.cancelamentoStatus === "PROCESSANDO";

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
          <p className="mt-0.5 truncate text-[12px] text-[var(--ink-soft)]" title={nota.emitenteNome}>
            Emitente: {nota.emitenteNome}
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

      {nota.cancelamentoStatus === "CONCLUIDO" && (
        <div role="status" className="mt-3 rounded-[var(--radius-control)] border border-[var(--stamp)]/35 bg-[var(--stamp-tint)] px-3 py-2 text-sm">
          <p className="font-medium text-[var(--stamp)]">Nota fiscal cancelada</p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
            Cancelamento confirmado pela Receita
            {nota.cancelamentoMotivo ? ` · Motivo: ${nota.cancelamentoMotivo}` : "."}
          </p>
        </div>
      )}

      {cancelando && (
        <div role="status" aria-live="polite" className="mt-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--field-tint)] px-3 py-2.5">
          <p className="text-sm font-medium">
            {nota.cancelamentoStatus === "PROCESSANDO" ? "Cancelando nota…" : "Cancelamento solicitado"}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">Pode sair desta tela. O status será atualizado pelo Worker.</p>
        </div>
      )}

      {nota.cancelamentoStatus === "AGUARDANDO_CONFERENCIA" && (
        <p role="alert" className="mt-3 rounded-[var(--radius-control)] border border-[var(--stamp)] bg-[var(--stamp-tint)] px-3 py-2 text-sm text-[var(--stamp)]">
          {nota.cancelamentoMensagem ?? "O resultado do cancelamento precisa ser conferido na Receita. Chame o suporte."}
        </p>
      )}

      {nota.podeCancelar && !cancelando && nota.cancelamentoStatus !== "CONCLUIDO" && nota.cancelamentoStatus !== "AGUARDANDO_CONFERENCIA" && (
        <details className="mt-3 rounded-[var(--radius-control)] border border-[var(--line)] px-3 py-2">
          <summary className="tap-target flex cursor-pointer list-none items-center text-sm font-medium text-[var(--stamp)]">
            Cancelar esta nota
          </summary>
          <FormularioComFeedback
            action={solicitarCancelamentoFiscal}
            className="mt-2 space-y-2"
            confirmMessage="Confirmar o pedido de cancelamento desta nota? O Worker executará a operação no portal fiscal."
          >
            <input type="hidden" name="notaId" value={nota.id} />
            {nota.cancelamentoStatus === "ERRO" && (
              <p className="text-[12px] text-[var(--stamp)]">
                {nota.cancelamentoMensagem ?? "A tentativa anterior não foi concluída. Revise o motivo antes de tentar novamente."}
              </p>
            )}
            <label className="block text-[12px] font-medium text-[var(--ink-soft)]" htmlFor={`motivo-${nota.id}`}>
              Motivo do cancelamento
            </label>
            <textarea
              id={`motivo-${nota.id}`}
              name="motivo"
              defaultValue={nota.cancelamentoMotivo ?? "Dados incorretos"}
              maxLength={255}
              required
              rows={3}
              className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ink)]"
            />
            <PrimaryButton type="submit" pendingText="Solicitando cancelamento…" className="w-full py-2.5">
              Confirmar cancelamento
            </PrimaryButton>
            <p className="text-[11px] text-[var(--ink-faint)]">A Receita confirmará se a nota ainda pode ser cancelada. Nenhum prazo é presumido pelo sistema.</p>
          </FormularioComFeedback>
        </details>
      )}

      {nota.status === "CANCELADA" && !documentosDisponiveis && (
        <p className="mt-3 text-[12px] text-[var(--ink-soft)]">
          Os arquivos não estão armazenados no momento.
          {nota.temChaveFiscal
            ? " A chave fiscal permanece preservada no histórico."
            : " A identificação fiscal precisa de conferência técnica."}
        </p>
      )}
    </div>
  );
}
