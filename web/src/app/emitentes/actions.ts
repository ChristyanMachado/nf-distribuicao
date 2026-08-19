"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { emitentes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function listarEmitentes() {
  return db.select().from(emitentes).where(eq(emitentes.ativo, true)).orderBy(desc(emitentes.criadoEm));
}

export async function criarEmitente(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim() || null;
  const inscricaoEstadual = String(formData.get("inscricaoEstadual") ?? "").trim() || null;
  const loginUsuario = String(formData.get("loginUsuario") ?? "").trim() || null;
  const senha = String(formData.get("senha") ?? "").trim() || null;

  if (!nome) {
    throw new Error("Nome do emitente é obrigatório.");
  }

  // O emitente é quem faz login no sistema fiscal (RF: login pertence ao
  // emitente, não ao cliente/destinatário — corrigido em 14/08).
  await db.insert(emitentes).values({ nome, cnpj, inscricaoEstadual, loginUsuario, senha });
  revalidatePath("/emitentes");
  revalidatePath("/clientes"); // clientes lista emitentes no dropdown de associação
}
