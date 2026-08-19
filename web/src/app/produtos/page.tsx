export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { Label } from "@/components/Field";
import PrimaryButton from "@/components/PrimaryButton";
import { criarProduto, listarProdutos } from "./actions";

export default async function ProdutosPage() {
  const produtos = await listarProdutos();

  return (
    <div>
      <h1 className="text-2xl font-medium">Produtos</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        Cada produto pode ter um código fiscal específico usado no sistema
        da Receita.
      </p>

      <Card className="mt-5 p-4">
        <form action={criarProduto} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Descrição</Label>
            <input name="descricao" required className="w-full" placeholder="Couve-flor" />
          </div>
          <div>
            <Label>Código fiscal</Label>
            <input name="codigoFiscal" className="w-full" />
          </div>
          <div>
            <Label>Unidade</Label>
            <input name="unidade" defaultValue="UN" className="w-full" />
          </div>
          <div className="col-span-2">
            <Label>Preço padrão (R$)</Label>
            <input
              name="precoPadrao"
              type="number"
              step="0.01"
              defaultValue="0"
              className="font-mono-tab w-full"
            />
          </div>
          <div className="col-span-2 mt-1">
            <PrimaryButton type="submit" className="w-full py-2.5 sm:w-auto">
              Cadastrar produto
            </PrimaryButton>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        <p className="font-mono-tab mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          Cadastrados ({produtos.length})
        </p>
        <Card className="divide-y divide-[var(--line)]">
          {produtos.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium">{p.descricao}</span>
              <span className="font-mono-tab text-[var(--ink-faint)]">
                R$ {p.precoPadrao} / {p.unidade}
              </span>
            </div>
          ))}
          {produtos.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
              Nenhum produto cadastrado ainda.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
