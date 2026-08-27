"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { produtos, regrasFiscais, tarefaItens, tarefas } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import {
  ErroFormulario,
  falhaFormulario,
  type EstadoFormulario,
} from "@/lib/formularios";
import { exigirUuid, limitarTexto } from "@/lib/validacao";

const STATUS_TAREFA_ABERTA = [
  "PENDENTE",
  "PROCESSANDO",
  "AGUARDANDO_CONFERENCIA",
  "EMITINDO",
  "ERRO",
] as const;

export async function listarProdutos() {
  await exigirSessaoAdministrativa();
  return db
    .select({
      id: produtos.id,
      descricao: produtos.descricao,
      codigoFiscal: produtos.codigoFiscal,
      unidade: produtos.unidade,
      precoPadrao: produtos.precoPadrao,
      regraFiscalId: produtos.regraFiscalId,
      regraFiscalNome: regrasFiscais.nome,
      ativo: produtos.ativo,
      criadoEm: produtos.criadoEm,
    })
    .from(produtos)
    .innerJoin(regrasFiscais, eq(produtos.regraFiscalId, regrasFiscais.id))
    .orderBy(desc(produtos.criadoEm));
}

export async function listarRegrasFiscaisAtivas() {
  await exigirSessaoAdministrativa();
  return db
    .select({ id: regrasFiscais.id, nome: regrasFiscais.nome })
    .from(regrasFiscais)
    .where(eq(regrasFiscais.ativo, true))
    .orderBy(regrasFiscais.nome);
}

function lerDadosProduto(formData: FormData) {
  const descricao = limitarTexto(
    String(formData.get("descricao") ?? ""),
    "Descrição",
    160,
  );
  const codigoFiscal =
    limitarTexto(
      String(formData.get("codigoFiscal") ?? ""),
      "Código fiscal",
      80,
    ) || null;
  const unidade = limitarTexto(
    String(formData.get("unidade") ?? "UN"),
    "Unidade",
    16,
  ).toUpperCase();
  const regraFiscalId = exigirUuid(
    String(formData.get("regraFiscalId") ?? "").trim(),
    "Regra fiscal",
  );
  const precoNumero = Number(String(formData.get("precoPadrao") ?? "").trim());

  if (!descricao) throw new ErroFormulario("Descrição do produto é obrigatória.");
  if (!codigoFiscal) {
    throw new ErroFormulario("Código fiscal do produto é obrigatório.");
  }
  if (!unidade) throw new ErroFormulario("Unidade do produto é obrigatória.");
  if (
    !Number.isFinite(precoNumero) ||
    precoNumero < 0 ||
    precoNumero > 1_000_000_000
  ) {
    throw new ErroFormulario("Preço padrão inválido.");
  }

  return {
    descricao,
    codigoFiscal,
    unidade,
    precoPadrao: precoNumero.toFixed(2),
    regraFiscalId,
  };
}

async function validarRegraFiscalAtiva(regraFiscalId: string) {
  const [regraFiscal] = await db
    .select({ id: regrasFiscais.id })
    .from(regrasFiscais)
    .where(
      and(eq(regrasFiscais.id, regraFiscalId), eq(regrasFiscais.ativo, true)),
    )
    .limit(1);
  if (!regraFiscal) {
    throw new ErroFormulario("A regra fiscal selecionada não está disponível.");
  }
}

function revalidarProdutos() {
  revalidatePath("/");
  revalidatePath("/produtos");
  revalidatePath("/distribuicao");
}

export async function criarProduto(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const dados = lerDadosProduto(formData);
    await validarRegraFiscalAtiva(dados.regraFiscalId);
    await db.insert(produtos).values(dados);
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível cadastrar o produto.");
  }

  revalidarProdutos();
  redirect("/produtos?salvo=produto-criado");
}

export async function atualizarProduto(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const produtoId = exigirUuid(
      String(formData.get("produtoId") ?? ""),
      "Produto",
    );
    const dados = lerDadosProduto(formData);
    await validarRegraFiscalAtiva(dados.regraFiscalId);
    const atualizados = await db
      .update(produtos)
      .set(dados)
      .where(and(eq(produtos.id, produtoId), eq(produtos.ativo, true)))
      .returning({ id: produtos.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Produto não encontrado ou já desativado.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível salvar o produto.");
  }

  revalidarProdutos();
  redirect("/produtos?salvo=produto-atualizado");
}

export async function desativarProduto(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const produtoId = exigirUuid(
      String(formData.get("produtoId") ?? ""),
      "Produto",
    );
    const [tarefaAberta] = await db
      .select({ id: tarefas.id })
      .from(tarefaItens)
      .innerJoin(tarefas, eq(tarefaItens.tarefaId, tarefas.id))
      .where(
        and(
          eq(tarefaItens.produtoId, produtoId),
          inArray(tarefas.status, [...STATUS_TAREFA_ABERTA]),
        ),
      )
      .limit(1);
    if (tarefaAberta) {
      throw new ErroFormulario(
        "Este produto possui tarefa em aberto. Cancele ou conclua a tarefa antes de desativar.",
      );
    }
    const atualizados = await db
      .update(produtos)
      .set({ ativo: false })
      .where(and(eq(produtos.id, produtoId), eq(produtos.ativo, true)))
      .returning({ id: produtos.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Produto não encontrado ou já desativado.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível desativar o produto.");
  }

  revalidarProdutos();
  redirect("/produtos?salvo=produto-desativado");
}

export async function reativarProduto(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const produtoId = exigirUuid(
      String(formData.get("produtoId") ?? ""),
      "Produto",
    );
    const [regraAtiva] = await db
      .select({ id: regrasFiscais.id })
      .from(produtos)
      .innerJoin(regrasFiscais, eq(produtos.regraFiscalId, regrasFiscais.id))
      .where(
        and(eq(produtos.id, produtoId), eq(regrasFiscais.ativo, true)),
      )
      .limit(1);
    if (!regraAtiva) {
      throw new ErroFormulario(
        "A regra fiscal deste produto está desativada. Selecione uma regra ativa antes de reativar.",
      );
    }
    const atualizados = await db
      .update(produtos)
      .set({ ativo: true })
      .where(and(eq(produtos.id, produtoId), eq(produtos.ativo, false)))
      .returning({ id: produtos.id });
    if (atualizados.length !== 1) {
      throw new ErroFormulario("Produto não encontrado ou já ativo.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível reativar o produto.");
  }

  revalidarProdutos();
  redirect("/produtos?salvo=produto-reativado");
}
