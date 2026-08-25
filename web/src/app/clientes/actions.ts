"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clientes, emitentes, clienteEmitentes } from "@/db/schema";
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
  const logradouro = String(formData.get("logradouro") ?? "").trim() || null;
  const bairro = String(formData.get("bairro") ?? "").trim() || null;
  const cidade = String(formData.get("cidade") ?? "").trim() || null;
  const uf = String(formData.get("uf") ?? "").trim().toUpperCase() || null;
  const numeroEndereco = String(formData.get("numeroEndereco") ?? "").trim() || null;
  const emitenteIds = formData
    .getAll("emitenteIds")
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (!nome) {
    throw new Error("Nome do cliente é obrigatório.");
  }

  await db.transaction(async (tx) => {
    // Indicador de IE fica com o default do banco (CONTRIBUINTE) — é o único
    // fluxo confirmado no sistema fiscal até agora (worker/RECON.md).
    const [cliente] = await tx.insert(clientes).values({
      nome,
      cnpj,
      inscricaoEstadual,
      cep,
      logradouro,
      bairro,
      cidade,
      uf,
      numeroEndereco,
    }).returning();

    if (emitenteIds.length > 0) {
      await tx.insert(clienteEmitentes).values(
        emitenteIds.map((emitenteId) => ({ clienteId: cliente.id, emitenteId }))
      );
    }
  });

  revalidatePath("/clientes");
}
