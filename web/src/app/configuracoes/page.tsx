export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import PrimaryButton from "@/components/PrimaryButton";
import { descreverJanela } from "@/lib/janela-operacional";
import { atualizarJanelaOperacional, obterConfiguracaoOperacional } from "./actions";

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const [configuracao, parametros] = await Promise.all([
    obterConfiguracaoOperacional(),
    searchParams,
  ]);

  return (
    <div>
      <h1 className="text-2xl font-medium">Horário de emissão</h1>
      <p className="mt-1 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        Define até que horário o Worker pode começar uma nova nota.
      </p>

      {parametros.salvo && (
        <p className="mt-5 rounded-[var(--radius-control)] border border-[var(--field)] bg-[var(--field-tint)] px-4 py-3 text-sm" role="status">
          Horário atualizado. O Worker usará a alteração no próximo ciclo.
        </p>
      )}

      <Card className="mt-5 p-4">
        <p className="text-sm text-[var(--ink-soft)]">
          Janela atual: <strong className="text-[var(--ink)]">{descreverJanela(configuracao)}</strong>, horário de São Paulo.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-faint)]">
          Se uma nota começar antes do limite, ela continua normalmente até terminar.
          A VM permanece ligada 24 horas para recuperações e acompanhamento.
        </p>

        <FormularioComFeedback
          action={atualizarJanelaOperacional}
          confirmMessage="Tem certeza de que deseja alterar o horário de início de novas emissões?"
          className="mt-5 grid grid-cols-2 gap-3"
        >
          <div>
            <Label htmlFor="inicioHora" required>Começar às</Label>
            <input id="inicioHora" name="inicioHora" type="number" inputMode="numeric" min={0} max={23} step={1} required defaultValue={configuracao.inicioHora} className="w-full" />
          </div>
          <div>
            <Label htmlFor="fimHora" required>Aceitar até</Label>
            <input id="fimHora" name="fimHora" type="number" inputMode="numeric" min={0} max={23} step={1} required defaultValue={configuracao.fimHora} className="w-full" />
          </div>
          <p className="col-span-2 text-[12px] leading-relaxed text-[var(--ink-faint)]">
            Exemplo: fim 7 permite iniciar notas até 06:59. Horários iguais não são permitidos.
          </p>
          <div className="col-span-2">
            <PrimaryButton type="submit" pendingText="Atualizando…" className="w-full sm:w-auto">
              Alterar horário
            </PrimaryButton>
          </div>
        </FormularioComFeedback>
      </Card>
    </div>
  );
}
