export const dynamic = "force-dynamic";

import { db } from "@/db";
import { notas, clientes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Card from "@/components/Card";
import NotaCard from "./NotaCard";
import { assinarDocumentosPrivados } from "@/lib/storage.server";

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
    })
    .from(notas)
    .innerJoin(clientes, eq(notas.clienteId, clientes.id))
    .orderBy(desc(notas.criadoEm));
  const urls = await assinarDocumentosPrivados(
    lista.flatMap((nota) => [nota.pdfPath, nota.xmlPath]),
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
