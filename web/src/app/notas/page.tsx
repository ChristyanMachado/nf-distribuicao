export const dynamic = "force-dynamic";

import { db } from "@/db";
import { notas, clientes, emitentes, tarefas, lotesDistribuicao } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Card from "@/components/Card";
import NotaCard from "./NotaCard";
import { assinarDocumentosPrivados } from "@/lib/storage.server";
import { nomeDownloadDocumento } from "@/lib/storage-caminhos";

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
    .orderBy(desc(notas.criadoEm));
  const urls = await assinarDocumentosPrivados(
    lista.flatMap((nota) => {
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
        PDF/XML seguem a retenção de até 1 ano — o histórico da nota
        permanece mesmo depois do arquivo expirar.
      </p>

      <Card className="mt-5 divide-y divide-[var(--line)]">
        {lista.map((n) => (
          <NotaCard
            key={n.id}
            nota={{
              ...n,
              pdfUrl: n.pdfPath ? urls.get(n.pdfPath) ?? null : null,
              xmlUrl: n.xmlPath ? urls.get(n.xmlPath) ?? null : null,
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
