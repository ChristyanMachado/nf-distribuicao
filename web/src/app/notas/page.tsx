export const dynamic = "force-dynamic";

import { db } from "@/db";
import {
  notas,
  clientes,
  emitentes,
  tarefas,
  lotesDistribuicao,
  recuperacoesDocumentos,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Card from "@/components/Card";
import AtualizacaoAutomatica from "@/components/AtualizacaoAutomatica";
import NotaCard from "./NotaCard";
import { assinarDocumentosPrivados } from "@/lib/storage.server";
import { nomeDownloadDocumento } from "@/lib/storage-caminhos";
import { documentosDaNotaDisponiveis } from "@/lib/documentos-nota";

export default async function NotasPage() {
  const lista = await db
    .select({
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
      clienteNome: clientes.nome,
      emitenteNome: emitentes.nome,
      numeroDistribuicao: lotesDistribuicao.numero,
      dataDistribuicao: lotesDistribuicao.data,
    })
    .from(notas)
    .innerJoin(clientes, eq(notas.clienteId, clientes.id))
    .innerJoin(tarefas, eq(notas.tarefaId, tarefas.id))
    .innerJoin(emitentes, eq(tarefas.emitenteId, emitentes.id))
    .leftJoin(lotesDistribuicao, eq(tarefas.loteId, lotesDistribuicao.id))
    .leftJoin(recuperacoesDocumentos, eq(recuperacoesDocumentos.notaId, notas.id))
    .orderBy(desc(notas.criadoEm));
  const agora = new Date();
  const temRecuperacaoAtiva = lista.some((nota) =>
    nota.recuperacaoStatus === "PENDENTE" || nota.recuperacaoStatus === "PROCESSANDO"
  );
  const disponibilidade = new Map(
    lista.map((nota) => [
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
    lista.flatMap((nota) => {
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

  return (
    <div>
      <h1 className="text-2xl font-medium">Notas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        PDF/XML originais ficam disponíveis por 30 dias. Quando recuperados,
        ficam disponíveis por 7 dias; o histórico da nota permanece.
      </p>
      <AtualizacaoAutomatica
        ativa={temRecuperacaoAtiva}
        descricao="Acompanhando a recuperação automaticamente"
      />

      <Card className="mt-5 divide-y divide-[var(--line)]">
        {lista.map((n) => (
          <NotaCard
            key={n.id}
            nota={{
              ...n,
              dataEmissao: n.dataEmissao?.toISOString() ?? null,
              pdfUrl: disponibilidade.get(n.id) && n.pdfPath
                ? urls.get(n.pdfPath) ?? null
                : null,
              xmlUrl: disponibilidade.get(n.id) && n.xmlPath
                ? urls.get(n.xmlPath) ?? null
                : null,
              podeRecuperar: /^\d{44}$/.test(n.chaveAcesso ?? ""),
            }}
          />
        ))}
        {lista.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[var(--ink-faint)]">
            Nenhuma nota emitida ainda.
          </div>
        )}
      </Card>
    </div>
  );
}
