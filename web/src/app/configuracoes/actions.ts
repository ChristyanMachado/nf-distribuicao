"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { configuracoesOperacionais } from "@/db/schema";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import { falhaFormulario, type EstadoFormulario } from "@/lib/formularios";
import { validarJanelaOperacional } from "@/lib/janela-operacional";

export async function obterConfiguracaoOperacional() {
  await exigirSessaoAdministrativa();
  const [configuracao] = await db
    .select({
      inicioHora: configuracoesOperacionais.emissaoInicioHora,
      fimHora: configuracoesOperacionais.emissaoFimHora,
      atualizadoEm: configuracoesOperacionais.atualizadoEm,
    })
    .from(configuracoesOperacionais)
    .where(eq(configuracoesOperacionais.id, true))
    .limit(1);
  if (!configuracao) throw new Error("Configuração operacional ausente.");
  return configuracao;
}

export async function atualizarJanelaOperacional(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const sessao = await exigirSessaoAdministrativa();
  try {
    const janela = validarJanelaOperacional(
      formData.get("inicioHora"),
      formData.get("fimHora"),
    );
    const atualizadas = await db
      .update(configuracoesOperacionais)
      .set({
        emissaoInicioHora: janela.inicioHora,
        emissaoFimHora: janela.fimHora,
        atualizadoPor: (sessao?.usuario ?? "desenvolvimento").slice(0, 160),
        atualizadoEm: new Date(),
      })
      .where(eq(configuracoesOperacionais.id, true))
      .returning({ id: configuracoesOperacionais.id });
    if (atualizadas.length !== 1) throw new Error("Configuração ausente.");
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível alterar o horário. Tente novamente.");
  }
  revalidatePath("/configuracoes");
  redirect("/configuracoes?salvo=1");
}
