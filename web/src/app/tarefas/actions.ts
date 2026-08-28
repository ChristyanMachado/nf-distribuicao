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
import { CODIGOS_REPROCESSAVEIS } from "@/lib/erros-tarefa";

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
      codigoErro: tarefas.codigoErro,
      valorTotal: tarefas.valorTotal,
      loteId: tarefas.loteId,
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
  try {
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
      return {
        erro: "A tarefa já começou ou não está mais disponível para cancelamento.",
      };
    }
  } catch {
    return { erro: "Não foi possível cancelar a tarefa. Atualize a página e tente novamente." };
  }

  revalidatePath("/tarefas");
  return {};
}

export async function tentarNovamenteTarefa(tarefaId: string) {
  await exigirSessaoAdministrativa();
  try {
    exigirUuid(tarefaId, "Tarefa");
    // Somente códigos gerados antes do início fiscal podem voltar à fila.
    // AGUARDANDO_CONFERENCIA e erros de snapshot jamais passam por este WHERE.
    const liberadas = await db
      .update(tarefas)
      .set({
        status: "PENDENTE",
        reservadaPor: null,
        reservaToken: null,
        reservaExpiraEm: null,
        concluidoEm: null,
        ultimoErro: null,
        codigoErro: null,
        mensagemStatus: "Nova tentativa solicitada; aguardando o Worker.",
        atualizadoEm: new Date(),
      })
      .where(and(
        eq(tarefas.id, tarefaId),
        eq(tarefas.status, "ERRO"),
        inArray(tarefas.codigoErro, [...CODIGOS_REPROCESSAVEIS]),
      ))
      .returning({ id: tarefas.id });

    if (liberadas.length === 0) {
      return {
        erro: "Esta tarefa não pode ser repetida com segurança. Siga a orientação exibida ou chame o suporte.",
      };
    }
  } catch {
    return {
      erro: "Não foi possível solicitar uma nova tentativa. Atualize a página e tente novamente.",
    };
  }

  revalidatePath("/tarefas");
  return {};
}
