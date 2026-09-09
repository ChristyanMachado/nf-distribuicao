"use server";

import { db } from "@/db";
import { tarefas, tarefaItens, clientes, produtos, distribuicoes, disponibilidades, notas } from "@/db/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";
import {
  validarIntervaloRelatorio,
  type ItemRelatorio,
  type TarefaOperacional,
  type TrocaRelatorio,
} from "@/lib/relatorios";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";

export async function carregarRelatorio(
  dataInicio: string,
  dataFim: string
): Promise<{ itens: ItemRelatorio[]; trocas: TrocaRelatorio[]; tarefas: TarefaOperacional[] }> {
  await exigirSessaoAdministrativa();
  // A Server Action pode ser chamada fora da interface. Validar aqui evita
  // filtros malformados, intervalos invertidos e consultas excessivas.
  const periodo = validarIntervaloRelatorio(dataInicio, dataFim);

  const consultaItens = db
    .select({
      tarefaId: tarefaItens.tarefaId,
      data: tarefas.data,
      // Nota cancelada é um evento posterior à tarefa concluída. Para valores
      // e rankings, a situação fiscal da nota prevalece sobre o status técnico
      // da tarefa, sem alterar nem reclassificar a tarefa original.
      status: sql<string>`coalesce(${notas.status}::text, ${tarefas.status}::text)`,
      clienteId: tarefas.clienteId,
      clienteNome: clientes.nome,
      produtoId: tarefaItens.produtoId,
      produtoDescricao: produtos.descricao,
      quantidade: tarefaItens.quantidade,
      subtotal: tarefaItens.subtotal,
    })
    .from(tarefaItens)
    .innerJoin(tarefas, eq(tarefaItens.tarefaId, tarefas.id))
    .leftJoin(notas, eq(notas.tarefaId, tarefas.id))
    .innerJoin(clientes, eq(tarefas.clienteId, clientes.id))
    .innerJoin(produtos, eq(tarefaItens.produtoId, produtos.id))
    .where(and(gte(tarefas.data, periodo.inicio), lte(tarefas.data, periodo.fim)));

  const consultaTrocas = db
    .select({
      data: disponibilidades.data,
      status: sql<string>`coalesce(${notas.status}::text, ${tarefas.status}::text)`,
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
    .leftJoin(
      tarefas,
      and(
        eq(tarefas.clienteId, distribuicoes.clienteId),
        eq(tarefas.emitenteId, distribuicoes.emitenteId),
        eq(tarefas.loteId, disponibilidades.loteId)
      )
    )
    .leftJoin(notas, eq(notas.tarefaId, tarefas.id))
    .where(and(gte(disponibilidades.data, periodo.inicio), lte(disponibilidades.data, periodo.fim)));

  const consultaOperacionais = db.select({
    id: tarefas.id,
    loteId: tarefas.loteId,
    status: tarefas.status,
    tentativas: tarefas.tentativas,
    iniciadoEm: tarefas.iniciadoEm,
    concluidoEm: tarefas.concluidoEm,
    notaStatus: notas.status,
  }).from(tarefas)
    .leftJoin(notas, eq(notas.tarefaId, tarefas.id))
    .where(and(gte(tarefas.data, periodo.inicio), lte(tarefas.data, periodo.fim)));

  // As três leituras são independentes. Executá-las em paralelo reduz a
  // latência percebida ao trocar o filtro, especialmente em conexão móvel.
  const [itens, trocas, operacionais] = await Promise.all([
    consultaItens,
    consultaTrocas,
    consultaOperacionais,
  ]);

  const itensNormalizados = itens.map((i) => ({
      ...i,
      quantidade: Number(i.quantidade),
      subtotal: Number(i.subtotal),
    }));
  const quantidadeItensPorTarefa = new Map<string, number>();
  for (const item of itensNormalizados) {
    quantidadeItensPorTarefa.set(
      item.tarefaId,
      (quantidadeItensPorTarefa.get(item.tarefaId) ?? 0) + 1,
    );
  }

  return {
    itens: itensNormalizados,
    trocas: trocas.map((t) => ({
      ...t,
      status: t.status ?? "SEM_TAREFA",
      quantidadeTroca: Number(t.quantidadeTroca),
      precoUnitario: Number(t.precoUnitario),
    })),
    tarefas: operacionais.map((tarefa) => ({
      ...tarefa,
      quantidadeItens: quantidadeItensPorTarefa.get(tarefa.id) ?? 0,
    })),
  };
}
