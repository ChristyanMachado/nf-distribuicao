"use client";

import { useId, useMemo, useState } from "react";

export type OpcaoPesquisa = { id: string; rotulo: string; detalhe?: string };

function normalizar(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/** Campo pesquisável para formulários server-side: envia somente o id escolhido. */
export default function PesquisaSelecionavel({
  name,
  opcoes,
  placeholder,
  vazio,
}: {
  name: string;
  opcoes: OpcaoPesquisa[];
  placeholder: string;
  vazio: string;
}) {
  const listaId = useId();
  const [texto, setTexto] = useState("");
  const [selecionado, setSelecionado] = useState("");
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const filtradas = useMemo(() => {
    const termo = normalizar(texto.trim());
    return termo ? opcoes.filter((opcao) => normalizar(`${opcao.rotulo} ${opcao.detalhe ?? ""}`).includes(termo)) : opcoes;
  }, [opcoes, texto]);

  function escolher(opcao: OpcaoPesquisa) {
    setSelecionado(opcao.id);
    setTexto(opcao.rotulo);
    setAberto(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selecionado} />
      <input
        type="search"
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-activedescendant={aberto && filtradas[indiceAtivo] ? `${listaId}-${filtradas[indiceAtivo].id}` : undefined}
        onFocus={() => { setAberto(true); setIndiceAtivo(0); }}
        onBlur={() => window.setTimeout(() => setAberto(false), 120)}
        onChange={(event) => {
          setTexto(event.target.value);
          setSelecionado("");
          setAberto(true);
          setIndiceAtivo(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && filtradas.length) {
            event.preventDefault();
            setAberto(true);
            setIndiceAtivo((atual) => Math.min(atual + 1, filtradas.length - 1));
          } else if (event.key === "ArrowUp" && filtradas.length) {
            event.preventDefault();
            setAberto(true);
            setIndiceAtivo((atual) => Math.max(atual - 1, 0));
          } else if (event.key === "Enter" && aberto && filtradas.length) {
            event.preventDefault();
            escolher(filtradas[Math.min(indiceAtivo, filtradas.length - 1)]);
          } else if (event.key === "Escape") {
            setAberto(false);
          }
        }}
        className="w-full"
      />
      {aberto && (
        <div id={listaId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--paper-raised)] p-1 shadow-lg">
          {filtradas.length ? filtradas.map((opcao, indice) => (
            <button
              key={opcao.id}
              id={`${listaId}-${opcao.id}`}
              type="button"
              role="option"
              aria-selected={selecionado === opcao.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setIndiceAtivo(indice)}
              onClick={() => escolher(opcao)}
              className={`flex min-h-11 w-full items-center rounded-[calc(var(--radius-control)-2px)] px-3 text-left text-sm hover:bg-[var(--field-tint)] ${indice === indiceAtivo ? "bg-[var(--field-tint)]" : ""}`}
            >
              <span className="min-w-0"><span className="block font-medium">{opcao.rotulo}</span>{opcao.detalhe && <span className="block text-xs text-[var(--ink-faint)]">{opcao.detalhe}</span>}</span>
            </button>
          )) : <p className="px-3 py-3 text-sm text-[var(--ink-soft)]">{vazio}</p>}
        </div>
      )}
    </div>
  );
}
