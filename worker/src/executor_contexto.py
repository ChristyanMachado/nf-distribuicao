"""Identidade da execução herdada pelas tarefas async, nunca pela máquina inteira."""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class IdentidadeExecutor:
    worker_id: str
    boot_id: str
    versao: str


executor_atual: ContextVar[IdentidadeExecutor | None] = ContextVar(
    "executor_atual", default=None,
)


def controle_solicitado(nome: str) -> bool:
    caminho = os.getenv(nome)
    if not caminho:
        return False
    # O diretório de controle é gravável somente pelo administrador na instalação.
    # Um caminho inválido/inacessível bloqueia admissão em vez de liberá-la.
    try:
        return Path(caminho).exists()
    except OSError:
        return True


def admissao_local_bloqueada() -> bool:
    return controle_solicitado("WORKER_CONTROL_PATH") or controle_solicitado(
        "WORKER_STARTUP_HOLD_PATH"
    )
