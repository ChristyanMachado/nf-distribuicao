import { afterAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '../src/db/schema';
import { validarIsolamentoHomologacao } from '../scripts/isolamento-homologacao.mjs';

validarIsolamentoHomologacao(process.env);
const client = postgres(process.env.DATABASE_URL!, { ssl: 'require', prepare: false, max: 1, connect_timeout: 8 });
const banco = drizzle(client, { schema });
const estado = vi.hoisted(() => ({ banco: null as unknown as typeof banco }));
// Só fronteiras Next são substituídas. SQL, transações e contratos são reais.
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ get db() { return estado.banco; } }));
vi.mock('@/lib/auth-server', () => ({ exigirSessaoAdministrativa: async () => ({ usuario: 'qa-integracao' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
import { processarDistribuicao } from '../src/app/distribuicao/actions';

afterAll(async () => { await client.end({ timeout: 2 }); });

async function ensaio(fn: () => Promise<void>) {
  const rollback = new Error('ROLLBACK_QA_ESPERADO');
  try {
    await banco.transaction(async tx => {
      estado.banco = tx as unknown as typeof banco;
      await fn();
      throw rollback;
    });
  } catch (e) { if (e !== rollback) throw e; }
}
const produtoId = '10000000-0000-4000-8000-000000000001';
const emitenteId = '30000000-0000-4000-8000-000000000001';
const cliente = (i: number) => `20000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
function entrada(n: number, troca = false) {
  return { chaveIdempotencia: randomUUID(), data: '2026-09-09', produtos: [{ produtoId,
    quantidadeTotal: n * 2, linhas: Array.from({ length: n }, (_, i) => ({ clienteId: cliente(i+1),
      emitenteId, quantidadeDistribuida: 2, quantidadeTroca: troca ? 2 : 0, precoUnitario: 3, precoPromocional: true })) }] };
}

describe('Postgres exclusivo de homologação; nenhum Worker conectado', () => {
  for (const n of [1, 3, 5]) it(`grava ${n} tarefas e snapshot; repetir não duplica`, async () => ensaio(async () => {
    const dados = entrada(n);
    const primeiro = await processarDistribuicao(dados);
    const repetido = await processarDistribuicao(dados);
    expect(primeiro.tarefasCriadas).toBe(n);
    expect(repetido).toMatchObject({ loteId: primeiro.loteId, reutilizada: true, tarefasCriadas: n });
    const rows = await estado.banco.select().from(schema.tarefas).where(eq(schema.tarefas.loteId, primeiro.loteId));
    expect(rows).toHaveLength(n);
    for (const row of rows) {
      expect(row.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.payloadWorker).toMatchObject({ ambiente: 'teste' });
    }
  }));
  it('troca integral não gera tarefa nem exige campos fiscais', async () => ensaio(async () => {
    await estado.banco.update(schema.clientes).set({ cnpj: null, cep: null }).where(eq(schema.clientes.id, cliente(1)));
    expect(await processarDistribuicao(entrada(1, true))).toMatchObject({ tarefasCriadas: 0 });
  }));
  it('vínculo ausente desfaz inclusive o lote inserido antes da validação', async () => ensaio(async () => {
    await estado.banco.delete(schema.clienteEmitentes).where(eq(schema.clienteEmitentes.clienteId, cliente(1)));
    const dados = entrada(1, true);
    await expect(processarDistribuicao(dados)).rejects.toThrow('vínculo');
    const rows = await estado.banco.select().from(schema.lotesDistribuicao)
      .where(eq(schema.lotesDistribuicao.chaveIdempotencia, dados.chaveIdempotencia));
    expect(rows).toHaveLength(0);
  }));
  it('banco de QA possui fixtures, não disponibiliza função de reserva ao Web', async () => {
    const rows = await banco.execute(sql`select has_function_privilege(current_user,
      'fiscal.reservar_tarefas_worker(text,integer,integer)', 'EXECUTE') as pode_reservar`);
    expect(rows[0].pode_reservar).toBe(false);
  });
});
