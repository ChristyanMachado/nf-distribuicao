"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clientes, emitentes, clienteEmitentes } from "@/db/schema";
import {
  exigirCep,
  exigirCnpj,
  exigirInscricaoEstadual,
  exigirUuid,
  limitarTexto,
} from "@/lib/validacao";

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

function lerDadosCliente(formData: FormData) {
  const nome = limitarTexto(String(formData.get("nome") ?? ""), "Nome", 160);
  const destinatarioNome = limitarTexto(
    String(formData.get("destinatarioNome") ?? ""),
    "Razão social",
    200,
  );
  const numeroEndereco = limitarTexto(
    String(formData.get("numeroEndereco") ?? ""),
    "Número",
    32,
  );
  if (!nome || !destinatarioNome || !numeroEndereco) {
    throw new Error("Nome, razão social e número do endereço são obrigatórios.");
  }

  const emitenteIdsRecebidos = formData
    .getAll("emitenteIds")
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (emitenteIdsRecebidos.length < 1 || emitenteIdsRecebidos.length > 100) {
    throw new Error("Selecione entre 1 e 100 emitentes habilitados.");
  }
  const emitenteIds = [...new Set(emitenteIdsRecebidos)];
  for (const emitenteId of emitenteIds) exigirUuid(emitenteId, "Emitente");

  return {
    valores: {
      nome,
      destinatarioNome,
      cnpj: exigirCnpj(String(formData.get("cnpj") ?? "")),
      inscricaoEstadual: exigirInscricaoEstadual(
        String(formData.get("inscricaoEstadual") ?? ""),
      ),
      cep: exigirCep(String(formData.get("cep") ?? "")),
      numeroEndereco,
      indicadorIe: "CONTRIBUINTE" as const,
    },
    emitenteIds,
  };
}

async function validarEmitentesAtivos(emitenteIds: string[]) {
  const ativos = await db
    .select({ id: emitentes.id })
    .from(emitentes)
    .where(and(inArray(emitentes.id, emitenteIds), eq(emitentes.ativo, true)));
  if (ativos.length !== emitenteIds.length) {
    throw new Error("Um dos emitentes selecionados não está disponível.");
  }
}

export async function criarCliente(formData: FormData) {
  const dados = lerDadosCliente(formData);
  await validarEmitentesAtivos(dados.emitenteIds);

  await db.transaction(async (tx) => {
    const [cliente] = await tx.insert(clientes).values(dados.valores).returning();
    await tx.insert(clienteEmitentes).values(
      dados.emitenteIds.map((emitenteId) => ({ clienteId: cliente.id, emitenteId })),
    );
  });

  revalidatePath("/clientes");
  revalidatePath("/distribuicao");
}

export async function atualizarCliente(formData: FormData) {
  const clienteId = exigirUuid(String(formData.get("clienteId") ?? ""), "Cliente");
  const dados = lerDadosCliente(formData);
  await validarEmitentesAtivos(dados.emitenteIds);

  await db.transaction(async (tx) => {
    const atualizados = await tx
      .update(clientes)
      .set(dados.valores)
      .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, true)))
      .returning({ id: clientes.id });
    if (atualizados.length !== 1) throw new Error("Cliente não encontrado.");

    await tx.delete(clienteEmitentes).where(eq(clienteEmitentes.clienteId, clienteId));
    await tx.insert(clienteEmitentes).values(
      dados.emitenteIds.map((emitenteId) => ({ clienteId, emitenteId })),
    );
  });

  revalidatePath("/clientes");
  revalidatePath("/distribuicao");
}
