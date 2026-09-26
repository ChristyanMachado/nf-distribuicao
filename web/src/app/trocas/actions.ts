"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientes, produtos, trocasAjustes, trocasLancamentos, trocasMercado } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import { ErroFormulario, falhaFormulario, type EstadoFormulario } from "@/lib/formularios";
import { exigirNumeroFinito, exigirUuid } from "@/lib/validacao";
import { deMilesimos, emMilesimos } from "@/lib/quantidades";
import { lerItensLoteTrocas } from "./lote";

export async function carregarTrocasMercado() {
  await exigirSessaoAdministrativa();
  const listaClientes = await db.select({ id: clientes.id, nome: clientes.nome })
    .from(clientes).where(eq(clientes.ativo, true)).orderBy(asc(clientes.nome));
  const listaProdutos = await db.select({ id: produtos.id, descricao: produtos.descricao, unidade: produtos.unidade })
    .from(produtos).where(eq(produtos.ativo, true)).orderBy(asc(produtos.descricao));
  const saldos = await db.select({
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
      .where(and(
        eq(clientes.ativo, true),
        eq(produtos.ativo, true),
        gt(trocasMercado.quantidadeDisponivel, "0"),
      ))
      .orderBy(asc(clientes.nome), asc(produtos.descricao));
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

/** Inclui vários produtos para o mesmo mercado numa única transação. */
export async function adicionarTrocasEmLote(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  let reutilizados = 0;
  let total = 0;
  try {
    const clienteId = exigirUuid(formData.get("clienteId"), "Mercado");
    const itens = lerItensLoteTrocas(formData);
    total = itens.length;
    const [cliente] = await db.select({ id: clientes.id }).from(clientes)
      .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, true))).limit(1);
    if (!cliente) throw new ErroFormulario("Mercado não está disponível.");
    const produtosAtivos = await db.select({ id: produtos.id }).from(produtos)
      .where(and(eq(produtos.ativo, true), inArray(produtos.id, itens.map((item) => item.produtoId))));
    if (produtosAtivos.length !== itens.length) throw new ErroFormulario("Há um produto indisponível no envio.");

    reutilizados = await db.transaction(async (tx) => {
      let repetidos = 0;
      for (const item of itens) {
        const [lancamento] = await tx.insert(trocasLancamentos)
          .values({ clienteId, produtoId: item.produtoId, quantidade: item.quantidade, chaveIdempotencia: item.chaveIdempotencia })
          .onConflictDoNothing({ target: trocasLancamentos.chaveIdempotencia })
          .returning({ id: trocasLancamentos.id });
        if (!lancamento) {
          const [existente] = await tx.select({
            clienteId: trocasLancamentos.clienteId,
            produtoId: trocasLancamentos.produtoId,
            quantidade: trocasLancamentos.quantidade,
          }).from(trocasLancamentos)
            .where(eq(trocasLancamentos.chaveIdempotencia, item.chaveIdempotencia)).limit(1);
          if (!existente || existente.clienteId !== clienteId || existente.produtoId !== item.produtoId || existente.quantidade !== item.quantidade) {
            throw new ErroFormulario("Este envio já foi usado com outros dados. Atualize a página e tente novamente.");
          }
          repetidos++;
          continue;
        }
        await tx.insert(trocasMercado)
          .values({ clienteId, produtoId: item.produtoId, quantidadeDisponivel: item.quantidade })
          .onConflictDoUpdate({
            target: [trocasMercado.clienteId, trocasMercado.produtoId],
            set: {
              quantidadeDisponivel: sql`${trocasMercado.quantidadeDisponivel} + ${item.quantidade}`,
              atualizadoEm: new Date(),
            },
          });
      }
      return repetidos;
    });
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível registrar as reposições.");
  }
  revalidatePath("/trocas");
  revalidatePath("/distribuicao");
  redirect(reutilizados === total ? "/trocas?salvo=troca-reutilizada" : "/trocas?salvo=troca-registrada");
}

/** Altera apenas o saldo ainda pendente, mantendo o histórico já consumido. */
export async function ajustarSaldoTroca(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  let zerado = false;
  try {
    const saldoId = exigirUuid(formData.get("saldoId"), "Saldo");
    const chaveIdempotencia = exigirUuid(formData.get("chaveIdempotencia"), "Identificador do ajuste");
    const normalizar = (valor: FormDataEntryValue | null, campo: string) => {
      if (typeof valor !== "string" || !valor.trim()) throw new ErroFormulario(`${campo} obrigatório.`);
      const numero = exigirNumeroFinito(Number(String(valor ?? "").trim()), campo,
        { minimo: 0, maximo: 999_999_999.999 });
      return deMilesimos(emMilesimos(numero, campo));
    };
    const quantidadeAntes = normalizar(formData.get("quantidadeAntes"), "Saldo anterior");
    const quantidadeDepois = normalizar(formData.get("quantidadeDepois"), "Novo saldo");
    if (quantidadeAntes === quantidadeDepois) throw new ErroFormulario("O novo saldo deve ser diferente do atual.");
    zerado = quantidadeDepois === "0.000";

    await db.transaction(async (tx) => {
      const [ajuste] = await tx.insert(trocasAjustes)
        .values({ saldoId, chaveIdempotencia, quantidadeAntes, quantidadeDepois })
        .onConflictDoNothing({ target: trocasAjustes.chaveIdempotencia })
        .returning({ id: trocasAjustes.id });
      if (!ajuste) {
        const [existente] = await tx.select({
          saldoId: trocasAjustes.saldoId,
          quantidadeAntes: trocasAjustes.quantidadeAntes,
          quantidadeDepois: trocasAjustes.quantidadeDepois,
        }).from(trocasAjustes)
          .where(eq(trocasAjustes.chaveIdempotencia, chaveIdempotencia)).limit(1);
        if (!existente || existente.saldoId !== saldoId || existente.quantidadeAntes !== quantidadeAntes || existente.quantidadeDepois !== quantidadeDepois) {
          throw new ErroFormulario("Este ajuste já foi usado com outros dados. Atualize a página e tente novamente.");
        }
        return;
      }
      const [saldoAtualizado] = await tx.update(trocasMercado)
        .set({ quantidadeDisponivel: quantidadeDepois, atualizadoEm: new Date() })
        .where(and(eq(trocasMercado.id, saldoId), eq(trocasMercado.quantidadeDisponivel, quantidadeAntes)))
        .returning({ id: trocasMercado.id });
      if (!saldoAtualizado) {
        throw new ErroFormulario("O saldo mudou desde que esta tela foi aberta. Atualize a página e confira antes de ajustar.");
      }
    });
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível ajustar a reposição pendente.");
  }
  revalidatePath("/trocas");
  revalidatePath("/distribuicao");
  redirect(zerado ? "/trocas?salvo=troca-zerada" : "/trocas?salvo=troca-ajustada");
}
