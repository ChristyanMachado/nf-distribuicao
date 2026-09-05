"use server";

import { db } from "@/db";
import { clientes, disponibilidades, distribuicoes, lotesDistribuicao, produtos } from "@/db/schema";
import { agruparRoteiroEntrega } from "@/lib/entregas";
import { desc, eq, asc } from "drizzle-orm";
import { exigirUuid } from "@/lib/validacao";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";

export async function listarLotesEntrega() {
  await exigirSessaoAdministrativa();
  const lotes = await db
    .select({ id: lotesDistribuicao.id, numero: lotesDistribuicao.numero, data: lotesDistribuicao.data, criadoEm: lotesDistribuicao.criadoEm })
    .from(lotesDistribuicao)
    .orderBy(desc(lotesDistribuicao.criadoEm));
  return lotes.map((lote) => ({ ...lote, criadoEm: lote.criadoEm.toISOString() }));
}

export async function carregarRoteiroEntrega(loteId: string) {
  await exigirSessaoAdministrativa();
  exigirUuid(loteId, "Lote");
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
      quantidadeFaturavel: distribuicoes.quantidadeFaturavel,
      precoUnitario: distribuicoes.precoUnitario,
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
      quantidadeFaturavel: Number(linha.quantidadeFaturavel),
      precoUnitario: Number(linha.precoUnitario),
    }))
  );
}
