"use server";

import { db } from "@/db";
import { clientes, disponibilidades, distribuicoes, lotesDistribuicao, produtos } from "@/db/schema";
import { agruparRoteiroEntrega } from "@/lib/entregas";
import { desc, eq, asc } from "drizzle-orm";

export async function listarLotesEntrega() {
  const lotes = await db
    .select({ id: lotesDistribuicao.id, data: lotesDistribuicao.data, criadoEm: lotesDistribuicao.criadoEm })
    .from(lotesDistribuicao)
    .orderBy(desc(lotesDistribuicao.criadoEm));
  return lotes.map((lote) => ({ ...lote, criadoEm: lote.criadoEm.toISOString() }));
}

export async function carregarRoteiroEntrega(loteId: string) {
  const linhas = await db
    .select({
      clienteId: clientes.id,
      clienteNome: clientes.nome,
      numeroEndereco: clientes.numeroEndereco,
      cep: clientes.cep,
      produtoId: produtos.id,
      produtoDescricao: produtos.descricao,
      unidade: produtos.unidade,
      quantidadeDistribuida: distribuicoes.quantidadeDistribuida,
      quantidadeTroca: distribuicoes.quantidadeTroca,
    })
    .from(distribuicoes)
    .innerJoin(disponibilidades, eq(distribuicoes.disponibilidadeId, disponibilidades.id))
    .innerJoin(clientes, eq(distribuicoes.clienteId, clientes.id))
    .innerJoin(produtos, eq(disponibilidades.produtoId, produtos.id))
    .where(eq(disponibilidades.loteId, loteId))
    .orderBy(asc(clientes.nome), asc(produtos.descricao));

  return agruparRoteiroEntrega(
    linhas.map((linha) => ({
      ...linha,
      quantidadeDistribuida: Number(linha.quantidadeDistribuida),
      quantidadeTroca: Number(linha.quantidadeTroca),
    }))
  );
}
