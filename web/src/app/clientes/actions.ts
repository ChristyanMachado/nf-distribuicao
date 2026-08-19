"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clientes, emitentes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function listarClientes() {
  return db.select().from(clientes).where(eq(clientes.ativo, true)).orderBy(desc(clientes.criadoEm));
}

export async function listarEmitentes() {
  return db.select().from(emitentes).where(eq(emitentes.ativo, true)).orderBy(desc(emitentes.criadoEm));
}

export async function criarCliente(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim() || null;
  const inscricaoEstadual = String(formData.get("inscricaoEstadual") ?? "").trim() || null;
  const cep = String(formData.get("cep") ?? "").trim() || null;
  const numeroEndereco = String(formData.get("numeroEndereco") ?? "").trim() || null;
  const emitenteId = String(formData.get("emitenteId") ?? "").trim() || null;

  if (!nome) {
    throw new Error("Nome do cliente é obrigatório.");
  }

  // Indicador de IE fica com o default do banco (CONTRIBUINTE) — é o único
  // fluxo confirmado no sistema fiscal até agora (worker/RECON.md).
  await db.insert(clientes).values({
    nome,
    cnpj,
    inscricaoEstadual,
    cep,
    numeroEndereco,
    emitenteId,
  });

  revalidatePath("/clientes");
}
