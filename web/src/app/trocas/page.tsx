export const dynamic = "force-dynamic";
// Uma indisponibilidade do banco deve terminar em erro recuperável, não manter
// o operador preso por cinco minutos numa ação idempotente.
export const maxDuration = 30;

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import PrimaryButton from "@/components/PrimaryButton";
import { adicionarTrocaMercado, carregarTrocasMercado } from "./actions";
import ChaveIdempotenciaTroca from "./ChaveIdempotenciaTroca";
import PesquisaSelecionavel from "@/components/PesquisaSelecionavel";

export default async function TrocasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const [{ clientes, produtos, saldos }, parametros] = await Promise.all([
    carregarTrocasMercado(),
    searchParams,
  ]);

  return (
    <div>
      <h1 className="text-2xl font-medium">Trocas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Registre o que precisa ser reposto sem custo. O pendente é por produto e
        mercado; cada reposição usada em uma distribuição reduz esse total.
      </p>
      {["troca-registrada", "troca-reutilizada"].includes(parametros.salvo ?? "") && (
        <p role="status" className="mt-5 rounded-[var(--radius-control)] border border-[var(--field)] bg-[var(--field-tint)] px-4 py-3 text-sm">
          {parametros.salvo === "troca-reutilizada"
            ? "Este lançamento já havia sido registrado; o saldo não foi somado novamente."
            : "Reposição registrada. O pendente do mercado foi atualizado."}
        </p>
      )}
      <Card className="mt-5 p-4">
        <FormularioComFeedback
          action={adicionarTrocaMercado}
          className="grid gap-4 sm:grid-cols-3 sm:items-end"
          slowMessage="O serviço está demorando mais que o normal. Não envie novamente agora; aguarde o resultado. Se falhar, esta tela permitirá tentar de novo sem duplicar o saldo."
        >
          <ChaveIdempotenciaTroca />
          <div><Label required>Mercado</Label><PesquisaSelecionavel name="clienteId" opcoes={clientes.map((cliente) => ({ id: cliente.id, rotulo: cliente.nome }))} placeholder="Buscar mercado..." vazio="Nenhum mercado encontrado." /></div>
          <div><Label required>Produto</Label><PesquisaSelecionavel name="produtoId" opcoes={produtos.map((produto) => ({ id: produto.id, rotulo: produto.descricao, detalhe: produto.unidade }))} placeholder="Buscar produto..." vazio="Nenhum produto encontrado." /></div>
          <div><Label htmlFor="troca-quantidade" required>Quantidade a repor</Label><input id="troca-quantidade" name="quantidade" type="number" required min="0.001" max="1000000000" step="0.001" inputMode="decimal" placeholder="0" className="font-mono-tab w-full" /></div>
          <div className="sm:col-span-3"><PrimaryButton type="submit" pendingText="Registrando…" className="w-full sm:w-auto">Registrar reposição</PrimaryButton></div>
        </FormularioComFeedback>
      </Card>
      <div className="mt-6"><p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">Reposições pendentes</p><Card className="divide-y divide-[var(--line)]">{saldos.map((saldo) => <div key={saldo.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-medium">{saldo.clienteNome}</p><p className="text-[12px] text-[var(--ink-faint)]">{saldo.produtoDescricao}</p></div><span className="font-mono-tab text-right text-[var(--field-strong)]"><span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--ink-faint)]">A repor</span>{saldo.quantidadeDisponivel} {saldo.unidade}</span></div>)}{saldos.length === 0 && <p className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">Nenhuma reposição pendente.</p>}</Card></div>
    </div>
  );
}
