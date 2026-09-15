"""Valida uma configuração de Worker QA sem abrir navegador ou tocar na fila."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from dotenv import dotenv_values

from src.config import carregar_config


def _argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True, help="Arquivo privado de homologação.")
    return parser.parse_args()


def main() -> int:
    args = _argumentos()
    caminho = Path(args.env_file).resolve()
    if not caminho.is_file() or caminho.is_symlink():
        raise RuntimeError("Arquivo privado de homologação não está disponível.")
    valores = dotenv_values(caminho)
    for chave, valor in valores.items():
        if valor is not None:
            os.environ[chave] = valor
    config = carregar_config()
    if os.getenv("APP_ENVIRONMENT") != "homologacao":
        raise RuntimeError("Pré-checagem aceita somente APP_ENVIRONMENT=homologacao.")
    print(json.dumps({
        "preflightHomologacao": "ok",
        "ambienteFiscal": config.ambiente_emissao,
        "fonteTarefas": config.fonte_tarefas,
        "persistente": config.worker_persistente,
        "concorrencia": config.max_concorrencia,
        "storageConfigurado": config.storage_documentos is not None,
        "segredosExibidos": False,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
