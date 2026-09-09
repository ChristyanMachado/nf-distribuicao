import { describe, expect, it } from 'vitest';
import { mensagemConfirmacaoDistribuicao } from './confirmacao-distribuicao';
describe('confirmação fiel ao resultado', () => {
  it('trocas não prometem emissão', () => expect(mensagemConfirmacaoDistribuicao(0)).toContain('sem nota para emitir'));
  it('uma nota usa singular', () => expect(mensagemConfirmacaoDistribuicao(1)).toContain('1 nota entrou'));
  it('lote usa quantidade retornada pelo servidor', () => expect(mensagemConfirmacaoDistribuicao(5)).toContain('5 notas entraram'));
});
