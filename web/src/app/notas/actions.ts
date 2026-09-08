"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cancelamentosFiscais, notas, recuperacoesDocumentos } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import { documentosDaNotaDisponiveis } from "@/lib/documentos-nota";
import {
  ErroFormulario,
  falhaFormulario,
  type EstadoFormulario,
} from "@/lib/formularios";
import { exigirUuid } from "@/lib/validacao";

export async function solicitarRecuperacaoDocumento(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const notaId = exigirUuid(String(formData.get("notaId") ?? ""), "Nota");
    await db.transaction(async (tx) => {
      const [nota] = await tx
        .select({
          id: notas.id,
          status: notas.status,
          chaveAcesso: notas.chaveAcesso,
          pdfPath: notas.pdfPath,
          xmlPath: notas.xmlPath,
          documentoExpiraEm: notas.documentoExpiraEm,
        })
        .from(notas)
        .where(eq(notas.id, notaId))
        .for("update");

      if (!nota) throw new ErroFormulario("Nota não encontrada.");
      if (nota.status !== "AUTORIZADA" || !/^\d{44}$/.test(nota.chaveAcesso ?? "")) {
        throw new ErroFormulario(
          "Esta nota não possui uma chave fiscal válida para recuperação. Chame o suporte.",
        );
      }
      if (
        documentosDaNotaDisponiveis(
          nota.pdfPath,
          nota.xmlPath,
          nota.documentoExpiraEm,
        )
      ) {
        throw new ErroFormulario(
          "Os documentos ainda estão disponíveis. Atualize a página para baixá-los.",
        );
      }

      const [cancelamentoAtivo] = await tx
        .select({ status: cancelamentosFiscais.status })
        .from(cancelamentosFiscais)
        .where(eq(cancelamentosFiscais.notaId, notaId));
      if (cancelamentoAtivo && ["PENDENTE", "PROCESSANDO", "AGUARDANDO_CONFERENCIA"].includes(cancelamentoAtivo.status)) {
        throw new ErroFormulario(
          "Esta nota possui um cancelamento em andamento ou aguardando conferência.",
        );
      }

      const [existente] = await tx
        .select({ id: recuperacoesDocumentos.id, status: recuperacoesDocumentos.status })
        .from(recuperacoesDocumentos)
        .where(eq(recuperacoesDocumentos.notaId, notaId));

      if (!existente) {
        await tx.insert(recuperacoesDocumentos).values({
          notaId,
          mensagemStatus: "Recuperação solicitada; aguardando o Worker.",
        });
        return;
      }
      if (existente.status === "PENDENTE" || existente.status === "PROCESSANDO") {
        return;
      }

      await tx
        .update(recuperacoesDocumentos)
        .set({
          status: "PENDENTE",
          reservadaPor: null,
          reservaToken: null,
          reservaExpiraEm: null,
          mensagemStatus: "Nova recuperação solicitada; aguardando o Worker.",
          codigoErro: null,
          solicitadaEm: new Date(),
          iniciadaEm: null,
          concluidaEm: null,
          atualizadoEm: new Date(),
        })
        .where(and(
          eq(recuperacoesDocumentos.id, existente.id),
          eq(recuperacoesDocumentos.status, existente.status),
        ));
    });
  } catch (erro) {
    return falhaFormulario(
      erro,
      "Não foi possível solicitar a recuperação. Atualize a página e tente novamente.",
    );
  }

  revalidatePath("/notas");
  return {};
}

function normalizarMotivoCancelamento(valor: string): string {
  const motivo = valor.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!motivo) throw new ErroFormulario("Informe o motivo do cancelamento.");
  if (motivo.length > 255) {
    throw new ErroFormulario("O motivo deve ter no máximo 255 caracteres.");
  }
  return motivo;
}

/**
 * RF23 — enfileira o cancelamento sem acessar o portal no processo Web.
 * O bloqueio da nota e a linha única por nota tornam cliques repetidos
 * idempotentes; um resultado fiscal incerto nunca é recolocado na fila.
 */
