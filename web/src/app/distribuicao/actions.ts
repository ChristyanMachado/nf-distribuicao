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
  lotesDistribuicao,
} from "@/db/schema";
import { calcularFaturavel, validarDistribuicaoTotal } from "@/lib/calculos";
import {
  exigirCep,
  exigirCnpj,
  exigirDataIso,
  exigirInscricaoEstadual,
  exigirNumeroFinito,
  exigirUuid,
  limitarTexto,
} from "@/lib/validacao";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { gerarContratoTarefaPendente } from "@/server/contrato-tarefa";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";

export async function carregarDadosDistribuicao() {
  await exigirSessaoAdministrativa();
  const [listaClientes, listaProdutos, listaPrecos, relacoes, lotesRecentes] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.ativo, true)),
    db.select().from(produtos).where(eq(produtos.ativo, true)),
    db.select().from(precosCliente),
    db
      .select({
        clienteId: clienteEmitentes.clienteId,
        id: emitentes.id,
        nome: emitentes.nome,
        credencialReferencia: emitentes.credencialReferencia,
        valorSelectNfpe: emitentes.valorSelectNfpe,
      })
      .from(clienteEmitentes)
      .innerJoin(emitentes, eq(clienteEmitentes.emitenteId, emitentes.id))
      .where(eq(emitentes.ativo, true)),
    // O atalho diario considera somente um lote que ainda possa ser repetido
    // com os cadastros atuais. Clientes, produtos e emitentes desativados (ou
    // uma relacao cliente-emitente removida) nunca voltam selecionados.
    db
      .select({
        id: lotesDistribuicao.id,
        numero: lotesDistribuicao.numero,
      })
      .from(lotesDistribuicao)
      .innerJoin(disponibilidades, eq(disponibilidades.loteId, lotesDistribuicao.id))
      .innerJoin(produtos, and(
        eq(produtos.id, disponibilidades.produtoId),
        eq(produtos.ativo, true),
      ))
      .innerJoin(distribuicoes, eq(distribuicoes.disponibilidadeId, disponibilidades.id))
      .innerJoin(clientes, and(
        eq(clientes.id, distribuicoes.clienteId),
        eq(clientes.ativo, true),
      ))
      .innerJoin(emitentes, and(
        eq(emitentes.id, distribuicoes.emitenteId),
        eq(emitentes.ativo, true),
      ))
      .innerJoin(clienteEmitentes, and(
        eq(clienteEmitentes.clienteId, distribuicoes.clienteId),
        eq(clienteEmitentes.emitenteId, distribuicoes.emitenteId),
      ))
      .orderBy(desc(lotesDistribuicao.criadoEm), desc(lotesDistribuicao.numero))
      .limit(1),
  ]);

  const ultimoLote = lotesRecentes[0];
  const linhasUltimoLote = ultimoLote
    ? await db
        .select({
          produtoId: disponibilidades.produtoId,
          quantidadeTotal: disponibilidades.quantidadeDisponivel,
          clienteId: distribuicoes.clienteId,
          emitenteId: distribuicoes.emitenteId,
          quantidadeDistribuida: distribuicoes.quantidadeDistribuida,
          quantidadeTroca: distribuicoes.quantidadeTroca,
          precoUnitario: distribuicoes.precoUnitario,
        })
        .from(disponibilidades)
        .innerJoin(produtos, and(
          eq(produtos.id, disponibilidades.produtoId),
          eq(produtos.ativo, true),
        ))
        .innerJoin(distribuicoes, eq(distribuicoes.disponibilidadeId, disponibilidades.id))
        .innerJoin(clientes, and(
          eq(clientes.id, distribuicoes.clienteId),
          eq(clientes.ativo, true),
        ))
        .innerJoin(emitentes, and(
          eq(emitentes.id, distribuicoes.emitenteId),
          eq(emitentes.ativo, true),
        ))
        .innerJoin(clienteEmitentes, and(
          eq(clienteEmitentes.clienteId, distribuicoes.clienteId),
          eq(clienteEmitentes.emitenteId, distribuicoes.emitenteId),
        ))
        .where(eq(disponibilidades.loteId, ultimoLote.id))
    : [];

  // chave "produtoId:clienteId" -> preço praticado — usado pra pré-preencher
  // o campo de preço na distribuição com o último valor usado pra esse par.
  const precos: Record<string, string> = {};
  for (const p of listaPrecos) {
    precos[`${p.produtoId}:${p.clienteId}`] = p.preco;
  }

  const emitentesPorCliente: Record<string, { id: string; nome: string }[]> = {};
  for (const relacao of relacoes) {
    if (
      !relacao.credencialReferencia
      || !/^[A-Z][A-Z0-9_]{2,63}$/.test(relacao.credencialReferencia)
      || !relacao.valorSelectNfpe?.trim()
    ) continue;
    (emitentesPorCliente[relacao.clienteId] ??= []).push({
      id: relacao.id,
      nome: relacao.nome,
    });
  }

  const produtosUltimoLote = new Map<
    string,
    {
      produtoId: string;
      quantidadeTotal: string;
      linhas: {
        clienteId: string;
        emitenteId: string;
        quantidadeDistribuida: string;
        quantidadeTroca: string;
        precoUnitario: string;
      }[];
    }
  >();
  for (const linha of linhasUltimoLote) {
    let produto = produtosUltimoLote.get(linha.produtoId);
    if (!produto) {
      produto = {
        produtoId: linha.produtoId,
        quantidadeTotal: linha.quantidadeTotal,
        linhas: [],
      };
      produtosUltimoLote.set(linha.produtoId, produto);
    }
    produto.linhas.push({
      clienteId: linha.clienteId,
      emitenteId: linha.emitenteId,
      quantidadeDistribuida: linha.quantidadeDistribuida,
      quantidadeTroca: linha.quantidadeTroca,
      precoUnitario: linha.precoUnitario,
    });
  }

  return {
    clientes: listaClientes.map((cliente) => {
      const emitentesProntos = emitentesPorCliente[cliente.id] ?? [];
      let pronto = emitentesProntos.length > 0;
      try {
        exigirCnpj(cliente.cnpj ?? "");
        exigirCep(cliente.cep ?? "");
        limitarTexto(cliente.destinatarioNome || cliente.nome, "Razão social", 200);
        if (!limitarTexto(cliente.numeroEndereco ?? "", "Número", 32)) pronto = false;
        if (cliente.indicadorIe === "CONTRIBUINTE") {
          exigirInscricaoEstadual(cliente.inscricaoEstadual ?? "");
        }
      } catch {
        pronto = false;
      }
      return {
        ...cliente,
        emitentes: emitentesProntos,
        prontoParaEmissao: pronto,
      };
    }),
    // Produto ativo mas fiscalmente incompleto não pode entrar no formulário:
    // o erro seria descoberto apenas depois de o usuário distribuir tudo.
    produtos: listaProdutos.filter(
      (produto) => Boolean(produto.codigoFiscal?.trim() && produto.regraFiscalId),
    ),
    precos,
    ultimaDistribuicao: ultimoLote && produtosUltimoLote.size > 0
      ? {
          loteId: ultimoLote.id,
          numero: ultimoLote.numero,
          produtos: [...produtosUltimoLote.values()],
        }
      : null,
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

// Protege a Server Action contra payloads artificiais muito maiores que a
// interface consegue produzir. O teto não limita a operação esperada (hoje
// são poucos clientes/produtos), mas impede milhões de validações/inserts em
// uma única requisição autenticada ou repetida por automação maliciosa.
const MAX_PRODUTOS_POR_DISTRIBUICAO = 200;
const MAX_LINHAS_POR_PRODUTO = 1_000;
const MAX_LINHAS_POR_DISTRIBUICAO = 2_000;

/**
 * RF06-RF11 + doc. de atualizações de 14/08 — processa VÁRIOS produtos numa
 * mesma distribuição, cada um com sua própria disponibilidade, distribuição
 * por cliente e contribuição pra tarefa (uma tarefa por cliente/dia,
 * acumulando itens de todos os produtos processados juntos).
 */
export async function processarDistribuicao(input: {
  chaveIdempotencia: string;
  data: string;
  produtos: ProdutoDistribuicao[];
}) {
  await exigirSessaoAdministrativa();
  exigirUuid(input?.chaveIdempotencia, "Identificador do envio");
  exigirDataIso(input?.data);
  if (
    !Array.isArray(input?.produtos)
    || input.produtos.length < 1
    || input.produtos.length > MAX_PRODUTOS_POR_DISTRIBUICAO
  ) {
    throw new Error(
      `A distribuição deve conter entre 1 e ${MAX_PRODUTOS_POR_DISTRIBUICAO} produtos.`,
    );
  }

  const produtosRecebidos = new Set<string>();
  let totalLinhas = 0;
  for (const produto of input.produtos) {
    exigirUuid(produto.produtoId, "Produto");
    if (produtosRecebidos.has(produto.produtoId)) throw new Error("Produto repetido na distribuição.");
    produtosRecebidos.add(produto.produtoId);
    exigirNumeroFinito(produto.quantidadeTotal, "Quantidade disponível");
    if (!Array.isArray(produto.linhas) || produto.linhas.length > MAX_LINHAS_POR_PRODUTO) {
      throw new Error("Quantidade de clientes por produto excede o limite de segurança.");
    }
    totalLinhas += produto.linhas.length;
    if (totalLinhas > MAX_LINHAS_POR_DISTRIBUICAO) {
      throw new Error("A distribuição excede o limite total de linhas por envio.");
    }
    const clientesRecebidos = new Set<string>();
    for (const linha of produto.linhas) {
      exigirUuid(linha.clienteId, "Cliente");
      if (clientesRecebidos.has(linha.clienteId)) throw new Error("Cliente repetido no produto.");
      clientesRecebidos.add(linha.clienteId);
      exigirNumeroFinito(linha.quantidadeDistribuida, "Quantidade distribuída");
      exigirNumeroFinito(linha.quantidadeTroca, "Quantidade de troca");
      exigirNumeroFinito(linha.precoUnitario, "Preço unitário");
      if (linha.quantidadeDistribuida > 0) exigirUuid(linha.emitenteId, "Emitente");
    }
    const validacao = validarDistribuicaoTotal(produto.quantidadeTotal, produto.linhas);
    if (!validacao.valido) {
      throw new Error(
        `Distribuição do produto excede a disponibilidade (${validacao.totalDistribuido} > ${produto.quantidadeTotal}).`
      );
    }
  }

  const resultado = await db.transaction(async (tx) => {
    const [lote] = await tx
      .insert(lotesDistribuicao)
      .values({ data: input.data, chaveIdempotencia: input.chaveIdempotencia })
      .onConflictDoNothing({ target: lotesDistribuicao.chaveIdempotencia })
      .returning();
    if (!lote) {
      const [existente] = await tx.select({ id: lotesDistribuicao.id, numero: lotesDistribuicao.numero })
        .from(lotesDistribuicao).where(eq(lotesDistribuicao.chaveIdempotencia, input.chaveIdempotencia)).limit(1);
      if (!existente) throw new Error("Não foi possível recuperar a distribuição já processada.");
      const tarefasExistentes = await tx.select({ id: tarefas.id }).from(tarefas).where(eq(tarefas.loteId, existente.id));
      for (const tarefa of tarefasExistentes) {
        const [semSnapshot] = await tx
          .select({ id: tarefas.id })
          .from(tarefas)
          .where(and(eq(tarefas.id, tarefa.id), isNull(tarefas.payloadHash)))
          .limit(1);
        if (!semSnapshot) continue;
        const payload = await gerarContratoTarefaPendente(tarefa.id, tx);
        const payloadJson = JSON.stringify(payload);
        await tx
          .update(tarefas)
          .set({
            contratoVersao: 1,
            payloadWorker: payload,
            payloadHash: sql<string>`encode(
              digest(${payloadJson}::jsonb::text, 'sha256'),
              'hex'
            )`,
          })
          .where(eq(tarefas.id, tarefa.id));
      }
      return { loteId: existente.id, numeroDistribuicao: existente.numero, tarefasCriadas: tarefasExistentes.length, reutilizada: true, tarefaIds: tarefasExistentes.map((tarefa) => tarefa.id) };
    }
    const tarefasDoLote = new Set<string>();

    // A regra é buscada uma vez e gravada no item da tarefa como snapshot da
    // escolha do produto. Assim, uma futura troca de regra não reinterpreta
    // uma tarefa que já estava pendente.
    const regrasDosProdutos = new Map(
      (
        await tx
          .select({ id: produtos.id, regraFiscalId: produtos.regraFiscalId })
          .from(produtos)
          .where(eq(produtos.ativo, true))
      ).map((produto) => [produto.id, produto.regraFiscalId])
    );
    for (const produtoId of produtosRecebidos) {
      if (!regrasDosProdutos.has(produtoId)) throw new Error("Produto não encontrado ou inativo.");
    }

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

    if (paresComFaturamento.size > 0) {
      const linhasFaturaveis = [...paresComFaturamento.values()];
      const clientesFaturaveis = [...new Set(linhasFaturaveis.map((linha) => linha.clienteId))];
      const emitentesFaturaveis = [...new Set(linhasFaturaveis.map((linha) => linha.emitenteId))];
      const relacoesValidas = await tx
        .select({
          clienteId: clienteEmitentes.clienteId,
          emitenteId: clienteEmitentes.emitenteId,
          clienteNome: clientes.nome,
          destinatarioNome: clientes.destinatarioNome,
          cnpj: clientes.cnpj,
          indicadorIe: clientes.indicadorIe,
          inscricaoEstadual: clientes.inscricaoEstadual,
          cep: clientes.cep,
          numeroEndereco: clientes.numeroEndereco,
          credencialReferencia: emitentes.credencialReferencia,
          valorSelectNfpe: emitentes.valorSelectNfpe,
        })
        .from(clienteEmitentes)
        .innerJoin(clientes, eq(clienteEmitentes.clienteId, clientes.id))
        .innerJoin(emitentes, eq(clienteEmitentes.emitenteId, emitentes.id))
        .where(
          and(
            inArray(clienteEmitentes.clienteId, clientesFaturaveis),
            inArray(clienteEmitentes.emitenteId, emitentesFaturaveis),
          ),
        );
      const chavesValidas = new Set(
        relacoesValidas.map((relacao) => `${relacao.clienteId}:${relacao.emitenteId}`),
      );
      if ([...paresComFaturamento.keys()].some((chave) => !chavesValidas.has(chave))) {
        throw new Error("O emitente escolhido não está habilitado para um dos clientes.");
      }
      for (const cadastro of relacoesValidas) {
        exigirCnpj(cadastro.cnpj ?? "");
        exigirCep(cadastro.cep ?? "");
        if (
          !limitarTexto(
            cadastro.destinatarioNome || cadastro.clienteNome,
            "Razão social",
            200,
          )
          || !limitarTexto(cadastro.numeroEndereco ?? "", "Número", 32)
        ) {
          throw new Error("Um cliente selecionado possui cadastro fiscal incompleto.");
        }
        if (cadastro.indicadorIe === "CONTRIBUINTE") {
          exigirInscricaoEstadual(cadastro.inscricaoEstadual ?? "");
        }
        if (
          !cadastro.credencialReferencia
          || !/^[A-Z][A-Z0-9_]{2,63}$/.test(cadastro.credencialReferencia)
          || !cadastro.valorSelectNfpe?.trim()
        ) {
          throw new Error("Um emitente selecionado ainda não está pronto para o Worker.");
        }
      }
    }

    for (const produto of input.produtos) {
      const [disponibilidade] = await tx
        .insert(disponibilidades)
        .values({
          loteId: lote.id,
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

        const regraFiscalId = regrasDosProdutos.get(produto.produtoId);
        if (!regraFiscalId) {
          throw new Error("Produto sem regra fiscal configurada.");
        }

        // Uma tarefa por cliente/dia — reaproveita se já existir PENDENTE,
        // acumulando itens de múltiplos produtos na mesma tarefa.
        const existente = await tx
          .select()
          .from(tarefas)
          .where(
            and(
              eq(tarefas.clienteId, linha.clienteId),
              eq(tarefas.emitenteId, linha.emitenteId),
              eq(tarefas.loteId, lote.id),
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
                loteId: lote.id,
                clienteId: linha.clienteId,
                emitenteId: linha.emitenteId,
                data: input.data,
                status: "PENDENTE",
                valorTotal: "0",
              })
              .returning()
          )[0];
        tarefasDoLote.add(tarefa.id);

        await tx.insert(tarefaItens).values({
          tarefaId: tarefa.id,
          produtoId: produto.produtoId,
          regraFiscalId,
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
    for (const tarefaId of tarefasDoLote) {
      const payload = await gerarContratoTarefaPendente(tarefaId, tx);
      const payloadJson = JSON.stringify(payload);
      await tx
        .update(tarefas)
        .set({
          contratoVersao: 1,
          payloadWorker: payload,
          payloadHash: sql<string>`encode(
            digest(${payloadJson}::jsonb::text, 'sha256'),
            'hex'
          )`,
        })
        .where(eq(tarefas.id, tarefaId));
    }

    return { loteId: lote.id, numeroDistribuicao: lote.numero, tarefasCriadas: tarefasDoLote.size, reutilizada: false, tarefaIds: [...tarefasDoLote] };
  });

  revalidatePath("/distribuicao");
  revalidatePath("/tarefas");
  revalidatePath("/entregas");
  return {
    loteId: resultado.loteId,
    numeroDistribuicao: resultado.numeroDistribuicao,
    tarefasCriadas: resultado.tarefasCriadas,
    reutilizada: resultado.reutilizada,
  };
}
