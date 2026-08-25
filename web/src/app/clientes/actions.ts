"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clientes, emitentes, clienteEmitentes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { exigirUuid, limitarTexto } from "@/lib/validacao";

export async function listarClientes() {
  return db.select().from(clientes).where(eq(clientes.ativo, true)).orderBy(desc(clientes.criadoEm));
}

export async function listarEmitentes() {
  // Seleção explícita: as colunas legadas de credencial jamais atravessam a
  // fronteira Server Action -> navegador.
  return db
    .select({ id: emitentes.id, nome: emitentes.nome, cnpj: emitentes.cnpj })
    .from(emitentes)
    .where(eq(emitentes.ativo, true))
    .orderBy(desc(emitentes.criadoEm));
}

export async function criarCliente(formData: FormData) {
  const nome = limitarTexto(String(formData.get("nome") ?? ""), "Nome", 160);
  const destinatarioNome =
    limitarTexto(
      String(formData.get("destinatarioNome") ?? ""),
      "Razão social",
      200,
    ) || null;
  const cnpj = limitarTexto(String(formData.get("cnpj") ?? ""), "CNPJ", 20) || null;
  const inscricaoEstadual = limitarTexto(String(formData.get("inscricaoEstadual") ?? ""), "Inscrição estadual", 32) || null;
  const cep = limitarTexto(String(formData.get("cep") ?? ""), "CEP", 12) || null;
  const numeroEndereco = limitarTexto(String(formData.get("numeroEndereco") ?? ""), "Número", 32) || null;
  const emitenteIdsRecebidos = formData
    .getAll("emitenteIds")
    .map((id) => String(id).trim())
    .filter(Boolean);
  const emitenteIds = [...new Set(emitenteIdsRecebidos)];

  if (emitenteIdsRecebidos.length > 100) throw new Error("Quantidade de emitentes excede o limite.");
  for (const emitenteId of emitenteIds) exigirUuid(emitenteId, "Emitente");

  if (!nome) {
    throw new Error("Nome do cliente é obrigatório.");
  }

  await db.transaction(async (tx) => {
    // Indicador de IE fica com o default do banco (CONTRIBUINTE) — é o único
    // fluxo confirmado no sistema fiscal até agora (worker/RECON.md).
    const [cliente] = await tx.insert(clientes).values({
      nome,
      destinatarioNome,
      cnpj,
      inscricaoEstadual,
      cep,
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
