"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { produtos } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function listarProdutos() {
  return db.select().from(produtos).orderBy(desc(produtos.criadoEm));
}

export async function criarProduto(formData: FormData) {
  const descricao = String(formData.get("descricao") ?? "").trim();
  const codigoFiscal = String(formData.get("codigoFiscal") ?? "").trim() || null;
  const unidade = String(formData.get("unidade") ?? "UN").trim();
  const precoPadrao = String(formData.get("precoPadrao") ?? "0").trim();

  if (!descricao) {
    throw new Error("Descrição do produto é obrigatória.");
  }

  await db.insert(produtos).values({
    descricao,
    codigoFiscal,
    unidade,
    precoPadrao,
  });

  revalidatePath("/produtos");
}
