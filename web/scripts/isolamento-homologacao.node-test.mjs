import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarIsolamentoHomologacao, PROJETO_HOMOLOGACAO as ref } from './isolamento-homologacao.mjs';
const env = () => ({ APP_ENVIRONMENT: 'homologacao', AMBIENTE_EMISSAO: 'teste',
  APP_AUTH_ENABLED: 'true', APP_AUTH_PROVIDER: 'administrativo', APP_ADMIN_USER: 'qa',
  APP_ADMIN_PASSWORD: 'senha-ficticia-de-teste', APP_SESSION_SECRET: 'x'.repeat(32),
  DATABASE_URL: `postgresql://nf_homologacao_web:teste@db.${ref}.supabase.co:5432/postgres`,
  SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_STORAGE_HOSTS: `${ref}.supabase.co`, SUPABASE_STORAGE_BUCKET: 'documentos-fiscais' });
test('aceita apenas homologação dedicada, direta ou pooler', () => {
  assert.doesNotThrow(() => validarIsolamentoHomologacao(env()));
  assert.doesNotThrow(() => validarIsolamentoHomologacao({ ...env(), DATABASE_URL: `postgresql://nf_homologacao_web.${ref}:teste@aws-0-sa-east-1.pooler.supabase.com:6543/postgres` }));
});
for (const [key, value] of Object.entries({ AMBIENTE_EMISSAO: 'normal', APP_AUTH_ENABLED: 'false',
  APP_AUTH_PROVIDER: 'supabase', APP_SESSION_SECRET: '',
  DATABASE_URL: 'postgresql://postgres:segredo@db.kcukzbszakwrfhbsiihw.supabase.co/postgres',
  SUPABASE_URL: 'https://kcukzbszakwrfhbsiihw.supabase.co',
  NEXT_PUBLIC_STORAGE_HOSTS: 'outro.supabase.co', SUPABASE_SECRET_KEY: 'segredo',
  WORKER_DATABASE_URL: 'postgresql://qualquer', HABILITAR_PRODUCAO_FISCAL: 'true' })) {
  test(`recusa configuração cruzada: ${key}`, () => assert.throws(() => validarIsolamentoHomologacao({ ...env(), [key]: value })));
}
test('recusa usuário de outro projeto no host compartilhado e parâmetros extras', () => {
  for (const url of [`postgresql://nf_homologacao_web.outro:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`, `${env().DATABASE_URL}?host=outro`, `${env().DATABASE_URL}#outro`]) {
    assert.throws(() => validarIsolamentoHomologacao({ ...env(), DATABASE_URL: url }));
  }
});
test('preview não passa sem isolamento; configuração atual de produção preservada', () => {
  assert.throws(() => validarIsolamentoHomologacao({ VERCEL_ENV: 'preview' }));
  assert.doesNotThrow(() => validarIsolamentoHomologacao({ NODE_ENV: 'production', AMBIENTE_EMISSAO: 'normal' }));
  assert.doesNotThrow(() => validarIsolamentoHomologacao({ VERCEL_ENV: 'production', DATABASE_URL: 'postgresql://db.kcukzbszakwrfhbsiihw.supabase.co/postgres' }));
  assert.throws(() => validarIsolamentoHomologacao({ APP_ENVIRONMENT: 'homologaca' }));
  assert.throws(() => validarIsolamentoHomologacao({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://db.kcukzbszakwrfhbsiihw.supabase.co/postgres' }));
});
