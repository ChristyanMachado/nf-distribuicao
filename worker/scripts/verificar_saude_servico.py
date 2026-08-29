"""Healthcheck local do container, sem rede e sem leitura de segredos."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path


def main() -> int:
    caminho = Path(os.getenv("WORKER_HEALTHCHECK_PATH", "/tmp/nf-worker-health.json"))
    try:
        limite = int(os.getenv("WORKER_HEALTH_MAX_AGE_SECONDS", "180"))
        if not 30 <= limite <= 600:
            return 1
        if caminho.is_symlink() or not caminho.is_file():
            return 1
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        instante = datetime.fromisoformat(dados["atualizado_em"])
        idade = (datetime.now(timezone.utc) - instante).total_seconds()
        return int(
            dados.get("estado") not in {"ok", "processando"}
            or not 0 <= idade <= limite
        )
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
