"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tarefas, tarefaItens, clientes, produtos, emitentes } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";

export async function listarTarefasComItens() {
  const listaTarefas = await db
    .select({
      id: tarefas.id,
      data: tarefas.data,
      status: tarefas.status,
      valorTotal: tarefas.valorTotal,
      clienteNome: clientes.nome,
      emitenteNome: emitentes.nome,
    })
    .from(tarefas)
    .innerJoin(clientes, eq(tarefas.clienteId, clientes.id))
    .innerJoin(emitentes, eq(tarefas.emitenteId, emitentes.id))
    .orderBy(desc(tarefas.criadoEm));

  const todosItens = await db
    .select({
      tarefaId: tarefaItens.tarefaId,
      produtoDescricao: produtos.descricao,
      quantidade: tarefaItens.quantidade,
      precoUnitario: tarefaItens.precoUnitario,
      subtotal: tarefaItens.subtotal,
    })
    .from(tarefaItens)
    .innerJoin(produtos, eq(tarefaItens.produtoId, produtos.id));

  return listaTarefas.map((t) => ({
    ...t,
    itens: todosItens.filter((i) => i.tarefaId === t.id),
  }));
}

export async function cancelarTarefa(tarefaId: string) {
  // Só cancela se ainda estiver PENDENTE — não faz sentido cancelar algo
  // que o worker já começou a processar ou já emitiu.
  await db
    .update(tarefas)
    .set({ status: "CANCELADA", atualizadoEm: new Date() })
    .where(and(eq(tarefas.id, tarefaId), eq(tarefas.status, "PENDENTE")));

  revalidatePath("/tarefas");
}
