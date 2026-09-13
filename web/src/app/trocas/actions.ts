"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientes, produtos, trocasLancamentos, trocasMercado } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import { ErroFormulario, falhaFormulario, type EstadoFormulario } from "@/lib/formularios";
import { exigirNumeroFinito, exigirUuid } from "@/lib/validacao";
import { deMilesimos, emMilesimos } from "@/lib/quantidades";

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
  let reutilizada = false;
  try {
    const clienteId = exigirUuid(String(formData.get("clienteId") ?? ""), "Mercado");
    const produtoId = exigirUuid(String(formData.get("produtoId") ?? ""), "Produto");
    const chaveIdempotencia = exigirUuid(
      String(formData.get("chaveIdempotencia") ?? ""),
      "Identificador do lançamento",
    );
    const quantidade = exigirNumeroFinito(
      Number(String(formData.get("quantidade") ?? "").trim()),
      "Quantidade de troca",
      { minimo: 0.001 },
    );
    const quantidadeNormalizada = deMilesimos(emMilesimos(quantidade, "Quantidade de troca"));

    const [cadastro] = await db
      .select({ clienteId: clientes.id, produtoId: produtos.id })
      .from(clientes)
      .innerJoin(produtos, eq(produtos.ativo, true))
      .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, true), eq(produtos.id, produtoId)))
      .limit(1);
    if (!cadastro) throw new ErroFormulario("Mercado ou produto não está disponível.");

    reutilizada = await db.transaction(async (tx) => {
      const [lancamento] = await tx
        .insert(trocasLancamentos)
        .values({ clienteId, produtoId, quantidade: quantidadeNormalizada, chaveIdempotencia })
        .onConflictDoNothing({ target: trocasLancamentos.chaveIdempotencia })
        .returning({ id: trocasLancamentos.id });
      if (!lancamento) {
        const [existente] = await tx
          .select({ clienteId: trocasLancamentos.clienteId, produtoId: trocasLancamentos.produtoId, quantidade: trocasLancamentos.quantidade })
          .from(trocasLancamentos)
          .where(eq(trocasLancamentos.chaveIdempotencia, chaveIdempotencia))
          .limit(1);
        if (!existente) throw new ErroFormulario("Não foi possível confirmar o lançamento anterior.");
        if (existente.clienteId !== clienteId || existente.produtoId !== produtoId || existente.quantidade !== quantidadeNormalizada) {
          throw new ErroFormulario("Este envio já foi usado para outro lançamento. Atualize a página e tente novamente.");
        }
        return true;
      }
      await tx
        .insert(trocasMercado)
        .values({ clienteId, produtoId, quantidadeDisponivel: quantidadeNormalizada })
        .onConflictDoUpdate({
          target: [trocasMercado.clienteId, trocasMercado.produtoId],
          set: {
            quantidadeDisponivel: sql`${trocasMercado.quantidadeDisponivel} + ${quantidadeNormalizada}`,
            atualizadoEm: new Date(),
          },
        });
      return false;
    });
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível registrar a troca.");
  }

  revalidatePath("/trocas");
  revalidatePath("/distribuicao");
  redirect(reutilizada ? "/trocas?salvo=troca-reutilizada" : "/trocas?salvo=troca-registrada");
}
