"use server";

import { db } from "@/db";
import { tarefas, tarefaItens, clientes, produtos, distribuicoes, disponibilidades } from "@/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
import type { ItemRelatorio, TrocaRelatorio } from "@/lib/relatorios";

export async function carregarRelatorio(
  dataInicio: string,
  dataFim: string
): Promise<{ itens: ItemRelatorio[]; trocas: TrocaRelatorio[] }> {
  const itens = await db
    .select({
      tarefaId: tarefaItens.tarefaId,
      data: tarefas.data,
      status: tarefas.status,
      clienteId: tarefas.clienteId,
      clienteNome: clientes.nome,
      produtoId: tarefaItens.produtoId,
      produtoDescricao: produtos.descricao,
      quantidade: tarefaItens.quantidade,
      subtotal: tarefaItens.subtotal,
    })
    .from(tarefaItens)
    .innerJoin(tarefas, eq(tarefaItens.tarefaId, tarefas.id))
    .innerJoin(clientes, eq(tarefas.clienteId, clientes.id))
    .innerJoin(produtos, eq(tarefaItens.produtoId, produtos.id))
    .where(and(gte(tarefas.data, dataInicio), lte(tarefas.data, dataFim)));

  const trocas = await db
    .select({
      data: disponibilidades.data,
      status: tarefas.status,
      clienteId: distribuicoes.clienteId,
      clienteNome: clientes.nome,
      produtoId: disponibilidades.produtoId,
      produtoDescricao: produtos.descricao,
      quantidadeTroca: distribuicoes.quantidadeTroca,
      precoUnitario: distribuicoes.precoUnitario,
    })
    .from(distribuicoes)
    .innerJoin(disponibilidades, eq(distribuicoes.disponibilidadeId, disponibilidades.id))
    .innerJoin(clientes, eq(distribuicoes.clienteId, clientes.id))
    .innerJoin(produtos, eq(disponibilidades.produtoId, produtos.id))
    .innerJoin(
      tarefas,
      and(
        eq(tarefas.clienteId, distribuicoes.clienteId),
        eq(tarefas.emitenteId, distribuicoes.emitenteId),
        eq(tarefas.data, disponibilidades.data)
      )
    )
    .where(and(gte(disponibilidades.data, dataInicio), lte(disponibilidades.data, dataFim)));

  return {
    itens: itens.map((i) => ({
      ...i,
      quantidade: Number(i.quantidade),
      subtotal: Number(i.subtotal),
    })),
    trocas: trocas.map((t) => ({
      ...t,
      quantidadeTroca: Number(t.quantidadeTroca),
      precoUnitario: Number(t.precoUnitario),
    })),
  };
}
