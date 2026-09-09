import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarIsolamentoHomologacao } from './isolamento-homologacao.mjs';

const operacao = process.argv[2];
const comandos = {
  dev: ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3200'],
  build: ['node_modules/next/dist/bin/next', 'build'],
  start: ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3200'],
  integration: ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.mts'],
};
if (!Object.hasOwn(comandos, operacao)) throw new Error('Use dev, build, start ou integration.');
const root = fileURLToPath(new URL('../', import.meta.url));
// Definir inclusive os valores vazios impede o Next de herdá-los de .env/.env.local.
const env = { ...process.env };
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local', '.env.test', '.env.test.local']) {
  try { for (const key of Object.keys(parseEnv(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')))) env[key] = ''; }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
for (const key of Object.keys(env)) if (/^(APP_|SUPABASE_|NEXT_PUBLIC_|DATABASE_URL|WORKER_|CLIENTE_|PROCESSAR_|HABILITAR_|TESTAR_|LIMPAR_)/.test(key)) env[key] = '';
let configuracao;
try { configuracao = parseEnv(readFileSync(new URL('../.env.homologacao.local', import.meta.url), 'utf8')); }
catch { throw new Error('Configure .env.homologacao.local com as credenciais exclusivas de QA.'); }
Object.assign(env, configuracao, { APP_ENVIRONMENT: 'homologacao' });
validarIsolamentoHomologacao(env);
delete env.NODE_ENV;
const child = spawn(process.execPath, comandos[operacao], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', () => { console.error('Não foi possível iniciar homologação.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
