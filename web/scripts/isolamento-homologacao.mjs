// Identificadores públicos; nunca senhas. Alterar somente após provisionamento revisado.
export const PROJETO_HOMOLOGACAO = 'szakgftippcqtuqwxsox';
const PROJETO_PRODUCAO = 'kcukzbszakwrfhbsiihw';

/** @param {Record<string, string | undefined>} env */
export function validarIsolamentoHomologacao(env) {
  if (env.APP_ENVIRONMENT && !['homologacao', 'producao'].includes(env.APP_ENVIRONMENT)) {
    throw new Error('APP_ENVIRONMENT desconhecido.');
  }
  const homologacao = env.APP_ENVIRONMENT === 'homologacao';
  if (env.VERCEL_ENV === 'preview' && !homologacao) {
    throw new Error('Preview bloqueado: configure o ambiente de homologação isolado.');
  }
  if (!homologacao) {
    if (['development', 'test'].includes(env.NODE_ENV ?? '') && (env.DATABASE_URL ?? '').includes(PROJETO_PRODUCAO)) {
      throw new Error('Desenvolvimento bloqueado: não use o banco de produção.');
    }
    return;
  }
  const falhar = () => { throw new Error('Homologação bloqueada: banco, Storage, login ou ambiente fiscal não estão isolados.'); };
  if (env.AMBIENTE_EMISSAO !== 'teste' || env.APP_AUTH_ENABLED !== 'true'
    || env.APP_AUTH_PROVIDER !== 'administrativo'
    || !env.APP_ADMIN_USER || (env.APP_ADMIN_PASSWORD ?? '').length < 12
    || (env.APP_SESSION_SECRET ?? '').length < 32) falhar();
  let db;
  try { db = new URL(env.DATABASE_URL ?? ''); } catch { return falhar(); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.search || db.hash || db.pathname !== '/postgres') falhar();
  // Pooler compartilhado não identifica o projeto pelo host: confira também o usuário.
  const usuario = decodeURIComponent(db.username);
  const direto = db.hostname === `db.${PROJETO_HOMOLOGACAO}.supabase.co`
    && usuario === 'nf_homologacao_web' && (!db.port || db.port === '5432');
  const pooler = /^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/.test(db.hostname)
    && usuario === `nf_homologacao_web.${PROJETO_HOMOLOGACAO}` && ['5432', '6543'].includes(db.port);
  if (!direto && !pooler) falhar();
  const origem = `https://${PROJETO_HOMOLOGACAO}.supabase.co`;
  if (env.SUPABASE_URL !== origem || env.NEXT_PUBLIC_SUPABASE_URL !== origem
    || env.NEXT_PUBLIC_STORAGE_HOSTS !== `${PROJETO_HOMOLOGACAO}.supabase.co`
    || env.SUPABASE_STORAGE_BUCKET !== 'documentos-fiscais') falhar();
  // Login administrativo de QA não chama o provedor compartilhado do Ponto.
  if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY) falhar();
  // Primeira fase: sem credenciais de Storage, Worker ou conexão fiscal.
  if (Object.entries(env).some(([k, v]) => v && (
    /^(WORKER_DATABASE_URL|CLIENTE_[A-Z0-9_]+_(LOGIN|SENHA))$/.test(k)
    || (/^(HABILITAR_PRODUCAO_FISCAL|PROCESSAR_FILA_BANCO|PROCESSAR_CANCELAMENTOS_FISCAIS|PROCESSAR_RECUPERACOES_DOCUMENTOS|TESTAR_EMISSAO_HOMOLOGACAO|LIMPAR_DOCUMENTOS_EXPIRADOS)$/.test(k) && v !== 'false')
  ))) falhar();
}
