"use server";

import { db } from "@/db";
import { tarefas, tarefaItens, clientes, produtos, distribuicoes, disponibilidades } from "@/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
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
    .where(and(gte(tarefas.data, periodo.inicio), lte(tarefas.data, periodo.fim)));

  const consultaTrocas = db
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
    .leftJoin(
      tarefas,
      and(
        eq(tarefas.clienteId, distribuicoes.clienteId),
        eq(tarefas.emitenteId, distribuicoes.emitenteId),
        eq(tarefas.loteId, disponibilidades.loteId)
      )
    )
    .where(and(gte(disponibilidades.data, periodo.inicio), lte(disponibilidades.data, periodo.fim)));

  const consultaOperacionais = db.select({
    id: tarefas.id,
    loteId: tarefas.loteId,
    status: tarefas.status,
    tentativas: tarefas.tentativas,
    iniciadoEm: tarefas.iniciadoEm,
    concluidoEm: tarefas.concluidoEm,
  }).from(tarefas).where(and(gte(tarefas.data, periodo.inicio), lte(tarefas.data, periodo.fim)));

  // As três leituras são independentes. Executá-las em paralelo reduz a
  // latência percebida ao trocar o filtro, especialmente em conexão móvel.
  const [itens, trocas, operacionais] = await Promise.all([
    consultaItens,
    consultaTrocas,
    consultaOperacionais,
  ]);

  return {
    itens: itens.map((i) => ({
      ...i,
      quantidade: Number(i.quantidade),
      subtotal: Number(i.subtotal),
    })),
    trocas: trocas.map((t) => ({
      ...t,
      status: t.status ?? "SEM_TAREFA",
      quantidadeTroca: Number(t.quantidadeTroca),
      precoUnitario: Number(t.precoUnitario),
    })),
    tarefas: operacionais,
  };
}
