export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { carregarRoteiroEntrega, listarLotesEntrega } from "./actions";
import RoteiroEntregaView from "./RoteiroEntregaView";

export default async function EntregasPage({
  searchParams,
}: {
  searchParams: Promise<{ lote?: string }>;
}) {
  const [lotes, parametros] = await Promise.all([listarLotesEntrega(), searchParams]);
  const loteSelecionado = lotes.find((lote) => lote.id === parametros.lote) ?? lotes[0] ?? null;
  const roteiro = loteSelecionado ? await carregarRoteiroEntrega(loteSelecionado.id) : [];

  return (
    <div>
      <h1 className="text-2xl font-medium">Roteiro de entrega</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Uma folha prática para o motorista: clientes, endereços, produtos e trocas — sem valores.
      </p>
      {loteSelecionado ? (
        <RoteiroEntregaView lotes={lotes} loteSelecionado={loteSelecionado} roteiro={roteiro} geradoEm={new Date().toISOString()} />
      ) : (
        <Card className="mt-5 p-5 text-sm text-[var(--ink-soft)]">
          Ainda não há distribuição registrada para imprimir.
        </Card>
      )}
    </div>
  );
}
