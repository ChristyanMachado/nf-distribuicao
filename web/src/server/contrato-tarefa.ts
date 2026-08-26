import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clientes,
  emitentes,
  lotesDistribuicao,
  produtos,
  regrasFiscais,
  tarefaItens,
  tarefas,
} from "@/db/schema";
import { montarContratoTarefaV1 } from "@/lib/contrato-tarefa";
import { exigirUuid } from "@/lib/validacao";

type LeitorContrato = Pick<typeof db, "select">;

/**
 * Produz o contrato interno de uma tarefa; não é uma Server Action pública.
 * O executor opcional permite gerar o snapshot dentro da mesma transação que
 * criou a tarefa, antes que ela fique visível para a função de reserva.
 */
export async function gerarContratoTarefaPendente(
  tarefaId: string,
  executor: LeitorContrato = db,
) {
  exigirUuid(tarefaId, "Tarefa");

  const [cabecalho] = await executor
    .select({
      tarefaId: tarefas.id,
      status: tarefas.status,
      clienteId: tarefas.clienteId,
      emitenteId: tarefas.emitenteId,
      numeroDistribuicao: lotesDistribuicao.numero,
      nomeEmitente: emitentes.nome,
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
    .from(tarefas)
    .innerJoin(clientes, eq(tarefas.clienteId, clientes.id))
    .innerJoin(emitentes, eq(tarefas.emitenteId, emitentes.id))
    .innerJoin(lotesDistribuicao, eq(tarefas.loteId, lotesDistribuicao.id))
    .where(and(eq(tarefas.id, tarefaId), eq(tarefas.status, "PENDENTE")))
    .limit(1);
  if (!cabecalho) throw new Error("Tarefa pendente não encontrada.");

  const itens = await executor
    .select({
      produtoId: tarefaItens.produtoId,
      descricao: produtos.descricao,
      codigoFiscal: produtos.codigoFiscal,
      unidade: produtos.unidade,
      quantidade: tarefaItens.quantidade,
      precoUnitario: tarefaItens.precoUnitario,
      cfopTexto: regrasFiscais.cfopTexto,
      cfopCodigo: regrasFiscais.cfopCodigo,
      situacaoTributariaIcms: regrasFiscais.situacaoTributariaIcms,
      origemMercadoria: regrasFiscais.origemMercadoria,
      possuiBeneficioFiscal: regrasFiscais.possuiBeneficioFiscal,
      codigoBeneficioFiscal: regrasFiscais.codigoBeneficioFiscal,
      naturezaOperacao: regrasFiscais.naturezaOperacao,
      tipoOperacao: regrasFiscais.tipoOperacao,
      finalidadeEmissao: regrasFiscais.finalidadeEmissao,
      indicadorPresenca: regrasFiscais.indicadorPresenca,
      modalidadeFrete: regrasFiscais.modalidadeFrete,
    })
    .from(tarefaItens)
    .innerJoin(produtos, eq(tarefaItens.produtoId, produtos.id))
    .innerJoin(regrasFiscais, eq(tarefaItens.regraFiscalId, regrasFiscais.id))
    .where(eq(tarefaItens.tarefaId, tarefaId));

  return montarContratoTarefaV1({
    tarefa: {
      id: cabecalho.tarefaId,
      status: cabecalho.status,
      clienteId: cabecalho.clienteId,
      emitenteId: cabecalho.emitenteId,
      numeroDistribuicao: cabecalho.numeroDistribuicao,
      nomeEmitente: cabecalho.nomeEmitente,
    },
    cliente: {
      nome: cabecalho.clienteNome,
      destinatarioNome: cabecalho.destinatarioNome,
      cnpj: cabecalho.cnpj,
      indicadorIe: cabecalho.indicadorIe,
      inscricaoEstadual: cabecalho.inscricaoEstadual,
      cep: cabecalho.cep,
      numeroEndereco: cabecalho.numeroEndereco,
    },
    emitente: {
      credencialReferencia: cabecalho.credencialReferencia,
      valorSelectNfpe: cabecalho.valorSelectNfpe,
    },
    itens: itens.map((item) => ({
      produtoId: item.produtoId,
      descricao: item.descricao,
      codigoFiscal: item.codigoFiscal,
      unidade: item.unidade,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      regra: {
        cfopTexto: item.cfopTexto,
        cfopCodigo: item.cfopCodigo,
        situacaoTributariaIcms: item.situacaoTributariaIcms,
        origemMercadoria: item.origemMercadoria,
        possuiBeneficioFiscal: item.possuiBeneficioFiscal,
        codigoBeneficioFiscal: item.codigoBeneficioFiscal,
        naturezaOperacao: item.naturezaOperacao,
        tipoOperacao: item.tipoOperacao,
        finalidadeEmissao: item.finalidadeEmissao,
        indicadorPresenca: item.indicadorPresenca,
        modalidadeFrete: item.modalidadeFrete,
      },
    })),
  });
}
