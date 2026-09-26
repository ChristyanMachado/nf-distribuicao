export const dynamic = "force-dynamic";
// Uma indisponibilidade do banco deve terminar em erro recuperável, não manter
// o operador preso por cinco minutos numa ação idempotente.
export const maxDuration = 30;

import Card from "@/components/Card";
import { carregarTrocasMercado } from "./actions";
import FormularioLoteTrocas from "./FormularioLoteTrocas";
import SaldoTrocaPendente from "./SaldoTrocaPendente";

export default async function TrocasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const parametros = await searchParams;
  const { clientes, produtos, saldos } = await carregarTrocasMercado();

  return (
    <div>
      <h1 className="text-2xl font-medium">Trocas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Registre o que precisa ser reposto sem custo. O pendente é por produto e
        mercado; cada reposição usada em uma distribuição reduz esse total.
      </p>
      {["troca-registrada", "troca-reutilizada", "troca-ajustada", "troca-zerada"].includes(parametros.salvo ?? "") && (
        <p role="status" className="mt-5 rounded-[var(--radius-control)] border border-[var(--field)] bg-[var(--field-tint)] px-4 py-3 text-sm">
          {parametros.salvo === "troca-reutilizada" ? "Este lançamento já havia sido registrado; o saldo não foi somado novamente."
            : parametros.salvo === "troca-ajustada" ? "Saldo pendente corrigido; o histórico foi preservado."
            : parametros.salvo === "troca-zerada" ? "Saldo pendente zerado; o histórico foi preservado."
            : "Reposição registrada. O pendente do mercado foi atualizado."}
        </p>
      )}
      <FormularioLoteTrocas clientes={clientes} produtos={produtos} />
      <div className="mt-6">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">Reposições pendentes</p>
        <Card className="divide-y divide-[var(--line)]">
          {saldos.map((saldo) => <SaldoTrocaPendente key={saldo.id} saldo={saldo} />)}
          {saldos.length === 0 && <p className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">Nenhuma reposição pendente.</p>}
        </Card>
      </div>
    </div>
  );
}
