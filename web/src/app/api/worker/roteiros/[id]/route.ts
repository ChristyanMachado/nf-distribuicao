import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { clientes, disponibilidades, distribuicoes, impressoesRoteiro, lotesDistribuicao, produtos } from "@/db/schema";
import { agruparRoteiroEntrega } from "@/lib/entregas";
import { montarHtmlRoteiroImpressao } from "@/lib/roteiro-impressao";
import { exigirUuid } from "@/lib/validacao";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { exigirUuid(id, "Roteiro"); } catch { return new NextResponse("Não encontrado.", { status: 404 }); }
  const token = request.headers.get("authorization")?.match(/^Bearer ([0-9a-f-]{36})$/i)?.[1];
  if (!token) return new NextResponse("Não autorizado.", { status: 401 });
  const [pedido] = await db.select({ loteId: impressoesRoteiro.loteId, numero: lotesDistribuicao.numero, data: lotesDistribuicao.data })
    .from(impressoesRoteiro).innerJoin(lotesDistribuicao, eq(impressoesRoteiro.loteId, lotesDistribuicao.id))
    .where(and(eq(impressoesRoteiro.id, id), eq(impressoesRoteiro.status, "RESERVADA"), eq(impressoesRoteiro.reservaToken, token), gt(impressoesRoteiro.reservaExpiraEm, new Date()))).limit(1);
  if (!pedido) return new NextResponse("Reserva ausente ou vencida.", { status: 403 });
  const linhas = await db.select({ clienteId: clientes.id, clienteNome: clientes.nome, numeroEndereco: clientes.numeroEndereco, cep: clientes.cep, produtoId: produtos.id, produtoDescricao: produtos.descricao, unidade: produtos.unidade, quantidadeDistribuida: distribuicoes.quantidadeDistribuida, quantidadeTroca: distribuicoes.quantidadeTroca, quantidadeFaturavel: distribuicoes.quantidadeFaturavel, precoUnitario: distribuicoes.precoUnitario })
    .from(distribuicoes).innerJoin(disponibilidades, eq(distribuicoes.disponibilidadeId, disponibilidades.id)).innerJoin(clientes, eq(distribuicoes.clienteId, clientes.id)).innerJoin(produtos, eq(disponibilidades.produtoId, produtos.id)).where(eq(disponibilidades.loteId, pedido.loteId)).orderBy(asc(clientes.nome), asc(produtos.descricao));
  const roteiro = agruparRoteiroEntrega(linhas.map((linha) => ({ ...linha, quantidadeDistribuida: Number(linha.quantidadeDistribuida), quantidadeTroca: Number(linha.quantidadeTroca), quantidadeFaturavel: Number(linha.quantidadeFaturavel), precoUnitario: Number(linha.precoUnitario) })));
  return new NextResponse(montarHtmlRoteiroImpressao(pedido.numero, pedido.data, roteiro), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
