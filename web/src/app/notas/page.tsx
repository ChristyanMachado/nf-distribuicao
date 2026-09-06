export const dynamic = "force-dynamic";

import { db } from "@/db";
import {
  notas,
  clientes,
  emitentes,
  tarefas,
  lotesDistribuicao,
  recuperacoesDocumentos,
  cancelamentosFiscais,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import Card from "@/components/Card";
import AtualizacaoAutomatica from "@/components/AtualizacaoAutomatica";
import NotaCard from "./NotaCard";
import { assinarDocumentosPrivados } from "@/lib/storage.server";
import { nomeDownloadDocumento } from "@/lib/storage-caminhos";
import { documentosDaNotaDisponiveis } from "@/lib/documentos-nota";
import {
  agruparNotasPorDistribuicao,
  normalizarVisaoNotas,
  visaoDaNota,
  type VisaoNotas,
} from "@/lib/notas-visao";
import { dataIsoParaBrasil } from "@/lib/datas";

const ABAS: { id: VisaoNotas; label: string }[] = [
  { id: "ativas", label: "Ativas" },
  { id: "canceladas", label: "Canceladas" },
];

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string }>;
}) {
  const [parametros, lista] = await Promise.all([
    searchParams,
    db.select({
      id: notas.id,
      numero: notas.numero,
      status: notas.status,
      valorTotal: notas.valorTotal,
      dataEmissao: notas.dataEmissao,
      pdfPath: notas.pdfPath,
      xmlPath: notas.xmlPath,
      documentoExpiraEm: notas.documentoExpiraEm,
      chaveAcesso: notas.chaveAcesso,
      recuperacaoStatus: recuperacoesDocumentos.status,
      recuperacaoMensagem: recuperacoesDocumentos.mensagemStatus,
      cancelamentoStatus: cancelamentosFiscais.status,
      cancelamentoMensagem: cancelamentosFiscais.mensagemStatus,
      cancelamentoMotivo: cancelamentosFiscais.motivo,
      clienteNome: clientes.nome,
      emitenteNome: emitentes.nome,
      loteId: tarefas.loteId,
      numeroDistribuicao: lotesDistribuicao.numero,
      dataDistribuicao: lotesDistribuicao.data,
      })
      .from(notas)
      .innerJoin(clientes, eq(notas.clienteId, clientes.id))
      .innerJoin(tarefas, eq(notas.tarefaId, tarefas.id))
      .innerJoin(emitentes, eq(tarefas.emitenteId, emitentes.id))
      .leftJoin(lotesDistribuicao, eq(tarefas.loteId, lotesDistribuicao.id))
      .leftJoin(recuperacoesDocumentos, eq(recuperacoesDocumentos.notaId, notas.id))
      .leftJoin(cancelamentosFiscais, eq(cancelamentosFiscais.notaId, notas.id))
      .orderBy(desc(notas.criadoEm)),
  ]);
  const visao = normalizarVisaoNotas(parametros.visao);
  const contagens = Object.fromEntries(
    ABAS.map((aba) => [
      aba.id,
      lista.filter((nota) => visaoDaNota(nota.status) === aba.id).length,
    ]),
  ) as Record<VisaoNotas, number>;
  const notasVisiveis = lista.filter((nota) => visaoDaNota(nota.status) === visao);
  const agora = new Date();
  const temOperacaoAtiva = lista.some((nota) =>
    nota.recuperacaoStatus === "PENDENTE" || nota.recuperacaoStatus === "PROCESSANDO"
    || nota.cancelamentoStatus === "PENDENTE" || nota.cancelamentoStatus === "PROCESSANDO"
  );
  const disponibilidade = new Map(
    notasVisiveis.map((nota) => [
      nota.id,
      documentosDaNotaDisponiveis(
        nota.pdfPath,
        nota.xmlPath,
        nota.documentoExpiraEm,
        agora,
      ),
    ]),
  );
  const urls = await assinarDocumentosPrivados(
    notasVisiveis.flatMap((nota) => {
      if (!disponibilidade.get(nota.id)) return [];
      const dados = {
        cliente: nota.clienteNome,
        emitente: nota.emitenteNome,
        numeroDistribuicao: nota.numeroDistribuicao,
        data: nota.dataDistribuicao
          ?? nota.dataEmissao?.toISOString().slice(0, 10)
          ?? "",
      };
      return [
        {
          caminho: nota.pdfPath,
          nomeDownload: nomeDownloadDocumento({ tipo: "danfe", ...dados }),
        },
        {
          caminho: nota.xmlPath,
          nomeDownload: nomeDownloadDocumento({ tipo: "xml", ...dados }),
        },
      ];
    }),
  );
  const grupos = agruparNotasPorDistribuicao(notasVisiveis);

  return (
    <div>
      <h1 className="text-2xl font-medium">Notas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        PDF/XML originais ficam disponíveis por 30 dias. Quando recuperados,
        ficam disponíveis por 7 dias; o histórico da nota permanece.
      </p>
      <AtualizacaoAutomatica
        ativa={temOperacaoAtiva}
        descricao="Acompanhando as operações fiscais automaticamente"
      />

      <nav
        aria-label="Situação fiscal das notas"
        className="mt-5 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-[var(--surface-raised)] p-1"
      >
        {ABAS.map((aba) => {
          const ativa = aba.id === visao;
          return (
            <Link
              key={aba.id}
              href={aba.id === "ativas" ? "/notas" : "/notas?visao=canceladas"}
              aria-current={ativa ? "page" : undefined}
              className={`tap-target flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-3px)] px-3 text-sm font-medium ${
                ativa
                  ? "bg-[var(--field)] text-white"
                  : "text-[var(--ink-soft)] hover:bg-[var(--field-tint)]"
              }`}
            >
              <span>{aba.label}</span>
              <span className="font-mono-tab text-[11px] opacity-75">{contagens[aba.id]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 space-y-4">
        {grupos.map((grupo) => (
          <section key={grupo.chave} aria-label={grupo.numeroDistribuicao ? `Distribuição ${grupo.numeroDistribuicao}` : "Nota antiga"}>
            <div className="mb-2 flex items-end justify-between gap-3 px-1">
              <div>
                <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
                  {grupo.numeroDistribuicao
                    ? `Distribuição ${String(grupo.numeroDistribuicao).padStart(6, "0")}`
                    : "Nota anterior ao agrupamento"}
                </p>
                {grupo.data && <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">{dataIsoParaBrasil(grupo.data)}</p>}
              </div>
              <span className="text-[12px] text-[var(--ink-faint)]">{grupo.notas.length} {grupo.notas.length === 1 ? "nota" : "notas"}</span>
            </div>
            <Card className="divide-y divide-[var(--line)]">
              {grupo.notas.map((n) => (
                <NotaCard
                  key={n.id}
                  nota={{
                    ...n,
                    dataEmissao: n.dataEmissao?.toISOString() ?? null,
                    pdfUrl: disponibilidade.get(n.id) && n.pdfPath ? urls.get(n.pdfPath) ?? null : null,
                    xmlUrl: disponibilidade.get(n.id) && n.xmlPath ? urls.get(n.xmlPath) ?? null : null,
                    temChaveFiscal: /^\d{44}$/.test(n.chaveAcesso ?? ""),
                    podeRecuperar: n.status === "AUTORIZADA" && /^\d{44}$/.test(n.chaveAcesso ?? ""),
                    podeCancelar: n.status === "AUTORIZADA" && /^\d{44}$/.test(n.chaveAcesso ?? ""),
                  }}
                />
              ))}
            </Card>
          </section>
        ))}
        {notasVisiveis.length === 0 && (
          <Card className="px-4 py-10 text-center text-sm text-[var(--ink-faint)]">
            {lista.length === 0
              ? "Nenhuma nota emitida ainda."
              : visao === "canceladas"
                ? "Nenhuma nota cancelada."
                : "Nenhuma nota ativa."}
          </Card>
        )}
      </div>
    </div>
  );
}