export async function solicitarCancelamentoFiscal(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const notaId = exigirUuid(String(formData.get("notaId") ?? ""), "Nota");
    const motivo = normalizarMotivoCancelamento(String(formData.get("motivo") ?? ""));

    await db.transaction(async (tx) => {
      const [nota] = await tx
        .select({ id: notas.id, status: notas.status, chaveAcesso: notas.chaveAcesso })
        .from(notas)
        .where(eq(notas.id, notaId))
        .for("update");

      if (!nota) throw new ErroFormulario("Nota não encontrada.");
      if (nota.status === "CANCELADA") {
        throw new ErroFormulario("Esta nota já está cancelada.");
      }
      if (nota.status !== "AUTORIZADA" || !/^\d{44}$/.test(nota.chaveAcesso ?? "")) {
        throw new ErroFormulario(
          "Esta nota não possui autorização e chave fiscal válidas para cancelamento.",
        );
      }

      const [recuperacaoAtiva] = await tx
        .select({ status: recuperacoesDocumentos.status })
        .from(recuperacoesDocumentos)
        .where(eq(recuperacoesDocumentos.notaId, notaId));
      if (recuperacaoAtiva && ["PENDENTE", "PROCESSANDO"].includes(recuperacaoAtiva.status)) {
        throw new ErroFormulario(
          "Aguarde a recuperação dos documentos terminar antes de cancelar esta nota.",
        );
      }

      const [existente] = await tx
        .select({ id: cancelamentosFiscais.id, status: cancelamentosFiscais.status })
        .from(cancelamentosFiscais)
        .where(eq(cancelamentosFiscais.notaId, notaId));

      if (!existente) {
        await tx.insert(cancelamentosFiscais).values({
          notaId,
          motivo,
          mensagemStatus: "Cancelamento solicitado; aguardando o Worker.",
        });
        return;
      }
      if (existente.status === "PENDENTE" || existente.status === "PROCESSANDO") return;
      if (existente.status === "CONCLUIDO") {
        throw new ErroFormulario("Esta nota já está cancelada.");
      }
      if (existente.status === "AGUARDANDO_CONFERENCIA") {
        throw new ErroFormulario(
          "O resultado anterior precisa de conferência na Receita. Chame o suporte antes de tentar novamente.",
        );
      }

      await tx
        .update(cancelamentosFiscais)
        .set({
          motivo,
          status: "PENDENTE",
          reservadaPor: null,
          reservaToken: null,
          reservaExpiraEm: null,
          mensagemStatus: "Nova tentativa solicitada; aguardando o Worker.",
          codigoErro: null,
          solicitadaEm: new Date(),
          iniciadaEm: null,
          concluidaEm: null,
          atualizadoEm: new Date(),
        })
        .where(and(
          eq(cancelamentosFiscais.id, existente.id),
          eq(cancelamentosFiscais.status, "ERRO"),
        ));
    });
  } catch (erro) {
    return falhaFormulario(
      erro,
      "Não foi possível solicitar o cancelamento. Atualize a página e tente novamente.",
    );
  }

  revalidatePath("/notas");
  return {};
}

/**
 * Libera uma única nova tentativa após o operador conferir no portal que a
 * nota continua AUTORIZADA. O próprio Worker consulta a situação novamente e
 * não reenvia o comando caso a Receita já informe Cancelada.
 */
export async function confirmarAutorizadaETentarCancelamento(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await exigirSessaoAdministrativa();
  try {
    const notaId = exigirUuid(String(formData.get("notaId") ?? ""), "Nota");
    if (String(formData.get("confirmouAutorizada") ?? "") !== "sim") {
      throw new ErroFormulario(
        "Confirme que você consultou a Receita e que a nota continua Autorizada.",
      );
    }

    await db.transaction(async (tx) => {
      const [nota] = await tx
        .select({ status: notas.status, chaveAcesso: notas.chaveAcesso })
        .from(notas)
        .where(eq(notas.id, notaId))
        .for("update");
      if (!nota) throw new ErroFormulario("Nota não encontrada.");
      if (nota.status === "CANCELADA") {
        throw new ErroFormulario("Esta nota já está cancelada no sistema.");
      }
      if (nota.status !== "AUTORIZADA" || !/^\d{44}$/.test(nota.chaveAcesso ?? "")) {
        throw new ErroFormulario(
          "A nota local não está autorizada com uma chave fiscal válida. Chame o suporte.",
        );
      }

      const [reenfileirado] = await tx
        .update(cancelamentosFiscais)
        .set({
          status: "PENDENTE",
          reservadaPor: null,
          reservaToken: null,
          reservaExpiraEm: null,
          mensagemStatus: "Nova tentativa autorizada após conferência manual na Receita.",
          codigoErro: null,
          solicitadaEm: new Date(),
          iniciadaEm: null,
          concluidaEm: null,
          atualizadoEm: new Date(),
        })
        .where(and(
          eq(cancelamentosFiscais.notaId, notaId),
          eq(cancelamentosFiscais.status, "AGUARDANDO_CONFERENCIA"),
        ))
        .returning({ id: cancelamentosFiscais.id });
      if (!reenfileirado) {
        throw new ErroFormulario(
          "O cancelamento não está aguardando conferência. Atualize a página antes de continuar.",
        );
      }
    });
  } catch (erro) {
    return falhaFormulario(
      erro,
      "Não foi possível liberar a nova tentativa. Atualize a página e tente novamente.",
    );
  }

  revalidatePath("/notas");
  return {};
}
