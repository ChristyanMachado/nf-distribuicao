"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  clientes,
  emitentes,
  clienteEmitentes,
  produtos,
  precosCliente,
  disponibilidades,
  distribuicoes,
  tarefas,
  tarefaItens,
} from "@/db/schema";
import { calcularFaturavel, validarDistribuicaoTotal } from "@/lib/calculos";
import { eq, and } from "drizzle-orm";

export async function carregarDadosDistribuicao() {
  const [listaClientes, listaProdutos, listaPrecos, relacoes] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.ativo, true)),
    db.select().from(produtos).where(eq(produtos.ativo, true)),
    db.select().from(precosCliente),
    db
      .select({ clienteId: clienteEmitentes.clienteId, id: emitentes.id, nome: emitentes.nome })
      .from(clienteEmitentes)
      .innerJoin(emitentes, eq(clienteEmitentes.emitenteId, emitentes.id))
      .where(eq(emitentes.ativo, true)),
  ]);

  // chave "produtoId:clienteId" -> preço praticado — usado pra pré-preencher
  // o campo de preço na distribuição com o último valor usado pra esse par.
  const precos: Record<string, string> = {};
  for (const p of listaPrecos) {
    precos[`${p.produtoId}:${p.clienteId}`] = p.preco;
  }

  const emitentesPorCliente: Record<string, { id: string; nome: string }[]> = {};
  for (const relacao of relacoes) {
    (emitentesPorCliente[relacao.clienteId] ??= []).push({
      id: relacao.id,
      nome: relacao.nome,
    });
  }

  return {
    clientes: listaClientes.map((cliente) => ({
      ...cliente,
      emitentes: emitentesPorCliente[cliente.id] ?? [],
    })),
    produtos: listaProdutos,
    precos,
  };
}

type LinhaDistribuicao = {
  clienteId: string;
  emitenteId: string;
  quantidadeDistribuida: number;
  quantidadeTroca: number;
  precoUnitario: number;
};

type ProdutoDistribuicao = {
  produtoId: string;
  quantidadeTotal: number;
  linhas: LinhaDistribuicao[];
};

/**
 * RF06-RF11 + doc. de atualizações de 14/08 — processa VÁRIOS produtos numa
 * mesma distribuição, cada um com sua própria disponibilidade, distribuição
 * por cliente e contribuição pra tarefa (uma tarefa por cliente/dia,
 * acumulando itens de todos os produtos processados juntos).
 */
export async function processarDistribuicao(input: {
  data: string;
  produtos: ProdutoDistribuicao[];
}) {
  for (const produto of input.produtos) {
    const validacao = validarDistribuicaoTotal(produto.quantidadeTotal, produto.linhas);
    if (!validacao.valido) {
      throw new Error(
        `Distribuição do produto excede a disponibilidade (${validacao.totalDistribuido} > ${produto.quantidadeTotal}).`
      );
    }
  }

  await db.transaction(async (tx) => {
    const paresComFaturamento = new Map<string, LinhaDistribuicao>();
    for (const produto of input.produtos) {
      for (const linha of produto.linhas) {
        if (linha.quantidadeDistribuida <= linha.quantidadeTroca) continue;
        if (!linha.emitenteId) {
          throw new Error("Selecione o emitente de cada cliente com quantidade faturável.");
        }
        paresComFaturamento.set(`${linha.clienteId}:${linha.emitenteId}`, linha);
      }
    }

    for (const linha of paresComFaturamento.values()) {
      const [relacao] = await tx
        .select({ id: clienteEmitentes.id })
        .from(clienteEmitentes)
        .where(
          and(
            eq(clienteEmitentes.clienteId, linha.clienteId),
            eq(clienteEmitentes.emitenteId, linha.emitenteId)
          )
        )
        .limit(1);
      if (!relacao) {
        throw new Error("O emitente escolhido não está habilitado para um dos clientes.");
      }
    }

    for (const produto of input.produtos) {
      const [disponibilidade] = await tx
        .insert(disponibilidades)
        .values({
          produtoId: produto.produtoId,
          data: input.data,
          quantidadeDisponivel: String(produto.quantidadeTotal),
        })
        .returning();

      for (const linha of produto.linhas) {
        if (linha.quantidadeDistribuida <= 0) continue;

        const faturavel = calcularFaturavel(linha);

        await tx.insert(distribuicoes).values({
          disponibilidadeId: disponibilidade.id,
          clienteId: linha.clienteId,
          emitenteId: linha.emitenteId,
          quantidadeDistribuida: String(linha.quantidadeDistribuida),
          quantidadeTroca: String(linha.quantidadeTroca),
          quantidadeFaturavel: String(faturavel.quantidadeFaturavel),
          precoUnitario: String(linha.precoUnitario),
        });

        // Aprende o preço praticado pra esse par produto+cliente (upsert).
        await tx
          .insert(precosCliente)
          .values({
            produtoId: produto.produtoId,
            clienteId: linha.clienteId,
            preco: String(linha.precoUnitario),
          })
          .onConflictDoUpdate({
            target: [precosCliente.produtoId, precosCliente.clienteId],
            set: { preco: String(linha.precoUnitario), atualizadoEm: new Date() },
          });

        if (faturavel.quantidadeFaturavel <= 0) continue;

        // Uma tarefa por cliente/dia — reaproveita se já existir PENDENTE,
        // acumulando itens de múltiplos produtos na mesma tarefa.
        const existente = await tx
          .select()
          .from(tarefas)
          .where(
            and(
              eq(tarefas.clienteId, linha.clienteId),
              eq(tarefas.emitenteId, linha.emitenteId),
              eq(tarefas.data, input.data),
              eq(tarefas.status, "PENDENTE")
            )
          )
          .limit(1);

        const tarefa =
          existente[0] ??
          (
            await tx
              .insert(tarefas)
              .values({
                clienteId: linha.clienteId,
                emitenteId: linha.emitenteId,
                data: input.data,
                status: "PENDENTE",
                valorTotal: "0",
              })
              .returning()
          )[0];

        await tx.insert(tarefaItens).values({
          tarefaId: tarefa.id,
          produtoId: produto.produtoId,
          quantidade: String(faturavel.quantidadeFaturavel),
          precoUnitario: String(linha.precoUnitario),
          subtotal: String(faturavel.subtotal),
        });

        await tx
          .update(tarefas)
          .set({
            valorTotal: String(Number(tarefa.valorTotal) + faturavel.subtotal),
            atualizadoEm: new Date(),
          })
          .where(eq(tarefas.id, tarefa.id));
      }
    }
  });

  revalidatePath("/distribuicao");
  revalidatePath("/tarefas");
}
