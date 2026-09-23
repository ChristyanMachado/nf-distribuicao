"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sql } from "drizzle-orm";
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

/** Grava somente a preferência do Worker autenticado; nunca o teto administrativo. */
export async function atualizarConcorrenciaWorker(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const sessao = await exigirSessaoAdministrativa();
  try {
    const workerId = String(formData.get("workerId") ?? "").trim();
    const modo = String(formData.get("mode") ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(workerId)) {
      throw new Error("Servidor selecionado inválido.");
    }
    if (modo !== "MANUAL" && modo !== "AUTOMATICO") {
      throw new Error("Selecione um modo de concorrência válido.");
    }

    const campo = modo === "MANUAL" ? "manualCapacity" : "autoMax";
    const capacidade = Number(formData.get(campo));
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 3) {
      throw new Error("Selecione uma capacidade entre 1 e 3.");
    }

    const registro = modo === "MANUAL"
      ? await db.execute<{ worker_id: string }>(sql`
          UPDATE fiscal.workers
          SET requested_mode = 'MANUAL',
              manual_capacity = ${capacidade},
              concurrency_updated_by = ${(sessao?.usuario ?? "desenvolvimento").slice(0, 160)},
              concurrency_updated_at = clock_timestamp()
          WHERE worker_id = ${workerId}
            AND ${capacidade} <= capacity_limit
            AND ${capacidade} <= local_capacity_limit
          RETURNING worker_id
        `)
      : await db.execute<{ worker_id: string }>(sql`
          UPDATE fiscal.workers
          SET requested_mode = 'AUTOMATICO',
              automatic_max = ${capacidade},
              concurrency_updated_by = ${(sessao?.usuario ?? "desenvolvimento").slice(0, 160)},
              concurrency_updated_at = clock_timestamp()
          WHERE worker_id = ${workerId}
            AND ${capacidade} <= capacity_limit
            AND ${capacidade} <= local_capacity_limit
          RETURNING worker_id
        `);

    if (registro.length !== 1) {
      throw new Error("A capacidade escolhida não está liberada para esse servidor.");
    }
  } catch (erro) {
    return falhaFormulario(erro, "Não foi possível salvar a concorrência. Confira o limite liberado do servidor.");
  }
  revalidatePath("/configuracoes");
  revalidatePath("/tarefas");
  redirect("/configuracoes?concorrenciaSalva=1");
}
