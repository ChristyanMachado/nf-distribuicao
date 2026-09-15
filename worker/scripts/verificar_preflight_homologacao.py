"""Valida uma configuração de Worker QA sem abrir navegador ou tocar na fila."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from dotenv import dotenv_values

from src.config import carregar_config


_PREFIXOS_ISOLADOS = ("APP_", "SUPABASE_", "WORKER_", "CLIENTE_")
_VARIAVEIS_ISOLADAS = {
    "SISTEMA_FISCAL_URL", "AMBIENTE_EMISSAO", "HABILITAR_PRODUCAO_FISCAL",
    "MODO_OPERACAO", "FONTE_TAREFAS", "TESTAR_INTEGRACAO_BANCO",
    "PROCESSAR_FILA_BANCO", "TESTAR_NAVEGACAO_EMISSAO",
    "TESTAR_PREENCHIMENTO_COMPLETO", "TESTAR_EMISSAO_HOMOLOGACAO",
    "ARMAZENAR_DOCUMENTOS", "LIMPAR_DOCUMENTOS_EXPIRADOS",
    "PROCESSAR_RECUPERACOES_DOCUMENTOS", "PROCESSAR_CANCELAMENTOS_FISCAIS",
    "HEADLESS", "INSPECIONAR", "MAX_CONCORRENCIA", "CLIENTES_ATIVOS",
    "DOWNLOAD_DIR", "LOG_DIR", "DOCUMENTOS_RETENCAO_DIAS",
}


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
    # Não permitir que um terminal usado para produção complete silenciosamente
    # um arquivo QA incompleto. PATH e demais variáveis do processo permanecem.
    for chave in tuple(os.environ):
        if chave.startswith(_PREFIXOS_ISOLADOS) or chave in _VARIAVEIS_ISOLADAS:
            os.environ.pop(chave, None)
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
