import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { exigirSessaoAdministrativa } from "@/lib/auth-server";
import { projetarWorker, type PainelWorkers, type RegistroWorker } from "./workers-visao";

export async function carregarWorkers(): Promise<PainelWorkers> {
  await exigirSessaoAdministrativa();
  try {
    // Ausência confirmada da view permite publicar Web antes da migration.
    // Falha de conexão/permissão não equivale a monitoramento não configurado.
    const existencia = await db.execute<{ registro: string | null }>(sql`
      select to_regclass('fiscal.worker_status')::text as registro
    `);
    if (existencia.length !== 1) return { situacao: "indisponivel", workers: [] };
    if (existencia[0].registro === null) return { situacao: "nao_configurado", workers: [] };

    const registros = await db.execute<RegistroWorker>(sql`
      select worker_id, priority, enabled, capacity_limit, reported_capacity,
             heartbeat_at, lease_expires_at, version, draining, state,
             active_task_ids, tasks_completed, last_error_code, preferred,
             coordination_enabled, server_now
      from fiscal.worker_status
      order by priority asc, worker_id asc
    `);
    return { situacao: "disponivel", workers: registros.map(projetarWorker) };
  } catch {
    // Nunca expor URL, papel, host ou exceção de banco no navegador.
    return { situacao: "indisponivel", workers: [] };
  }
}
