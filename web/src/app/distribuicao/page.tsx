export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { carregarDadosDistribuicao } from "./actions";
import DistribuicaoForm from "./DistribuicaoForm";

export default async function DistribuicaoPage() {
  const { clientes, produtos, precos } = await carregarDadosDistribuicao();

  if (produtos.length === 0 || clientes.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-medium">Distribuição</h1>
        <Card className="mt-4 p-5 text-sm text-[var(--ink-soft)]">
          Cadastre ao menos um cliente e um produto antes de registrar uma
          distribuição.
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
      <DistribuicaoForm clientes={clientes} produtos={produtos} precos={precos} />
    </div>
  );
}
