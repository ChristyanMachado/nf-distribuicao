export const dynamic = "force-dynamic";

import { intervaloDoPreset } from "@/lib/relatorios";
import { dataOperacionalBrasil } from "@/lib/datas";
import { carregarRelatorio } from "./actions";
import RelatoriosView from "./RelatoriosView";

export default async function RelatoriosPage() {
  const { inicio, fim } = intervaloDoPreset("30dias", dataOperacionalBrasil());
  const { itens, trocas, tarefas } = await carregarRelatorio(inicio, fim);

  return (
    <div>
      <h1 className="text-2xl font-medium">Relatórios</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Volume bruto distribuído, eficiência e rankings — uma visão operacional
        sem antecipar o futuro módulo financeiro.
      </p>
      <RelatoriosView itensIniciais={itens} trocasIniciais={trocas} tarefasIniciais={tarefas} />
    </div>
  );
}
