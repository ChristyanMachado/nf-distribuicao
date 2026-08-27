export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { carregarDadosDistribuicao } from "./actions";
import DistribuicaoForm from "./DistribuicaoForm";

export default async function DistribuicaoPage() {
  const { clientes, produtos, precos, ultimaDistribuicao } = await carregarDadosDistribuicao();
<<<<<<< HEAD
  const clientesProntos = clientes.filter((cliente) => cliente.prontoParaEmissao);
=======
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d

  if (produtos.length === 0 || clientes.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-medium">Distribuição</h1>
        <Card className="mt-4 p-5 text-sm text-[var(--ink-soft)]">
          Cadastre ao menos um cliente e um produto fiscalmente completo antes
          de registrar uma distribuição.
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/clientes" className="tap-target inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] px-3 font-semibold text-[var(--field-strong)]">Revisar clientes</a>
            <a href="/produtos" className="tap-target inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] px-3 font-semibold text-[var(--field-strong)]">Revisar produtos</a>
          </div>
        </Card>
      </div>
    );
  }

  if (clientesProntos.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-medium">Distribuição</h1>
        <Card className="mt-4 border-[var(--wheat)] bg-[var(--wheat-tint)] p-5 text-sm text-[var(--ink-soft)]">
          Nenhum cliente está pronto para gerar tarefa fiscal. Complete o
          destinatário e a integração do emitente antes de montar o lote.
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/emitentes" className="tap-target inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper-raised)] px-3 font-semibold text-[var(--field-strong)]">Revisar emitentes</a>
            <a href="/clientes" className="tap-target inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper-raised)] px-3 font-semibold text-[var(--field-strong)]">Revisar clientes</a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-medium">Distribuição</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Adicione os produtos do dia, depois distribua entre os clientes
        participantes — o preço já vem do que foi usado da última vez.
      </p>
      <DistribuicaoForm
        clientes={clientes}
        produtos={produtos}
        precos={precos}
        ultimaDistribuicao={ultimaDistribuicao}
      />
    </div>
  );
}
