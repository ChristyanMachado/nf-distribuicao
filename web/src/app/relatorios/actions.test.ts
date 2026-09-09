import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ select: vi.fn(), auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/auth-server", () => ({ exigirSessaoAdministrativa: mocks.auth }));
import { carregarRelatorio } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  const query = { from: () => query, innerJoin: () => query, leftJoin: () => query,
    where: () => Promise.resolve([]) };
  mocks.select.mockReturnValue(query);
});

describe("consultas de relatório", () => {
  it("converte enum da tarefa e status da nota para texto nas duas consultas", async () => {
    expect(await carregarRelatorio("2026-09-01", "2026-09-09")).toEqual({ itens: [], trocas: [], tarefas: [] });
    const dialect = new PgDialect();
    for (const i of [0, 1]) {
      const sql = dialect.sqlToQuery(mocks.select.mock.calls[i][0].status).sql;
      expect(sql).toBe('coalesce("fiscal"."notas"."status"::text, "fiscal"."tarefas"."status"::text)');
    }
  });
  it("não consulta sem sessão nem com período inválido", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("sem sessão"));
    await expect(carregarRelatorio("2026-09-01", "2026-09-09")).rejects.toThrow("sem sessão");
    await expect(carregarRelatorio("2026-09-09", "2026-09-01")).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
