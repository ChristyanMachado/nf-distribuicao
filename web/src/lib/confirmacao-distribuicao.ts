export function mensagemConfirmacaoDistribuicao(tarefas: number) {
  if (tarefas === 0) return 'Distribuição registrada somente com trocas, sem nota para emitir. Você pode abrir o roteiro agora.';
  return `${tarefas} ${tarefas === 1 ? 'nota entrou' : 'notas entraram'} na fila. Você pode acompanhar o andamento ou abrir o roteiro agora.`;
}
