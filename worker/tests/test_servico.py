from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest
from unittest.mock import AsyncMock

from src.janela_emissao import JanelaEmissao
from src.servico import executar_servico


def test_janela_de_emissao_usa_horario_de_sao_paulo() -> None:
    janela = JanelaEmissao(0, 6)
    assert janela.permite_nova_emissao(datetime(2026, 9, 4, 3, 0, tzinfo=timezone.utc))
    assert janela.permite_nova_emissao(datetime(2026, 9, 4, 8, 59, tzinfo=timezone.utc))
    assert not janela.permite_nova_emissao(datetime(2026, 9, 4, 9, 0, tzinfo=timezone.utc))


def test_janela_de_emissao_pode_atravessar_meia_noite() -> None:
    janela = JanelaEmissao(22, 2)
    assert janela.permite_nova_emissao(datetime(2026, 9, 5, 2, 0, tzinfo=timezone.utc))
    assert not janela.permite_nova_emissao(datetime(2026, 9, 5, 6, 0, tzinfo=timezone.utc))


def test_janela_rejeita_duracao_zero() -> None:
    with pytest.raises(ValueError, match="duração zero"):
        JanelaEmissao(6, 6)


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


def test_servico_drena_proxima_tarefa_sem_aguardar_polling(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(tmp_path / "saude.json"))
    monkeypatch.setenv("WORKER_POLL_SECONDS", "300")
    config = SimpleNamespace(worker_persistente=True)
    resultados = iter((2, 0))
    chamadas = 0

    async def executor(_config, _logger):
        nonlocal chamadas
        chamadas += 1
        return next(resultados)

    asyncio.run(
        executar_servico(
            config,
            logging.getLogger("servico-teste"),
            executor=executor,
            max_ciclos=2,
        )
    )

    assert chamadas == 2
    dados = json.loads((tmp_path / "saude.json").read_text(encoding="utf-8"))
    assert dados["estado"] == "ok"
    assert dados["codigo_saida"] == 0


@pytest.mark.parametrize("codigo, espera", [(0, 15), (1, 30)])
def test_servico_preserva_espera_ociosa_e_recuo_de_erro(monkeypatch, tmp_path, codigo, espera):
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(tmp_path / "saude.json"))
    monkeypatch.setenv("WORKER_POLL_SECONDS", "15")
    monkeypatch.setenv("WORKER_ERROR_BACKOFF_SECONDS", "30")
    chamadas = []

    async def esperar(awaitable, *, timeout):
        awaitable.close()
        chamadas.append(timeout)
        raise TimeoutError

    monkeypatch.setattr("src.servico.asyncio.wait_for", esperar)
    asyncio.run(executar_servico(
        SimpleNamespace(worker_persistente=True), logging.getLogger("teste"),
        executor=AsyncMock(return_value=codigo), max_ciclos=2,
    ))
    assert chamadas == [espera]


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
