"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientes, produtos, trocasMercado } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import { ErroFormulario, falhaFormulario, type EstadoFormulario } from "@/lib/formularios";
import { exigirNumeroFinito, exigirUuid } from "@/lib/validacao";

export async function carregarTrocasMercado() {
  await exigirSessaoAdministrativa();
  const [listaClientes, listaProdutos, saldos] = await Promise.all([
    db.select({ id: clientes.id, nome: clientes.nome })
      .from(clientes).where(eq(clientes.ativo, true)).orderBy(asc(clientes.nome)),
    db.select({ id: produtos.id, descricao: produtos.descricao, unidade: produtos.unidade })
      .from(produtos).where(eq(produtos.ativo, true)).orderBy(asc(produtos.descricao)),
    db.select({
      id: trocasMercado.id,
      clienteId: trocasMercado.clienteId,
      produtoId: trocasMercado.produtoId,
      quantidadeDisponivel: trocasMercado.quantidadeDisponivel,
      atualizadoEm: trocasMercado.atualizadoEm,
      clienteNome: clientes.nome,
      produtoDescricao: produtos.descricao,
      unidade: produtos.unidade,
    })
      .from(trocasMercado)
      .innerJoin(clientes, eq(trocasMercado.clienteId, clientes.id))
      .innerJoin(produtos, eq(trocasMercado.produtoId, produtos.id))
      .where(and(eq(clientes.ativo, true), eq(produtos.ativo, true)))
      .orderBy(asc(clientes.nome), asc(produtos.descricao)),
  ]);
  return { clientes: listaClientes, produtos: listaProdutos, saldos };
}

/**
 * Registra mercadoria física devolvida pelo mercado. A operação é aditiva:
 * cada registro soma unidades ao saldo existente; ela nunca sobrescreve nem
 * apaga um saldo já conciliado.
 */
export async function adicionarTrocaMercado(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const clienteId = exigirUuid(String(formData.get("clienteId") ?? ""), "Mercado");
    const produtoId = exigirUuid(String(formData.get("produtoId") ?? ""), "Produto");
    const quantidade = exigirNumeroFinito(
      Number(String(formData.get("quantidade") ?? "").trim()),
      "Quantidade de troca",
      { minimo: 0.001 },
    );

    const [cadastro] = await db
      .select({ clienteId: clientes.id, produtoId: produtos.id })
      .from(clientes)
      .innerJoin(produtos, eq(produtos.ativo, true))
      .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, true), eq(produtos.id, produtoId)))
      .limit(1);
    if (!cadastro) throw new ErroFormulario("Mercado ou produto não está disponível.");

    await db
      .insert(trocasMercado)
      .values({ clienteId, produtoId, quantidadeDisponivel: String(quantidade) })
      .onConflictDoUpdate({
        target: [trocasMercado.clienteId, trocasMercado.produtoId],
        set: {
          quantidadeDisponivel: sql`${trocasMercado.quantidadeDisponivel} + ${String(quantidade)}`,
          atualizadoEm: new Date(),
        },
      });
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível registrar a troca.");
  }

  revalidatePath("/trocas");
  revalidatePath("/distribuicao");
  redirect("/trocas?salvo=troca-registrada");
}
