"use client";

import { useState } from "react";

/** Mantém a mesma chave em reenvios do formulário aberto, sem armazená-la. */
export default function ChaveIdempotenciaTroca() {
  const [chave] = useState(() => crypto.randomUUID());
  return <input type="hidden" name="chaveIdempotencia" value={chave} />;
}
