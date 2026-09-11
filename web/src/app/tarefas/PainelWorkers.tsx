import Card from "@/components/Card";
import { descreverEstadoWorker, tempoSemContato, type PainelWorkers as DadosPainel } from "@/lib/workers-visao";

const dataContato = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
});

export default function PainelWorkers({
  dados, janela, execucaoLegada,
}: {
  dados: DadosPainel;
  janela: string;
  execucaoLegada: boolean;
}) {
  const ativos = dados.workers.filter((worker) => ["ONLINE", "BUSY"].includes(worker.estado));
  const semExecutor = dados.situacao === "disponivel" && dados.workers.length > 0 && ativos.length === 0;
  return (
    <Card className="mt-4 p-4" role="region" aria-labelledby="titulo-executores">
      <h2 id="titulo-executores" className="text-sm font-semibold">Servidores de emissão</h2>
      <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
        Novas emissões: {janela} · São Paulo. Notas já iniciadas continuam até terminar.
      </p>
      {dados.situacao === "nao_configurado" && (
        <p className="mt-2 text-[13px] text-[var(--ink-soft)]">
          Monitoramento dos servidores ainda não configurado.
          {execucaoLegada ? " Existe tarefa com reserva vigente, mas isso não confirma a saúde do servidor." : " Ainda não é possível confirmar se o servidor está conectado."}
        </p>
      )}
      {dados.situacao === "indisponivel" && (
        <p role="status" className="mt-2 text-[13px] text-[var(--stamp)]">
          Não foi possível consultar a saúde dos servidores. A conexão será verificada novamente; este aviso não confirma que eles pararam.
        </p>
      )}
      {dados.situacao === "disponivel" && dados.workers.length === 0 && (
        <p className="mt-2 text-[13px] text-[var(--ink-soft)]">Nenhum servidor cadastrado. Configure o primeiro executor para acompanhar sua atividade aqui.</p>
      )}
      {dados.workers.some((worker) => !worker.coordenacaoAtiva) && (
        <p className="mt-2 rounded border border-[var(--line)] p-2 text-[13px] text-[var(--ink-soft)]">
          Coordenação entre servidores ainda desativada. O cadastro abaixo não confirma que a troca automática de executor está habilitada.
        </p>
      )}
      {semExecutor && (
        <p role="status" className="mt-2 text-[13px] font-medium text-[var(--stamp)]">
          Nenhum servidor disponível confirmado. Verifique o computador e a conexão antes da próxima emissão.
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {dados.workers.map((worker) => {
          const saudavel = ["ONLINE", "BUSY"].includes(worker.estado);
          return (
            <article key={worker.id} className="min-w-0 rounded-[var(--radius-control)] border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 break-all text-sm font-semibold">{worker.id}</h3>
                <span className={`rounded px-2 py-1 text-[11px] font-medium ${saudavel ? "bg-[var(--field-tint)] text-[var(--field)]" : "bg-[var(--stamp-tint)] text-[var(--stamp)]"}`}>
                  {descreverEstadoWorker(worker)}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
                Prioridade {worker.prioridade}{worker.preferido && worker.coordenacaoAtiva ? " · Preferido para novas tarefas" : ""}
              </p>
              <dl className="mt-3 space-y-2 text-[12px]">
                <div><dt className="text-[var(--ink-faint)]">Último contato · São Paulo</dt><dd>{worker.ultimoContato ? <time dateTime={worker.ultimoContato}>{dataContato.format(new Date(worker.ultimoContato))}</time> : "Ainda não recebido"} · {tempoSemContato(worker.segundosSemContato)}</dd></div>
                <div><dt className="text-[var(--ink-faint)]">Versão</dt><dd className="break-all font-mono">{worker.versao ?? "Não informada"}</dd></div>
                <div><dt className="text-[var(--ink-faint)]">Capacidade</dt><dd>Até {worker.capacidadePermitida} por vez · executor informa {worker.capacidadeInformada ?? "—"}</dd></div>
                <div><dt className="text-[var(--ink-faint)]">Operações</dt><dd>{worker.operacoesAtivas.length} com reserva · {worker.operacoesConcluidas} concluídas</dd></div>
              </dl>
              {worker.ultimoErro && <p className="mt-3 text-[12px] text-[var(--stamp)]">Última ocorrência: {worker.ultimoErro}.</p>}
              {worker.estado === "DRAINING" && <p className="mt-2 text-[12px] text-[var(--ink-soft)]">Conclui as operações em curso sem aceitar novas tarefas.</p>}
              {worker.estado === "OFFLINE" && worker.operacoesAtivas.length > 0 && <p className="mt-2 text-[12px] text-[var(--stamp)]">As reservas restantes não confirmam execução. Resultados fiscais incertos precisam de conferência.</p>}
              {worker.operacoesAtivas.length > 0 && (
                <details className="mt-3 text-[12px]">
                  <summary className="tap-target flex cursor-pointer items-center underline">Identificadores das operações</summary>
                  <ul className="mt-1 space-y-1">{worker.operacoesAtivas.map((id) => <li key={id} className="break-all font-mono">{id}</li>)}</ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
      {dados.workers.length > 0 && <p className="mt-3 text-[11px] text-[var(--ink-faint)]">Menor número tem preferência. Contatos confirmam comunicação recente, sem garantir o próximo resultado fiscal. Concluídas incluem emissões, recuperações e cancelamentos.</p>}
    </Card>
  );
}
