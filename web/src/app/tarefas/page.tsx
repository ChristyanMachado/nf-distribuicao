import Link from "next/link";
import Card from "@/components/Card";
import AtualizacaoAutomatica from "@/components/AtualizacaoAutomatica";
import { dataIsoParaBrasil } from "@/lib/datas";
import {
  agruparPorDistribuicao,
  normalizarVisaoTarefas,
  visaoDaTarefa,
  type VisaoTarefas,
} from "@/lib/tarefas-visao";
import TarefaCard from "./TarefaCard";
import { listarTarefasComItens } from "./actions";

const ABAS: { id: VisaoTarefas; label: string }[] = [
  { id: "pendentes", label: "Pendentes" },
  { id: "andamento", label: "Em andamento" },
  { id: "atencao", label: "Atenção" },
  { id: "concluidas", label: "Concluídas" },
  { id: "canceladas", label: "Canceladas" },
];

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string }>;
}) {
  const [lista, parametros] = await Promise.all([
    listarTarefasComItens(),
    searchParams,
  ]);
  const visao = normalizarVisaoTarefas(parametros.visao);
  const contagens = Object.fromEntries(
    ABAS.map((aba) => [
      aba.id,
      lista.filter((tarefa) => visaoDaTarefa(tarefa.status) === aba.id).length,
    ]),
  ) as Record<VisaoTarefas, number>;
  const tarefasVisiveis = lista.filter(
    (tarefa) => visaoDaTarefa(tarefa.status) === visao,
  );
  const grupos = agruparPorDistribuicao(tarefasVisiveis);
  const temTarefaAtiva = lista.some((tarefa) =>
    ["PENDENTE", "PROCESSANDO", "EMITINDO"].includes(tarefa.status),
  );

  return (
    <div>
      <h1 className="text-2xl font-medium">Tarefas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Acompanhe cada rodada de distribuição e abra apenas a nota que precisa revisar.
      </p>
      <AtualizacaoAutomatica ativa={temTarefaAtiva} />

      <nav
        aria-label="Situação das tarefas"
        className="mt-5 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-[var(--surface-raised)] p-1 sm:grid-cols-5"
      >
        {ABAS.map((aba) => {
          const ativa = aba.id === visao;
          return (
            <Link
              key={aba.id}
              href={aba.id === "pendentes" ? "/tarefas" : `/tarefas?visao=${aba.id}`}
              aria-current={ativa ? "page" : undefined}
              className={`tap-target flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[calc(var(--radius-control)-3px)] px-2 text-center text-[12px] font-medium sm:text-sm ${
                ativa
                  ? "bg-[var(--field)] text-white"
                  : "text-[var(--ink-soft)] hover:bg-[var(--field-tint)]"
              }`}
            >
              <span className="truncate">{aba.label}</span>
              <span className="font-mono-tab text-[11px] opacity-75">
                {contagens[aba.id]}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 space-y-4">
        {grupos.map((grupo) => (
          <section key={grupo.chave} aria-labelledby={`distribuicao-${grupo.chave}`}>
            <div className="mb-2 flex items-end justify-between gap-3 px-1">
              <div>
                <h2 id={`distribuicao-${grupo.chave}`} className="text-sm font-semibold">
                  {grupo.numeroDistribuicao
                    ? `Distribuição ${String(grupo.numeroDistribuicao).padStart(6, "0")}`
                    : "Registros anteriores sem número de distribuição"}
                </h2>
                <p className="font-mono-tab text-[12px] text-[var(--ink-faint)]">
                  {dataIsoParaBrasil(grupo.data)}
                </p>
              </div>
              <span className="text-[12px] text-[var(--ink-faint)]">
                {grupo.tarefas.length} nota{grupo.tarefas.length === 1 ? "" : "s"}
              </span>
            </div>
            <Card className="divide-y divide-[var(--line)]">
              {grupo.tarefas.map((tarefa) => (
                <TarefaCard key={tarefa.id} tarefa={tarefa} />
              ))}
            </Card>
          </section>
        ))}

        {tarefasVisiveis.length === 0 && (
          <Card className="px-4 py-10 text-center text-sm text-[var(--ink-faint)]">
            {lista.length === 0
              ? "Nenhuma tarefa gerada ainda. Registre uma distribuição primeiro."
              : `Nenhuma tarefa em ${ABAS.find((aba) => aba.id === visao)?.label.toLowerCase()}.`}
          </Card>
        )}
      </div>
    </div>
  );
}
