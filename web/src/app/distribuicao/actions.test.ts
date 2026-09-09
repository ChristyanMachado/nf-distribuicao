import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), auth: vi.fn(), contrato: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/auth-server", () => ({ exigirSessaoAdministrativa: mocks.auth }));
vi.mock("@/server/contrato-tarefa", () => ({ gerarContratoTarefaPendente: mocks.contrato }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { processarDistribuicao } from "./actions";
import { clienteEmitentes, disponibilidades, distribuicoes, lotesDistribuicao, produtos, tarefas } from "@/db/schema";

const produtoId = "10000000-0000-4000-8000-000000000001";
const clienteId = "20000000-0000-4000-8000-000000000001";
const emitenteId = "30000000-0000-4000-8000-000000000001";
const input = () => ({ chaveIdempotencia: "40000000-0000-4000-8000-000000000001", data: "2026-09-09",
  produtos: [{ produtoId, quantidadeTotal: 2, linhas: [{ clienteId, emitenteId,
    quantidadeDistribuida: 2, quantidadeTroca: 2, precoUnitario: 5, precoPromocional: false }] }] });

// Simula a fronteira transacional; não acessa o banco nem cria tarefa real.
function banco(relacoes: Record<string, unknown>[], reutilizado = false) {
  const escritas: unknown[] = [];
  const filtros: string[] = [];
  let confirmado = false;
  const tx = {
    select: () => ({ from: (tabela: unknown) => {
      const rows = tabela === produtos ? [{ id: produtoId, regraFiscalId: "regra" }]
        : tabela === clienteEmitentes ? relacoes : tabela === lotesDistribuicao ? [{ id: "lote", numero: 1 }] : [];
      const query = { innerJoin: () => query, where: (condicao: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        if (tabela === clienteEmitentes) filtros.push(new PgDialect().sqlToQuery(condicao).sql);
        return query;
      }, limit: () => Promise.resolve(rows), then: (resolve: (r: unknown) => unknown) => Promise.resolve(rows).then(resolve) };
      return query;
    } }),
    insert: (tabela: unknown) => ({ values: () => {
      escritas.push(tabela);
      const query = { onConflictDoNothing: () => query, onConflictDoUpdate: () => Promise.resolve(),
        returning: () => Promise.resolve(tabela === lotesDistribuicao
          ? reutilizado ? [] : [{ id: "lote", numero: 1 }] : [{ id: "disponibilidade" }]),
        then: (resolve: (r: unknown) => unknown) => Promise.resolve().then(resolve) };
      return query;
    } }),
  };
  mocks.transaction.mockImplementation(async (fn) => {
    try { const resultado = await fn(tx); confirmado = true; return resultado; }
    catch (erro) { escritas.length = 0; throw erro; }
  });
  return { escritas, filtros, confirmou: () => confirmado };
}

beforeEach(() => vi.resetAllMocks());
describe("distribuição só de trocas no servidor", () => {
  it("aceita vínculo ativo sem exigir dados fiscais nem gerar tarefa", async () => {
    const db = banco([{ clienteId, emitenteId }]);
    expect(await processarDistribuicao(input())).toMatchObject({ tarefasCriadas: 0, reutilizada: false });
    expect(db.escritas).toContain(distribuicoes);
    expect(db.escritas).toContain(disponibilidades);
    expect(db.escritas).not.toContain(tarefas);
    expect(db.confirmou()).toBe(true);
    expect(mocks.contrato).not.toHaveBeenCalled();
    expect(db.filtros[0]).toContain('"clientes"."ativo"');
    expect(db.filtros[0]).toContain('"emitentes"."ativo"');
  });
  it("rejeita vínculo ausente/inativo e desfaz a transação", async () => {
    const db = banco([]);
    await expect(processarDistribuicao(input())).rejects.toThrow("inativo");
    expect(db.escritas).toEqual([]);
    expect(db.confirmou()).toBe(false);
  });
  it("não aceita um vínculo com outro emitente", async () => {
    banco([{ clienteId, emitenteId: "outro" }]);
    await expect(processarDistribuicao(input())).rejects.toThrow("vínculo");
  });
  it("ignora exigências fiscais de pares extras devolvidos pela consulta", async () => {
    banco([{ clienteId, emitenteId }, { clienteId: "nao-selecionado", emitenteId, cnpj: "inválido" }]);
    expect(await processarDistribuicao(input())).toMatchObject({ tarefasCriadas: 0 });
  });
  it("aceita sobra explicitamente confirmada", async () => {
    banco([{ clienteId, emitenteId }]);
    const dados = input(); dados.produtos[0].quantidadeTotal = 3;
    expect(await processarDistribuicao({ ...dados, confirmouSobras: true })).toMatchObject({ tarefasCriadas: 0 });
  });
  it("continua exigindo cadastro fiscal se uma linha do par for faturável", async () => {
    banco([{ clienteId, emitenteId }]);
    const dados = input(); dados.produtos[0].linhas[0].quantidadeTroca = 1;
    await expect(processarDistribuicao(dados)).rejects.toThrow("CNPJ");
  });
  it("reutiliza lote já processado sem nova distribuição", async () => {
    const db = banco([], true);
    expect(await processarDistribuicao(input())).toMatchObject({ reutilizada: true, tarefasCriadas: 0 });
    expect(db.escritas).not.toContain(distribuicoes);
  });
  it("rejeita troca maior que entrega antes de abrir transação", async () => {
    const dados = input(); dados.produtos[0].linhas[0].quantidadeTroca = 3;
    await expect(processarDistribuicao(dados)).rejects.toThrow("maior");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejeita sobra sem aceite antes de abrir transação", async () => {
    const dados = input(); dados.produtos[0].quantidadeTotal = 3;
    await expect(processarDistribuicao(dados)).rejects.toThrow("confirme");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("exige sessão antes de qualquer acesso ao banco", async () => {
    mocks.auth.mockRejectedValue(new Error("sem sessão"));
    await expect(processarDistribuicao(input())).rejects.toThrow("sem sessão");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
