"""Janela simples para operar um lote fiscal localmente no Windows."""
from __future__ import annotations

import json
import ctypes
import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, scrolledtext


RAIZ = Path(__file__).resolve().parents[1]
ENV_FILE = RAIZ / ".env.operador"
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class AplicativoOperador(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Graalyst — Worker local")
        self.geometry("720x520")
        self.minsize(620, 430)
        self.configure(padx=24, pady=20)
        self.eventos: queue.Queue[tuple[str, object]] = queue.Queue()
        self.lote: dict[str, object] | None = None
        self.em_execucao = False

        tk.Label(self, text="Worker local de contingência", font=("Segoe UI", 18, "bold")).pack(anchor="w")
        tk.Label(
            self,
            text="Consulte a fila e execute somente o lote mostrado. Fechar esta janela não cria agendamento.",
            font=("Segoe UI", 10), wraplength=660, justify="left",
        ).pack(anchor="w", pady=(4, 18))

        self.status = tk.Label(self, text="Consultando…", font=("Segoe UI", 12), anchor="w", justify="left")
        self.status.pack(fill="x")
        self.alerta = tk.Label(self, text="", fg="#a33", font=("Segoe UI", 10, "bold"), anchor="w", justify="left", wraplength=660)
        self.alerta.pack(fill="x", pady=(5, 14))

        botoes = tk.Frame(self)
        botoes.pack(fill="x")
        self.btn_atualizar = tk.Button(botoes, text="Atualizar fila", command=self.atualizar, width=18)
        self.btn_atualizar.pack(side="left")
        self.btn_executar = tk.Button(botoes, text="Executar lote", command=self.confirmar, width=24, state="disabled")
        self.btn_executar.pack(side="left", padx=10)

        tk.Label(self, text="Andamento", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(20, 5))
        self.log = scrolledtext.ScrolledText(self, height=16, state="disabled", font=("Consolas", 9))
        self.log.pack(fill="both", expand=True)
        self.after(150, self._processar_eventos)
        self.protocol("WM_DELETE_WINDOW", self._fechar)
        self.atualizar()

    def _manter_computador_ativo(self, ativo: bool) -> None:
        if sys.platform == "win32":
            valor = 0x80000001 if ativo else 0x80000000  # contínuo + sistema necessário
            ctypes.windll.kernel32.SetThreadExecutionState(valor)

    def _fechar(self) -> None:
        if self.em_execucao:
            messagebox.showwarning("Execução em andamento", "Aguarde o lote terminar antes de fechar.")
            return
        self.destroy()

    def _registrar(self, texto: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", texto.rstrip() + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _comando_base(self) -> list[str]:
        return [sys.executable, "-m", "scripts.executar_lote_local", "--env-file", str(ENV_FILE)]

    def atualizar(self) -> None:
        if self.em_execucao:
            return
        if not ENV_FILE.exists():
            self.status.configure(text="Configuração ainda não concluída.")
            self.alerta.configure(text="Execute INSTALAR.cmd e preencha o arquivo solicitado.")
            return
        self.btn_atualizar.configure(state="disabled")
        self.btn_executar.configure(state="disabled")
        self.status.configure(text="Consultando a fila…")
        threading.Thread(target=self._consultar_background, daemon=True).start()

    def _consultar_background(self) -> None:
        try:
            resultado = subprocess.run(
                self._comando_base() + ["--listar"], cwd=RAIZ, capture_output=True,
                text=True, encoding="utf-8", errors="replace", timeout=35,
                creationflags=SEM_JANELA,
            )
            if resultado.returncode != 0:
                raise RuntimeError("Não foi possível consultar a fila com segurança.")
            self.eventos.put(("fila", json.loads(resultado.stdout.strip())))
        except Exception as exc:
            self.eventos.put(("erro", str(exc)))

    def confirmar(self) -> None:
        if self.em_execucao or not self.lote:
            return
        numero, quantidade = self.lote["numero"], self.lote["quantidade"]
        if not messagebox.askyesno(
            "Confirmar emissão",
            f"Executar agora o lote {numero}, com {quantidade} nota(s)?\n\n"
            "Confira produtos, quantidades e valores no sistema antes de continuar.",
            icon="warning",
        ):
            return
        self.em_execucao = True
        self._manter_computador_ativo(True)
        self.btn_atualizar.configure(state="disabled")
        self.btn_executar.configure(state="disabled")
        self.alerta.configure(text="Não desligue este computador durante a execução.")
        self._registrar(f"Iniciando lote {numero} ({quantidade} nota(s))…")
        threading.Thread(target=self._executar_background, daemon=True).start()

    def _executar_background(self) -> None:
        assert self.lote
        comando = self._comando_base() + ["--lote-id", str(self.lote["loteId"])]
        for tarefa_id in self.lote["tarefaIds"]:
            comando.extend(["--tarefa", str(tarefa_id)])
        comando.append("--executar")
        try:
            processo = subprocess.Popen(
                comando, cwd=RAIZ, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1,
                creationflags=SEM_JANELA,
            )
            assert processo.stdout
            for linha in processo.stdout:
                self.eventos.put(("log", linha))
            self.eventos.put(("fim", processo.wait()))
        except Exception:
            self.eventos.put(("fim", 1))

    def _processar_eventos(self) -> None:
        try:
            while True:
                tipo, dado = self.eventos.get_nowait()
                if tipo == "log":
                    self._registrar(str(dado))
                elif tipo == "erro":
                    self.lote = None
                    self.status.configure(text="Consulta indisponível.")
                    self.alerta.configure(text=str(dado))
                    self.btn_atualizar.configure(state="normal")
                elif tipo == "fila":
                    self._mostrar_fila(dado)
                elif tipo == "fim":
                    self.em_execucao = False
                    self._manter_computador_ativo(False)
                    if dado == 0:
                        messagebox.showinfo("Execução concluída", "O lote terminou. Confira as notas no sistema.")
                    else:
                        messagebox.showerror("Execução interrompida", "Não tente novamente. Confira o estado das notas no sistema.")
                    self.atualizar()
        except queue.Empty:
            pass
        self.after(150, self._processar_eventos)

    def _mostrar_fila(self, dado: object) -> None:
        self.btn_atualizar.configure(state="normal")
        self.lote = dado if isinstance(dado, dict) else None
        if not self.lote or not self.lote.get("quantidade"):
            self.status.configure(text="Nenhum lote pendente.")
            self.alerta.configure(text="")
            return
        numero, quantidade = self.lote["numero"], self.lote["quantidade"]
        self.status.configure(text=f"Lote {numero}: {quantidade} nota(s) pendente(s)")
        bloqueios = []
        if not self.lote.get("vmIsolada"):
            bloqueios.append("O servidor principal não está isolado.")
        if self.lote.get("tarefasAtivas"):
            bloqueios.append("Já existe nota em processamento.")
        if not self.lote.get("primeiraTentativa"):
            bloqueios.append("O lote contém tentativa anterior e exige conferência.")
        if bloqueios:
            self.alerta.configure(text=" ".join(bloqueios) + " Execução bloqueada.")
            self.btn_executar.configure(state="disabled")
        else:
            self.alerta.configure(text="Servidor principal isolado. Confira o lote antes de executar.")
            self.btn_executar.configure(text=f"Executar lote {numero}", state="normal")


if __name__ == "__main__":
    AplicativoOperador().mainloop()
