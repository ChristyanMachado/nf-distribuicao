import { describe, expect, it } from "vitest";
import { projetarWorker, erroWorkerSeguro, descreverEstadoWorker, intervaloAtualizacaoWorkers, type RegistroWorker } from "./workers-visao";

const registro: RegistroWorker = {
  worker_id: "pc-principal", priority: 10, enabled: true, capacity_limit: 1, reported_capacity: 1,
  heartbeat_at: "2026-09-10T12:00:00Z", lease_expires_at: "2026-09-10T12:02:00Z", version: "abc123",
  draining: false, state: "ONLINE", active_task_ids: [], tasks_completed: "3", last_error_code: null,
  preferred: true, coordination_enabled: true, server_now: "2026-09-10T12:00:31Z",
};
describe("visibilidade dos executores", () => {
  it("usa relógio do banco e projeção que exclui dados extras", () => {
    const view = projetarWorker({...registro, db_role: "privado", senha: "segredo"} as RegistroWorker);
    expect(view.segundosSemContato).toBe(31);
    expect(JSON.stringify(view)).not.toMatch(/privado|segredo|db_role/);
  });
  it("não imprime erros arbitrários nem versões adulteradas", () => {
    expect(erroWorkerSeguro("senha privada")).not.toContain("senha privada");
    expect(projetarWorker({...registro, version: "url\nsegredo"}).versao).toBeNull();
  });
  it("distingue silêncio de diagnóstico confirmado de máquina morta", () => {
    expect(descreverEstadoWorker({...projetarWorker(registro), estado: "OFFLINE"})).toBe("Possivelmente desconectado");
    expect(descreverEstadoWorker({estado:"OFFLINE", ultimoContato:null})).toBe("Sem primeiro contato");
  });
  it("acompanha executor ocioso e acelera durante processamento", () => {
    expect(intervaloAtualizacaoWorkers(false)).toBe(30000);
    expect(intervaloAtualizacaoWorkers(true)).toBe(10000);
  });
});
