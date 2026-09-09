export async function register() {
  const { validarIsolamentoHomologacao } = await import('../scripts/isolamento-homologacao.mjs');
  validarIsolamentoHomologacao(process.env);
}
