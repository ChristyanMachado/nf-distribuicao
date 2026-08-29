from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.servico import executar_servico


def test_servico_exige_flag_persistente() -> None:
    config = SimpleNamespace(worker_persistente=False)
    with pytest.raises(RuntimeError, match="WORKER_PERSISTENTE"):
        asyncio.run(executar_servico(config, logging.getLogger("servico-teste"), max_ciclos=1))


def test_servico_executa_ciclo_e_publica_saude(monkeypatch, tmp_path: Path) -> None:
    saude = tmp_path / "saude.json"
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(saude))
    config = SimpleNamespace(worker_persistente=True)
    chamadas = 0

    async def executor(_config, _logger):
        nonlocal chamadas
        chamadas += 1
        return 0

    codigo = asyncio.run(
        executar_servico(
            config,
            logging.getLogger("servico-teste"),
            executor=executor,
            max_ciclos=1,
        )
    )

    dados = json.loads(saude.read_text(encoding="utf-8"))
    assert codigo == 0
    assert chamadas == 1
    assert dados["estado"] == "ok"
    assert set(dados) == {"estado", "codigo_saida", "atualizado_em"}


def test_servico_sanitiza_excecao_e_marca_degradado(monkeypatch, tmp_path: Path) -> None:
    saude = tmp_path / "saude.json"
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(saude))

    async def executor(_config, _logger):
        raise RuntimeError("segredo que não pode ir para o healthcheck")

    asyncio.run(
        executar_servico(
            SimpleNamespace(worker_persistente=True),
            logging.getLogger("servico-teste"),
            executor=executor,
            max_ciclos=1,
        )
    )

    conteudo = saude.read_text(encoding="utf-8")
    assert json.loads(conteudo)["estado"] == "degradado"
    assert "segredo" not in conteudo
