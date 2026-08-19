"""Testes unitários da orquestração Async, sem navegador real."""

from __future__ import annotations

import asyncio
import logging

from src.orquestrador import _processar_uma_tarefa


class ContextoFalso:
    def __init__(self) -> None:
        self.fechado = False

    async def close(self) -> None:
        self.fechado = True


class BrowserFalso:
    def __init__(self) -> None:
        self.contextos: list[ContextoFalso] = []

    async def new_context(self) -> ContextoFalso:
        contexto = ContextoFalso()
        self.contextos.append(contexto)
        return contexto


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste_orquestrador")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    return logger


def test_processa_tarefa_com_sucesso_e_fecha_contexto():
    chamados: list[str] = []

    async def tarefa_ok(tarefa_id: str, context: ContextoFalso) -> None:
        chamados.append(tarefa_id)
        assert context.fechado is False

    browser = BrowserFalso()
    resultado = asyncio.run(
        _processar_uma_tarefa("CLIENTE_A", browser, tarefa_ok, _logger_silencioso())
    )

    assert resultado.sucesso is True
    assert resultado.erro is None
    assert chamados == ["CLIENTE_A"]
    assert browser.contextos[0].fechado is True


def test_falha_da_tarefa_retorna_resultado_e_fecha_contexto():
    async def tarefa_com_falha(tarefa_id: str, context: ContextoFalso) -> None:
        raise RuntimeError("login falhou")

    browser = BrowserFalso()
    resultado = asyncio.run(
        _processar_uma_tarefa(
            "CLIENTE_B", browser, tarefa_com_falha, _logger_silencioso()
        )
    )

    assert resultado.sucesso is False
    assert resultado.tipo_erro == "RuntimeError"
    assert resultado.erro == "login falhou"
    assert browser.contextos[0].fechado is True
