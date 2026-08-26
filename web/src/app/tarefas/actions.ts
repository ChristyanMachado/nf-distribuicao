"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  clientes,
  emitentes,
  lotesDistribuicao,
  produtos,
  tarefaItens,
  tarefas,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { exigirUuid } from "@/lib/validacao";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";

export async function listarTarefasComItens() {
  await exigirSessaoAdministrativa();
  const listaTarefas = await db
    .select({
      id: tarefas.id,
      data: tarefas.data,
      status: tarefas.status,
      tentativas: tarefas.tentativas,
      reservaExpiraEm: tarefas.reservaExpiraEm,
      ultimoErro: tarefas.ultimoErro,
      mensagemStatus: tarefas.mensagemStatus,
      valorTotal: tarefas.valorTotal,
      numeroDistribuicao: lotesDistribuicao.numero,
      clienteNome: clientes.nome,
      emitenteNome: emitentes.nome,
    })
    .from(tarefas)
    .innerJoin(clientes, eq(tarefas.clienteId, clientes.id))
    .innerJoin(emitentes, eq(tarefas.emitenteId, emitentes.id))
    .leftJoin(lotesDistribuicao, eq(tarefas.loteId, lotesDistribuicao.id))
    .orderBy(desc(tarefas.criadoEm))
    .limit(100);

  if (listaTarefas.length === 0) return [];

  const todosItens = await db
    .select({
      tarefaId: tarefaItens.tarefaId,
      produtoDescricao: produtos.descricao,
      quantidade: tarefaItens.quantidade,
      precoUnitario: tarefaItens.precoUnitario,
      subtotal: tarefaItens.subtotal,
    })
    .from(tarefaItens)
    .innerJoin(produtos, eq(tarefaItens.produtoId, produtos.id))
    .where(inArray(tarefaItens.tarefaId, listaTarefas.map((tarefa) => tarefa.id)));

  const itensPorTarefa = new Map<string, typeof todosItens>();
  for (const item of todosItens) {
    const grupo = itensPorTarefa.get(item.tarefaId) ?? [];
    grupo.push(item);
    itensPorTarefa.set(item.tarefaId, grupo);
  }
  return listaTarefas.map((t) => ({
    ...t,
    itens: itensPorTarefa.get(t.id) ?? [],
  }));
}

export async function cancelarTarefa(tarefaId: string) {
  await exigirSessaoAdministrativa();
  exigirUuid(tarefaId, "Tarefa");
  // Só cancela se ainda estiver PENDENTE — não faz sentido cancelar algo
  // que o worker já começou a processar ou já emitiu.
  const canceladas = await db
    .update(tarefas)
    .set({
      status: "CANCELADA",
      mensagemStatus: "Cancelada antes do início do processamento fiscal.",
      atualizadoEm: new Date(),
    })
    .where(and(eq(tarefas.id, tarefaId), eq(tarefas.status, "PENDENTE")))
    .returning({ id: tarefas.id });
  if (canceladas.length === 0) {
    throw new Error("A tarefa já começou ou não está mais disponível para cancelamento.");
  }

  revalidatePath("/tarefas");
}
