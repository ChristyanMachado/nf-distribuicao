export const dynamic = "force-dynamic";

import { intervaloDoPreset } from "@/lib/relatorios";
import { carregarRelatorio } from "./actions";
import RelatoriosView from "./RelatoriosView";

export default async function RelatoriosPage() {
  const { inicio, fim } = intervaloDoPreset("30dias", new Date());
  const { itens, trocas } = await carregarRelatorio(inicio, fim);

  return (
    <div>
      <h1 className="text-2xl font-medium">Relatórios</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Faturamento, ranking de clientes e produtos — calculado a partir do
        que já foi distribuído, sem depender de abrir PDF nenhum.
      </p>
      <RelatoriosView itensIniciais={itens} trocasIniciais={trocas} />
    </div>
  );
}
