"""
Logging simples em arquivo + console (RNF07 — observabilidade).
Cada execução gera um arquivo de log com timestamp, para facilitar
diagnosticar falhas de login, elementos não encontrados, timeouts, etc.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime


def configurar_logger(log_dir: str, nome: str = "worker") -> logging.Logger:
    os.makedirs(log_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    caminho_log = os.path.join(log_dir, f"{nome}_{timestamp}.log")

    logger = logging.getLogger(nome)
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formato = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"
    )

    handler_arquivo = logging.FileHandler(caminho_log, encoding="utf-8")
    handler_arquivo.setFormatter(formato)
    logger.addHandler(handler_arquivo)

    handler_console = logging.StreamHandler()
    handler_console.setFormatter(formato)
    logger.addHandler(handler_console)

    return logger
