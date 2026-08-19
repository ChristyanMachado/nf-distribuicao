export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import TarefaCard from "./TarefaCard";
import { listarTarefasComItens } from "./actions";

export default async function TarefasPage() {
  const lista = await listarTarefasComItens();

  return (
    <div>
      <h1 className="text-2xl font-medium">Tarefas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Toque num cliente pra ver os produtos daquela nota. O worker
        processa as pendentes entre 00:00 e 06:00.
      </p>

      <Card className="mt-5 divide-y divide-[var(--line)]">
        {lista.map((t) => (
          <TarefaCard key={t.id} tarefa={t} />
        ))}
        {lista.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[var(--ink-faint)]">
            Nenhuma tarefa gerada ainda. Registre uma distribuição primeiro.
          </div>
        )}
      </Card>
    </div>
  );
}
