import Card from "@/components/Card";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import { Label, Legend } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import type { EstadoFormulario } from "@/lib/formularios";

const OPCOES = [1, 2, 3] as const;

type Props = {
  workerId: string;
  nome: string;
  ativo: boolean;
  capacidadePermitida: number;
  capacidadeInformada: number | null;
  modoSolicitado: "MANUAL" | "AUTOMATICO";
  capacidadeManual: number;
  maximoAutomatico: number;
  capacidadeSugerida: number;
  motivoDecisao: string;
  configuracaoAplicadaEm: string | null;
  action: (state: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
};

function OpcoesCapacidade({
  name,
  idPrefix,
  atual,
  limite,
}: {
  name: string;
  idPrefix: string;
  atual: number;
  limite: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPCOES.map((valor) => {
        const bloqueado = valor > limite;
        const id = `${idPrefix}-${valor}`;
        return (
          <label
            key={valor}
            htmlFor={id}
            className={`flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border border-[var(--line)] px-2 py-2 text-sm ${bloqueado ? "cursor-not-allowed bg-[var(--paper)] opacity-55" : "bg-[var(--paper-raised)]"}`}
          >
            <span className="flex items-center gap-2">
              <input
                id={id}
                type="radio"
                name={name}
                value={valor}
                defaultChecked={valor === atual}
                disabled={bloqueado}
                required={!bloqueado}
              />
              <span className="font-medium">{valor}</span>
            </span>
            {bloqueado && (
              <span className="text-center text-[10px] leading-tight text-[var(--ink-faint)]">
                aguarda validação
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

export default function ConcorrenciaWorkerCard({
  workerId,
  nome,
  ativo,
  capacidadePermitida,
  capacidadeInformada,
  modoSolicitado,
  capacidadeManual,
  maximoAutomatico,
  capacidadeSugerida,
  motivoDecisao,
  configuracaoAplicadaEm,
  action,
}: Props) {
  const prefixo = workerId.replace(/[^A-Za-z0-9_-]/g, "-");

  return (
    <Card className="mt-5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Concorrência do {nome}</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Escolha quantas notas este computador pode processar ao mesmo tempo.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--ink-soft)]">
          {ativo ? "Servidor" : "Desativado"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-[var(--radius-control)] bg-[var(--paper)] p-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--ink-faint)]">Em uso agora</dt>
          <dd className="mt-0.5 font-medium text-[var(--ink)]">
            {capacidadeInformada === null ? "Aguardando contato" : `${capacidadeInformada} por vez`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ink-faint)]">Limite liberado</dt>
          <dd className="mt-0.5 font-medium text-[var(--ink)]">{capacidadePermitida}</dd>
        </div>
      </dl>

      {modoSolicitado === "AUTOMATICO" && (
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          Sugestão atual: <strong className="text-[var(--ink)]">{capacidadeSugerida} por vez</strong>
          {motivoDecisao ? ` · ${motivoDecisao}` : ""}.
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)]">
        A mudança entra no próximo ciclo. Notas já iniciadas continuam normalmente.
      </p>

      <FormularioComFeedback
        action={action}
        confirmMessage="Confirma a alteração da concorrência deste servidor?"
        className="mt-5 space-y-4"
      >
        <input type="hidden" name="workerId" value={workerId} />

        <fieldset>
          <Legend>Modo de operação</Legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["MANUAL", "Manual"],
              ["AUTOMATICO", "Automático"],
            ] as const).map(([valor, rotulo]) => (
              <label key={valor} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] px-3 py-2 text-sm">
                <input type="radio" name="mode" value={valor} defaultChecked={modoSolicitado === valor} />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <Legend>Capacidade quando manual</Legend>
          <OpcoesCapacidade
            name="manualCapacity"
            idPrefix={`${prefixo}-manual`}
            atual={capacidadeManual}
            limite={capacidadePermitida}
          />
        </fieldset>

        <fieldset>
          <Legend>Máximo quando automático</Legend>
          <OpcoesCapacidade
            name="autoMax"
            idPrefix={`${prefixo}-auto`}
            atual={maximoAutomatico}
            limite={capacidadePermitida}
          />
          <p className="mt-2 text-xs text-[var(--ink-faint)]">
            O modo automático começa em 1 e só aumenta gradualmente se houver folga e trabalho compatível.
          </p>
        </fieldset>

        <PrimaryButton type="submit" pendingText="Salvando…">Salvar concorrência</PrimaryButton>
        {configuracaoAplicadaEm && (
          <p className="text-xs text-[var(--ink-faint)]">
            Última aplicação: {new Date(configuracaoAplicadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}.
          </p>
        )}
      </FormularioComFeedback>
    </Card>
  );
}
