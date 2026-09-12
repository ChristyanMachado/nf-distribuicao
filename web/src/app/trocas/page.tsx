export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import PrimaryButton from "@/components/PrimaryButton";
import { adicionarTrocaMercado, carregarTrocasMercado } from "./actions";

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
        Registre a mercadoria física devolvida por cada mercado. O saldo é por
        produto e mercado; ao usar uma parte na distribuição, o restante fica disponível.
      </p>
      {parametros.salvo === "troca-registrada" && (
        <p role="status" className="mt-5 rounded-[var(--radius-control)] border border-[var(--field)] bg-[var(--field-tint)] px-4 py-3 text-sm">
          Troca adicionada ao saldo do mercado.
        </p>
      )}
      <Card className="mt-5 p-4">
        <FormularioComFeedback action={adicionarTrocaMercado} className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <div><Label htmlFor="troca-mercado" required>Mercado</Label><select id="troca-mercado" name="clienteId" required defaultValue="" className="w-full"><option value="" disabled>Selecione</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></div>
          <div><Label htmlFor="troca-produto" required>Produto</Label><select id="troca-produto" name="produtoId" required defaultValue="" className="w-full"><option value="" disabled>Selecione</option>{produtos.map((produto) => <option key={produto.id} value={produto.id}>{produto.descricao} · {produto.unidade}</option>)}</select></div>
          <div><Label htmlFor="troca-quantidade" required>Quantidade recebida</Label><input id="troca-quantidade" name="quantidade" type="number" required min="0.001" max="1000000000" step="0.001" inputMode="decimal" placeholder="0" className="font-mono-tab w-full" /></div>
          <div className="sm:col-span-3"><PrimaryButton type="submit" pendingText="Registrando…" className="w-full sm:w-auto">Adicionar ao saldo</PrimaryButton></div>
        </FormularioComFeedback>
      </Card>
      <div className="mt-6"><p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">Saldos disponíveis</p><Card className="divide-y divide-[var(--line)]">{saldos.map((saldo) => <div key={saldo.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-medium">{saldo.clienteNome}</p><p className="text-[12px] text-[var(--ink-faint)]">{saldo.produtoDescricao}</p></div><span className="font-mono-tab text-[var(--field-strong)]">{saldo.quantidadeDisponivel} {saldo.unidade}</span></div>)}{saldos.length === 0 && <p className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">Nenhuma troca registrada.</p>}</Card></div>
    </div>
  );
}
