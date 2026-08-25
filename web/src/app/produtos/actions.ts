"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { produtos, regrasFiscais } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function listarProdutos() {
  return db
    .select({
      id: produtos.id,
      descricao: produtos.descricao,
      codigoFiscal: produtos.codigoFiscal,
      unidade: produtos.unidade,
      precoPadrao: produtos.precoPadrao,
      regraFiscalNome: regrasFiscais.nome,
      ativo: produtos.ativo,
      criadoEm: produtos.criadoEm,
    })
    .from(produtos)
    .innerJoin(regrasFiscais, eq(produtos.regraFiscalId, regrasFiscais.id))
    .orderBy(desc(produtos.criadoEm));
}

export async function listarRegrasFiscaisAtivas() {
  return db
    .select({ id: regrasFiscais.id, nome: regrasFiscais.nome })
    .from(regrasFiscais)
    .where(eq(regrasFiscais.ativo, true))
    .orderBy(regrasFiscais.nome);
}

export async function criarProduto(formData: FormData) {
  const descricao = String(formData.get("descricao") ?? "").trim();
  const codigoFiscal = String(formData.get("codigoFiscal") ?? "").trim() || null;
  const unidade = String(formData.get("unidade") ?? "UN").trim();
  const precoPadrao = String(formData.get("precoPadrao") ?? "0").trim();
  const regraFiscalId = String(formData.get("regraFiscalId") ?? "").trim();

  if (!descricao) {
    throw new Error("Descrição do produto é obrigatória.");
  }
  if (!regraFiscalId) {
    throw new Error("Selecione uma regra fiscal para o produto.");
  }

  const [regraFiscal] = await db
    .select({ id: regrasFiscais.id })
    .from(regrasFiscais)
    .where(and(eq(regrasFiscais.id, regraFiscalId), eq(regrasFiscais.ativo, true)))
    .limit(1);
  if (!regraFiscal) {
    throw new Error("A regra fiscal selecionada não está disponível.");
  }

  await db.insert(produtos).values({
    descricao,
    codigoFiscal,
    unidade,
    precoPadrao,
    regraFiscalId,
  });

  revalidatePath("/produtos");
}
