const STAMP_CONFIG: Record<
  string,
  { label: string; tone: "field" | "stamp" | "wheat" | "neutral" }
> = {
  PENDENTE: { label: "Pendente", tone: "neutral" },
  PROCESSANDO: { label: "Processando", tone: "wheat" },
  AGUARDANDO_CONFERENCIA: { label: "Conferir", tone: "stamp" },
  EMITINDO: { label: "Emitindo", tone: "wheat" },
  EMITIDA: { label: "Emitida", tone: "field" },
  DOCUMENTOS_ARMAZENADOS: { label: "Armazenada", tone: "field" },
  ERRO: { label: "Erro", tone: "stamp" },
  AUTORIZADA: { label: "Autorizada", tone: "field" },
  REJEITADA: { label: "Rejeitada", tone: "stamp" },
  AGUARDANDO_EMISSAO: { label: "Aguardando", tone: "neutral" },
};

const TONE_STYLES: Record<string, string> = {
  field: "text-[var(--field-strong)] border-[var(--field)] bg-[var(--field-tint)]",
  stamp: "text-[var(--stamp)] border-[var(--stamp)] bg-[var(--stamp-tint)]",
  wheat: "text-[var(--wheat)] border-[var(--wheat)] bg-[var(--wheat-tint)]",
  neutral: "text-[var(--ink-soft)] border-[var(--line-strong)] bg-transparent",
};

/**
 * "Carimbo" — elemento de assinatura visual do sistema. Remete ao carimbo
 * de autenticação de um documento fiscal real: bordas grossas, leve
 * rotação, tipografia monoespaçada em caixa alta.
 */
export default function Stamp({ status }: { status: string }) {
  const config = STAMP_CONFIG[status] ?? { label: status, tone: "neutral" };
  return (
    <span
      className={`font-mono-tab inline-block -rotate-2 whitespace-nowrap rounded-[3px] border-[1.5px] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TONE_STYLES[config.tone]}`}
    >
      {config.label}
    </span>
  );
}
