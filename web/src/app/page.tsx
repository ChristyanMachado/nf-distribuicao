export const dynamic = "force-dynamic";

import { count, desc, eq } from "drizzle-orm";
import Card from "@/components/Card";
import {
  IconChart,
  IconList,
  IconReceipt,
  IconScale,
  IconTruck,
} from "@/components/icons";
import { db } from "@/db";
import { lotesDistribuicao, notas, tarefas } from "@/db/schema";
import { dataOperacionalBrasil } from "@/lib/datas";
import {
  calcularKpisOperacionais,
  type TarefaOperacional,
} from "@/lib/relatorios";

const LIMITE_TAREFAS_DO_DIA = 1_000;

function formatarDataPorExtenso(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(Date.UTC(ano, mes - 1, dia, 12)));
}

function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;

  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;

  if (horas === 0) return `${minutos} min`;
  return minutosRestantes === 0 ? `${horas}h` : `${horas}h ${minutosRestantes}min`;
}

async function carregarResumoOperacional() {
  const hoje = dataOperacionalBrasil();

  // A home nunca carrega itens, documentos ou dados fiscais. A consulta do
  // dia traz apenas os campos necessários ao resumo e possui teto defensivo.
  const consultaTarefasHoje = db
    .select({
      id: tarefas.id,
      loteId: tarefas.loteId,
      status: tarefas.status,
      tentativas: tarefas.tentativas,
      iniciadoEm: tarefas.iniciadoEm,
      concluidoEm: tarefas.concluidoEm,
    })
    .from(tarefas)
    .where(eq(tarefas.data, hoje))
    .orderBy(desc(tarefas.criadoEm))
    .limit(LIMITE_TAREFAS_DO_DIA);

  // Contagens agregadas mantêm a resposta pequena mesmo quando o histórico
  // crescer. Elas representam operação, não faturamento ou lucro.
  const [tarefasHoje, [contagemLotes], [contagemNotas]] = await Promise.all([
    consultaTarefasHoje,
    db.select({ total: count() }).from(lotesDistribuicao),
    db.select({ total: count() }).from(notas),
  ]);

  return {
    hoje,
    totalDistribuicoes: Number(contagemLotes?.total ?? 0),
    totalNotas: Number(contagemNotas?.total ?? 0),
    operacaoHoje: calcularKpisOperacionais(tarefasHoje satisfies TarefaOperacional[]),
  };
}

