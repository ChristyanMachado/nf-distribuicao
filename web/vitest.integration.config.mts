import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { validarIsolamentoHomologacao } from './scripts/isolamento-homologacao.mjs';

// Sem configuração explícita de QA, falha antes de carregar qualquer teste.
if (process.env.APP_ENVIRONMENT !== 'homologacao') throw new Error('Integração exige homologação isolada.');
validarIsolamentoHomologacao(process.env);
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['integration/**/*.integration.test.ts'], fileParallelism: false,
    testTimeout: 30000, hookTimeout: 15000 },
});
