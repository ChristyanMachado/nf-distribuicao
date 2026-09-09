type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ObterArmazenamento = () => Armazenamento;
const armazenamentoLocal: ObterArmazenamento = () => window.localStorage;

// O próprio acesso a localStorage pode lançar SecurityError. O rascunho é
// conveniência local e nunca pode transformar um envio confirmado em falha.
export function lerRascunhoLocal(chave: string, obter = armazenamentoLocal) {
  try { return { ok: true, valor: obter().getItem(chave) }; }
  catch { return { ok: false, valor: null }; }
}

export function gravarRascunhoLocal(chave: string, valor: string | null, obter = armazenamentoLocal): boolean {
  try {
    if (valor === null) obter().removeItem(chave);
    else obter().setItem(chave, valor);
    return true;
  } catch { return false; }
}