export default async function DashboardPage() {
  const { hoje, totalDistribuicoes, totalNotas, operacaoHoje } =
    await carregarResumoOperacional();
  const tarefasAbertas = operacaoHoje.pendentes + operacaoHoje.emAndamento;
  const existeAtencao = operacaoHoje.erros > 0;

  return (
    <div>
      <header>
        <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Operação de hoje
        </p>
        <h1 className="mt-1 text-3xl font-medium">Bom trabalho.</h1>
        <p className="mt-1 text-sm capitalize text-[var(--ink-soft)]">
          {formatarDataPorExtenso(hoje)}
        </p>
      </header>

      <a
        href="/distribuicao"
        className="tap-target mt-6 flex min-h-16 items-center justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--field)] px-5 py-4 text-white shadow-sm transition active:scale-[0.99]"
      >
        <span>
          <span className="block text-lg font-semibold">Nova distribuição</span>
          <span className="mt-0.5 block text-[13px] text-white/80">
            Registrar e gerar as tarefas em uma única etapa
          </span>
        </span>
        <IconScale className="h-7 w-7 shrink-0" />
      </a>

      <section aria-labelledby="status-hoje" className="mt-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="status-hoje" className="text-lg font-medium">
              Status de hoje
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--ink-soft)]">
              A fila fiscal sem precisar abrir cada tarefa.
            </p>
          </div>
          <a
            href="/tarefas"
            className="tap-target flex items-center text-sm font-semibold text-[var(--field-strong)] underline decoration-[var(--line-strong)] underline-offset-4"
          >
            Ver tarefas
          </a>
        </div>

        <a href="/tarefas" className="tap-target mt-3 block">
          <Card className="overflow-hidden transition active:scale-[0.99]">
            <div className="grid grid-cols-3 divide-x divide-[var(--line)]">
              <StatusItem rotulo="Na fila" valor={operacaoHoje.pendentes} tom="neutro" />
              <StatusItem
                rotulo="Em curso"
                valor={operacaoHoje.emAndamento}
                tom="progresso"
              />
              <StatusItem
                rotulo="Erros"
                valor={operacaoHoje.erros}
                tom={existeAtencao ? "alerta" : "sucesso"}
              />
            </div>
            <div
              className={`flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-[13px] ${
                existeAtencao
                  ? "bg-[var(--stamp-tint)] text-[var(--stamp)]"
                  : "bg-[var(--field-tint)] text-[var(--field-strong)]"
              }`}
            >
              <span className="font-medium">
                {existeAtencao
                  ? `${operacaoHoje.erros} tarefa(s) precisa(m) de atenção`
                  : tarefasAbertas > 0
                    ? `${tarefasAbertas} tarefa(s) em andamento na operação`
                    : "Nenhuma pendência ou erro hoje"}
              </span>
              <IconList className="h-4 w-4 shrink-0" />
            </div>
          </Card>
        </a>
      </section>

      <section aria-labelledby="acoes-rapidas" className="mt-6">
        <h2 id="acoes-rapidas" className="text-lg font-medium">
          Ações rápidas
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <AtalhoOperacional
            href="/entregas"
            titulo="Entregas"
            descricao="Abrir roteiro"
            Icon={IconTruck}
          />
          <AtalhoOperacional
            href="/tarefas"
            titulo="Tarefas"
            descricao="Acompanhar notas"
            Icon={IconList}
          />
        </div>
      </section>

      <section aria-labelledby="valor-entregue" className="mt-6">
        <h2 id="valor-entregue" className="text-lg font-medium">
          Resultado operacional
        </h2>
        <p className="mt-0.5 text-[13px] text-[var(--ink-soft)]">
          Histórico do uso e eficiência estimada de hoje.
        </p>

        <Card className="mt-3 p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 min-[420px]:grid-cols-3">
            <Indicador
              rotulo="Distribuições"
              valor={totalDistribuicoes.toLocaleString("pt-BR")}
            />
            <Indicador
              rotulo="Notas registradas"
              valor={totalNotas.toLocaleString("pt-BR")}
              Icon={IconReceipt}
            />
            <Indicador
              rotulo="Tempo recuperado hoje"
              valor={formatarDuracao(operacaoHoje.tempoEconomizadoSegundos)}
              destaque
            />
          </div>
          <p className="mt-4 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-[var(--ink-faint)]">
            Tempo estimado somente para distribuições concluídas, usando o benchmark operacional já validado. Não representa faturamento ou lucro.
          </p>
        </Card>

        <a
          href="/relatorios"
          className="tap-target mt-2 flex items-center justify-center gap-2 rounded-[var(--radius-control)] text-sm font-semibold text-[var(--field-strong)]"
        >
          <IconChart className="h-4 w-4" />
          Ver relatório completo
        </a>
      </section>
    </div>
  );
}

function StatusItem({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom: "neutro" | "progresso" | "alerta" | "sucesso";
}) {
  const cor = {
    neutro: "text-[var(--ink)]",
    progresso: "text-[var(--wheat)]",
    alerta: "text-[var(--stamp)]",
    sucesso: "text-[var(--field)]",
  }[tom];

  return (
    <div className="px-2 py-4 text-center">
      <p className={`font-mono-tab text-2xl font-semibold ${cor}`}>{valor}</p>
      <p className="mt-1 text-[11px] text-[var(--ink-faint)]">{rotulo}</p>
    </div>
  );
}

function AtalhoOperacional({
  href,
  titulo,
  descricao,
  Icon,
}: {
  href: string;
  titulo: string;
  descricao: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a href={href} className="tap-target block">
      <Card className="h-full p-4 transition active:scale-[0.98]">
        <Icon className="h-5 w-5 text-[var(--field)]" />
        <p className="mt-2 font-semibold">{titulo}</p>
        <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">{descricao}</p>
      </Card>
    </a>
  );
}

function Indicador({
  rotulo,
  valor,
  destaque = false,
  Icon,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-[var(--ink-faint)]" />}
        <p className="text-[11px] leading-tight text-[var(--ink-faint)]">{rotulo}</p>
      </div>
      <p
        className={`font-mono-tab mt-1 text-xl font-semibold ${
          destaque ? "text-[var(--field-strong)]" : "text-[var(--ink)]"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
