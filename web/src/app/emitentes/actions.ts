"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { emitentes, tarefas } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import {
  ErroFormulario,
  falhaFormulario,
  type EstadoFormulario,
} from "@/lib/formularios";
import {
  exigirCpfOuCnpj,
  exigirInscricaoEstadual,
  exigirUuid,
  limitarTexto,
} from "@/lib/validacao";

const STATUS_TAREFA_ABERTA = [
  "PENDENTE",
  "PROCESSANDO",
  "AGUARDANDO_CONFERENCIA",
  "EMITINDO",
  "ERRO",
] as const;

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
      ativo: emitentes.ativo,
      criadoEm: emitentes.criadoEm,
    })
    .from(emitentes)
    .orderBy(desc(emitentes.criadoEm));
}

function lerDadosEmitente(formData: FormData) {
  const nome = limitarTexto(String(formData.get("nome") ?? ""), "Nome", 160);
  const credencialReferencia = limitarTexto(
    String(formData.get("credencialReferencia") ?? ""),
    "Código da credencial",
    64,
  ).toUpperCase();
  const valorSelectNfpe = limitarTexto(
    String(formData.get("valorSelectNfpe") ?? ""),
    "Código interno da NFP-e",
    128,
  );

  if (!nome || !valorSelectNfpe) {
    throw new ErroFormulario("Nome e código interno da NFP-e são obrigatórios.");
  }
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(credencialReferencia)) {
    throw new ErroFormulario(
      "O código da credencial deve usar letras maiúsculas, números e _.",
    );
  }
  if (/[\u0000-\u001f\u007f]/.test(valorSelectNfpe)) {
    throw new ErroFormulario("O código interno da NFP-e contém caracteres inválidos.");
  }

  const inscricaoEstadualRecebida = String(
    formData.get("inscricaoEstadual") ?? "",
  ).trim();

  return {
    nome,
    // A coluna mantém o nome legado, mas guarda CPF ou CNPJ do emitente.
    cnpj: exigirCpfOuCnpj(String(formData.get("cnpj") ?? "")),
    inscricaoEstadual: inscricaoEstadualRecebida
      ? exigirInscricaoEstadual(inscricaoEstadualRecebida)
      : null,
    credencialReferencia,
    valorSelectNfpe,
  };
}

function revalidarCadastros() {
  revalidatePath("/");
  revalidatePath("/emitentes");
  revalidatePath("/clientes");
  revalidatePath("/distribuicao");
}

export async function criarEmitente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    await db.insert(emitentes).values(lerDadosEmitente(formData));
  } catch (erro) {
    return falhaFormulario(
      erro,
      "Não foi possível cadastrar. Confira se o código da credencial já está em uso.",
    );
  }
  revalidarCadastros();
  redirect("/emitentes?salvo=emitente-criado");
}

export async function atualizarEmitente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const emitenteId = exigirUuid(
      String(formData.get("emitenteId") ?? ""),
      "Emitente",
    );
    const atualizados = await db
      .update(emitentes)
      .set(lerDadosEmitente(formData))
      .where(and(eq(emitentes.id, emitenteId), eq(emitentes.ativo, true)))
      .returning({ id: emitentes.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Emitente não encontrado ou já desativado.");
    }
  } catch (erro) {
    return falhaFormulario(
      erro,
      "Não foi possível salvar o emitente. Tente novamente.",
    );
  }
  revalidarCadastros();
  redirect("/emitentes?salvo=emitente-atualizado");
}

export async function desativarEmitente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const emitenteId = exigirUuid(
      String(formData.get("emitenteId") ?? ""),
      "Emitente",
    );
    const [tarefaAberta] = await db
      .select({ id: tarefas.id })
      .from(tarefas)
      .where(
        and(
          eq(tarefas.emitenteId, emitenteId),
          inArray(tarefas.status, [...STATUS_TAREFA_ABERTA]),
        ),
      )
      .limit(1);
    if (tarefaAberta) {
      throw new ErroFormulario(
        "Este emitente possui tarefa em aberto. Cancele ou conclua a tarefa antes de desativar.",
      );
    }
    const atualizados = await db
      .update(emitentes)
      .set({ ativo: false })
      .where(and(eq(emitentes.id, emitenteId), eq(emitentes.ativo, true)))
      .returning({ id: emitentes.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Emitente não encontrado ou já desativado.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível desativar o emitente.");
  }
  revalidarCadastros();
  redirect("/emitentes?salvo=emitente-desativado");
}

export async function reativarEmitente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const emitenteId = exigirUuid(
      String(formData.get("emitenteId") ?? ""),
      "Emitente",
    );
    const atualizados = await db
      .update(emitentes)
      .set({ ativo: true })
      .where(and(eq(emitentes.id, emitenteId), eq(emitentes.ativo, false)))
      .returning({ id: emitentes.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Emitente não encontrado ou já ativo.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível reativar o emitente.");
  }
  revalidarCadastros();
  redirect("/emitentes?salvo=emitente-reativado");
}
