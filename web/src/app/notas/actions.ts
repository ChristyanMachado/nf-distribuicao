"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notas, recuperacoesDocumentos } from "@/db/schema";
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
