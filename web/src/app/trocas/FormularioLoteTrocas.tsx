"use client";

import { useEffect, useId, useState } from "react";
import Card from "@/components/Card";
import { Label } from "@/components/Field";
import FormularioComFeedback from "@/components/FormularioComFeedback";
import PrimaryButton from "@/components/PrimaryButton";
import PesquisaSelecionavel from "@/components/PesquisaSelecionavel";
import { adicionarTrocasEmLote } from "./actions";

type Linha = { id: string; chaveIdempotencia: string };

export default function FormularioLoteTrocas({
  clientes,
  produtos,
}: {
  clientes: Array<{ id: string; nome: string }>;
  produtos: Array<{ id: string; descricao: string; unidade: string }>;
}) {
  // O id da primeira linha precisa ser igual no SSR e na hidratação.
  const idInicial = useId();
  const [linhas, setLinhas] = useState<Linha[]>([{ id: idInicial, chaveIdempotencia: "" }]);
  useEffect(() => {
    setLinhas((atuais) => atuais.map((linha) =>
      linha.chaveIdempotencia ? linha : { ...linha, chaveIdempotencia: crypto.randomUUID() }));
  }, []);

  return (
    <Card className="mt-5 p-4">
      <FormularioComFeedback
        action={adicionarTrocasEmLote}
        className="space-y-5"
        slowMessage="O serviço está demorando mais que o normal. Aguarde o resultado; se falhar, tente novamente sem duplicar os saldos."
      >
        <div>
          <Label htmlFor="troca-lote-mercado" required>Mercado</Label>
          <PesquisaSelecionavel
            id="troca-lote-mercado"
            name="clienteId"
            opcoes={clientes.map((cliente) => ({ id: cliente.id, rotulo: cliente.nome }))}
            placeholder="Buscar mercado..."
            vazio="Nenhum mercado encontrado."
          />
        </div>
        <div className="space-y-3">
          <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
            Produtos a repor
          </p>
          {linhas.map((linha, indice) => (
            <div key={linha.id} className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--line)] p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
              <input type="hidden" name="chaveIdempotencia" value={linha.chaveIdempotencia} />
              <div>
                <Label htmlFor={`troca-lote-produto-${linha.id}`} required>Produto {indice + 1}</Label>
                <PesquisaSelecionavel
                  id={`troca-lote-produto-${linha.id}`}
                  name="produtoId"
                  opcoes={produtos.map((produto) => ({ id: produto.id, rotulo: produto.descricao, detalhe: produto.unidade }))}
                  placeholder="Buscar produto..."
                  vazio="Nenhum produto encontrado."
                />
              </div>
              <div>
                <Label htmlFor={`troca-quantidade-${linha.id}`} required>Quantidade</Label>
                <input
                  id={`troca-quantidade-${linha.id}`}
                  name="quantidade"
                  type="number"
                  required
                  min="0.001"
                  max="999999999.999"
                  step="0.001"
                  inputMode="decimal"
                  placeholder="0"
                  className="font-mono-tab w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => setLinhas((atuais) => atuais.length <= 1 ? atuais : atuais.filter((atual) => atual.id !== linha.id))}
                disabled={linhas.length <= 1}
                aria-label={`Remover produto ${indice + 1}`}
                className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 text-sm text-[var(--ink-soft)] disabled:opacity-40"
              >Remover</button>
            </div>
          ))}
          <button
            type="button"
            disabled={linhas.length >= 30}
            onClick={() => setLinhas((atuais) => [...atuais, { id: crypto.randomUUID(), chaveIdempotencia: crypto.randomUUID() }])}
            className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 text-sm font-medium disabled:opacity-40"
          >Adicionar produto</button>
        </div>
        <PrimaryButton type="submit" disabled={linhas.some((linha) => !linha.chaveIdempotencia)} pendingText="Registrando…" className="w-full sm:w-auto">
          Registrar reposições
        </PrimaryButton>
      </FormularioComFeedback>
    </Card>
  );
}
