"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { produtos, regrasFiscais } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { exigirUuid, limitarTexto } from "@/lib/validacao";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";

export async function listarProdutos() {
  await exigirSessaoAdministrativa();
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
  await exigirSessaoAdministrativa();
  return db
    .select({ id: regrasFiscais.id, nome: regrasFiscais.nome })
    .from(regrasFiscais)
    .where(eq(regrasFiscais.ativo, true))
    .orderBy(regrasFiscais.nome);
}

export async function criarProduto(formData: FormData) {
  await exigirSessaoAdministrativa();
  const descricao = limitarTexto(String(formData.get("descricao") ?? ""), "Descrição", 160);
  const codigoFiscal = limitarTexto(String(formData.get("codigoFiscal") ?? ""), "Código fiscal", 80) || null;
  const unidade = limitarTexto(String(formData.get("unidade") ?? "UN"), "Unidade", 16);
  const precoPadrao = String(formData.get("precoPadrao") ?? "0").trim();
  const regraFiscalId = String(formData.get("regraFiscalId") ?? "").trim();

  if (!descricao) {
    throw new Error("Descrição do produto é obrigatória.");
  }
  if (!codigoFiscal) {
    throw new Error("Código fiscal do produto é obrigatório.");
  }
  if (!unidade) {
    throw new Error("Unidade do produto é obrigatória.");
  }
  if (!regraFiscalId) {
    throw new Error("Selecione uma regra fiscal para o produto.");
  }
  exigirUuid(regraFiscalId, "Regra fiscal");
  const precoNumero = Number(precoPadrao);
  if (!Number.isFinite(precoNumero) || precoNumero < 0 || precoNumero > 1_000_000_000) {
    throw new Error("Preço padrão inválido.");
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
  redirect("/produtos?salvo=produto-criado");
}
