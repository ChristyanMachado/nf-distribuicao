"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clientes, emitentes, clienteEmitentes, tarefas } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import {
  ErroFormulario,
  falhaFormulario,
  type EstadoFormulario,
} from "@/lib/formularios";
import {
  exigirCep,
  exigirCnpj,
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

export async function listarClientes() {
  await exigirSessaoAdministrativa();
  return db.select().from(clientes).orderBy(desc(clientes.criadoEm));
}

export async function listarEmitentes() {
  await exigirSessaoAdministrativa();
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
    throw new ErroFormulario(
      "Nome, razão social e número do endereço são obrigatórios.",
    );
  }

  const emitenteIdsRecebidos = formData
    .getAll("emitenteIds")
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (emitenteIdsRecebidos.length < 1 || emitenteIdsRecebidos.length > 100) {
    throw new ErroFormulario("Selecione ao menos um emitente habilitado.");
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
    throw new ErroFormulario("Um dos emitentes selecionados não está disponível.");
  }
}

function revalidarCadastros() {
  revalidatePath("/");
  revalidatePath("/clientes");
  revalidatePath("/distribuicao");
  revalidatePath("/entregas");
}

export async function criarCliente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const dados = lerDadosCliente(formData);
    await validarEmitentesAtivos(dados.emitenteIds);

    await db.transaction(async (tx) => {
      const [cliente] = await tx.insert(clientes).values(dados.valores).returning();
      await tx.insert(clienteEmitentes).values(
        dados.emitenteIds.map((emitenteId) => ({
          clienteId: cliente.id,
          emitenteId,
        })),
      );
    });
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível cadastrar o cliente. Tente novamente.");
  }

  revalidarCadastros();
  redirect("/clientes?salvo=cliente-criado");
}

export async function atualizarCliente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const clienteId = exigirUuid(
      String(formData.get("clienteId") ?? ""),
      "Cliente",
    );
    const dados = lerDadosCliente(formData);
    await validarEmitentesAtivos(dados.emitenteIds);

    await db.transaction(async (tx) => {
      const atualizados = await tx
        .update(clientes)
        .set(dados.valores)
        .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, true)))
        .returning({ id: clientes.id });
      if (atualizados.length !== 1) {
        throw new ErroFormulario("Cliente não encontrado ou já desativado.");
      }

      await tx.delete(clienteEmitentes).where(eq(clienteEmitentes.clienteId, clienteId));
      await tx.insert(clienteEmitentes).values(
        dados.emitenteIds.map((emitenteId) => ({ clienteId, emitenteId })),
      );
    });
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível salvar o cliente. Tente novamente.");
  }

  revalidarCadastros();
  redirect("/clientes?salvo=cliente-atualizado");
}

export async function desativarCliente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const clienteId = exigirUuid(
      String(formData.get("clienteId") ?? ""),
      "Cliente",
    );
    const [tarefaAberta] = await db
      .select({ id: tarefas.id })
      .from(tarefas)
      .where(
        and(
          eq(tarefas.clienteId, clienteId),
          inArray(tarefas.status, [...STATUS_TAREFA_ABERTA]),
        ),
      )
      .limit(1);
    if (tarefaAberta) {
      throw new ErroFormulario(
        "Este cliente possui tarefa em aberto. Cancele ou conclua a tarefa antes de desativar.",
      );
    }
    const atualizados = await db
      .update(clientes)
      .set({ ativo: false })
      .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, true)))
      .returning({ id: clientes.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Cliente não encontrado ou já desativado.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível desativar o cliente.");
  }
  revalidarCadastros();
  redirect("/clientes?salvo=cliente-desativado");
}

export async function reativarCliente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const clienteId = exigirUuid(
      String(formData.get("clienteId") ?? ""),
      "Cliente",
    );
    const atualizados = await db
      .update(clientes)
      .set({ ativo: true })
      .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, false)))
      .returning({ id: clientes.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Cliente não encontrado ou já ativo.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível reativar o cliente.");
  }
  revalidarCadastros();
  redirect("/clientes?salvo=cliente-reativado");
}
