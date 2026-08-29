from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from scripts.verificar_saude_servico import main


def _gravar(caminho: Path, *, estado: str, instante: datetime) -> None:
    caminho.write_text(
        json.dumps(
            {
                "estado": estado,
                "codigo_saida": 0,
                "atualizado_em": instante.isoformat(),
            }
        ),
        encoding="utf-8",
    )


def test_healthcheck_aceita_estado_recente(monkeypatch, tmp_path: Path) -> None:
    caminho = tmp_path / "saude.json"
    _gravar(caminho, estado="processando", instante=datetime.now(timezone.utc))
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(caminho))

    assert main() == 0


def test_healthcheck_rejeita_estado_degradado(monkeypatch, tmp_path: Path) -> None:
    caminho = tmp_path / "saude.json"
    _gravar(caminho, estado="degradado", instante=datetime.now(timezone.utc))
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(caminho))

    assert main() == 1


def test_healthcheck_rejeita_arquivo_antigo(monkeypatch, tmp_path: Path) -> None:
    caminho = tmp_path / "saude.json"
    _gravar(
        caminho,
        estado="ok",
        instante=datetime.now(timezone.utc) - timedelta(minutes=10),
    )
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(caminho))

    assert main() == 1


def test_healthcheck_rejeita_limite_invalido(monkeypatch, tmp_path: Path) -> None:
    caminho = tmp_path / "saude.json"
    _gravar(caminho, estado="ok", instante=datetime.now(timezone.utc))
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(caminho))
    monkeypatch.setenv("WORKER_HEALTH_MAX_AGE_SECONDS", "segredo-invalido")

    assert main() == 1
