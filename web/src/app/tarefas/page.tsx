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
import { obterConfiguracaoOperacional } from "../configuracoes/actions";
import { descreverJanela } from "@/lib/janela-operacional";
import { carregarWorkers } from "@/lib/workers.server";
import { intervaloAtualizacaoWorkers } from "@/lib/workers-visao";
import PainelWorkers from "./PainelWorkers";

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
  const [lista, parametros, janela, workers] = await Promise.all([
    listarTarefasComItens(),
    searchParams,
    obterConfiguracaoOperacional(),
    carregarWorkers(),
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
  const ultima = agruparPorDistribuicao(lista)[0];
  const emitidas = ultima?.tarefas.filter((t) => visaoDaTarefa(t.status) === "concluidas").length ?? 0;
  const problemas = ultima?.tarefas.filter((t) => visaoDaTarefa(t.status) === "atencao").length ?? 0;
  const concluida = !!ultima && lista.length < 100 && emitidas === ultima.tarefas.length;
  const processando = lista.some((t) =>
    ["PROCESSANDO", "EMITINDO"].includes(t.status)
    && t.reservaExpiraEm && t.reservaExpiraEm.getTime() > Date.now(),
  );

  return (
    <div>
      <h1 className="text-2xl font-medium">Tarefas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Acompanhe cada rodada de distribuição e abra apenas a nota que precisa revisar.
      </p>
      <p className="mt-1 text-[12px] text-[var(--ink-faint)]">Exibimos as 100 tarefas mais recentes e todas as pendências, inclusive antigas. As contagens abaixo correspondem a esse recorte.</p>
      <AtualizacaoAutomatica ativa intervaloMs={intervaloAtualizacaoWorkers(temTarefaAtiva)} descricao="Acompanhando tarefas e servidores automaticamente" />
      <PainelWorkers dados={workers} janela={descreverJanela(janela)} execucaoLegada={processando} />
      {ultima?.numeroDistribuicao && (
        <Card className={`mt-4 p-4 ${problemas ? "border-[var(--stamp)] bg-[var(--stamp-tint)]" : "border-[var(--field)] bg-[var(--field-tint)]"}`}>
          <div role="status" aria-live="polite">
            <p className="text-[12px] font-semibold uppercase tracking-wide">Distribuição {String(ultima.numeroDistribuicao).padStart(6, "0")}</p>
            <h2 className="mt-1 text-lg font-semibold">{concluida ? "Distribuição concluída" : problemas ? "Uma parte precisa de atenção" : "Acompanhe sua distribuição"}</h2>
            <p className="mt-1 text-sm">{emitidas} de {ultima.tarefas.length} notas emitidas{problemas ? ` · ${problemas} para conferir` : ""}.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
            {problemas > 0 && <Link className="tap-target inline-flex items-center underline" href="/tarefas?visao=atencao">Conferir problemas</Link>}
            {emitidas > 0 && <Link className="tap-target inline-flex items-center underline" href="/notas">Abrir documentos</Link>}
            <Link className="tap-target inline-flex items-center underline" href={`/entregas?lote=${ultima.loteId}`}>Roteiro de entrega</Link>
          </div>
        </Card>
      )}

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
