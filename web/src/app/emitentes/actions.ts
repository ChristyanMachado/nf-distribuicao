"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { emitentes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  exigirCnpj,
  exigirInscricaoEstadual,
  exigirUuid,
  limitarTexto,
} from "@/lib/validacao";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";

export async function listarEmitentes() {
  await exigirSessaoAdministrativa();
  return db
    .select({
      id: emitentes.id,
      nome: emitentes.nome,
      cnpj: emitentes.cnpj,
      inscricaoEstadual: emitentes.inscricaoEstadual,
      credencialReferencia: emitentes.credencialReferencia,
      valorSelectNfpe: emitentes.valorSelectNfpe,
      criadoEm: emitentes.criadoEm,
    })
    .from(emitentes)
    .where(eq(emitentes.ativo, true))
    .orderBy(desc(emitentes.criadoEm));
}

function lerDadosEmitente(formData: FormData) {
  const nome = limitarTexto(String(formData.get("nome") ?? ""), "Nome", 160);
  const credencialReferencia = limitarTexto(
    String(formData.get("credencialReferencia") ?? ""),
    "Referência da credencial",
    64,
  );
  const valorSelectNfpe = limitarTexto(
    String(formData.get("valorSelectNfpe") ?? ""),
    "Identificador NFP-e",
    128,
  );

  if (!nome || !valorSelectNfpe) {
    throw new Error("Nome e identificador NFP-e são obrigatórios.");
  }
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(credencialReferencia)) {
    throw new Error("Referência de credencial deve usar letras maiúsculas, números e _.");
  }
  if (/[\u0000-\u001f\u007f]/.test(valorSelectNfpe)) {
    throw new Error("Identificador NFP-e contém caracteres inválidos.");
  }

  return {
    nome,
    cnpj: exigirCnpj(String(formData.get("cnpj") ?? "")),
    inscricaoEstadual: exigirInscricaoEstadual(
      String(formData.get("inscricaoEstadual") ?? ""),
    ),
    credencialReferencia,
    valorSelectNfpe,
  };
}

export async function criarEmitente(formData: FormData) {
  await exigirSessaoAdministrativa();
  await db.insert(emitentes).values(lerDadosEmitente(formData));
  revalidatePath("/emitentes");
  revalidatePath("/clientes"); // clientes lista emitentes no dropdown de associação
  redirect("/emitentes?salvo=emitente-criado");
}

export async function atualizarEmitente(formData: FormData) {
  await exigirSessaoAdministrativa();
  const emitenteId = exigirUuid(String(formData.get("emitenteId") ?? ""), "Emitente");
  const atualizados = await db
    .update(emitentes)
    .set(lerDadosEmitente(formData))
    .where(eq(emitentes.id, emitenteId))
    .returning({ id: emitentes.id });
  if (atualizados.length !== 1) throw new Error("Emitente não encontrado.");

  revalidatePath("/emitentes");
  revalidatePath("/clientes");
  revalidatePath("/distribuicao");
  redirect("/emitentes?salvo=emitente-atualizado");
}
