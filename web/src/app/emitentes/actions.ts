"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { emitentes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { limitarTexto } from "@/lib/validacao";

export async function listarEmitentes() {
  return db
    .select({
      id: emitentes.id,
      nome: emitentes.nome,
      cnpj: emitentes.cnpj,
      credencialReferencia: emitentes.credencialReferencia,
      valorSelectNfpe: emitentes.valorSelectNfpe,
      criadoEm: emitentes.criadoEm,
    })
    .from(emitentes)
    .where(eq(emitentes.ativo, true))
    .orderBy(desc(emitentes.criadoEm));
}

export async function criarEmitente(formData: FormData) {
  const nome = limitarTexto(String(formData.get("nome") ?? ""), "Nome", 160);
  const cnpj = limitarTexto(String(formData.get("cnpj") ?? ""), "CNPJ", 20) || null;
  const inscricaoEstadual =
    limitarTexto(
      String(formData.get("inscricaoEstadual") ?? ""),
      "Inscrição estadual",
      32,
    ) || null;
  const credencialReferencia =
    limitarTexto(
      String(formData.get("credencialReferencia") ?? ""),
      "Referência da credencial",
      64,
    ) || null;
  const valorSelectNfpe =
    limitarTexto(
      String(formData.get("valorSelectNfpe") ?? ""),
      "Identificador NFP-e",
      128,
    ) || null;

  if (!nome) {
    throw new Error("Nome do emitente é obrigatório.");
  }
  if (credencialReferencia && !/^[A-Z][A-Z0-9_]{2,63}$/.test(credencialReferencia)) {
    throw new Error("Referência de credencial deve usar letras maiúsculas, números e _.");
  }
  if (valorSelectNfpe && /[\u0000-\u001f\u007f]/.test(valorSelectNfpe)) {
    throw new Error("Identificador NFP-e contém caracteres inválidos.");
  }

  await db.insert(emitentes).values({
    nome,
    cnpj,
    inscricaoEstadual,
    credencialReferencia,
    valorSelectNfpe,
  });
  revalidatePath("/emitentes");
  revalidatePath("/clientes"); // clientes lista emitentes no dropdown de associação
}
