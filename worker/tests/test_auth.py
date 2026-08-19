"""Testes da validação de identidade pós-login, sem navegador real."""

from __future__ import annotations

import asyncio
import logging

import pytest
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from src.auth import FalhaIdentidadeAutenticada, validar_identidade_autenticada
from src.config import CredencialCliente


class LocalizadorFalso:
    def __init__(self, deve_falhar: bool = False) -> None:
        self.deve_falhar = deve_falhar

    async def wait_for(self, **kwargs) -> None:
        if self.deve_falhar:
            raise PlaywrightTimeoutError("texto não encontrado")


class PaginaFalsa:
    def __init__(self, deve_falhar: bool = False) -> None:
        self.deve_falhar = deve_falhar
        self.texto_procurado: str | None = None

    def get_by_text(self, texto: str, exact: bool) -> LocalizadorFalso:
        self.texto_procurado = texto
        assert exact is False
        return LocalizadorFalso(self.deve_falhar)


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste_auth")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    return logger


def _credencial(identidade_esperada: str | None) -> CredencialCliente:
    return CredencialCliente(
        cliente_id="CLIENTE_A",
        login="login",
        senha="senha",
        identidade_esperada=identidade_esperada,
    )


def test_confirma_identidade_visivel():
    pagina = PaginaFalsa()

    asyncio.run(
        validar_identidade_autenticada(
            pagina,
            _credencial("Emitente de Teste"),
            _logger_silencioso(),
        )
    )

    assert pagina.texto_procurado == "Emitente de Teste"


def test_falha_quando_identidade_nao_aparece():
    with pytest.raises(FalhaIdentidadeAutenticada, match="CLIENTE_A"):
        asyncio.run(
            validar_identidade_autenticada(
                PaginaFalsa(deve_falhar=True),
                _credencial("Emitente de Teste"),
                _logger_silencioso(),
            )
        )


def test_sem_configuracao_nao_procura_identidade():
    pagina = PaginaFalsa()

    asyncio.run(
        validar_identidade_autenticada(
            pagina,
            _credencial(None),
            _logger_silencioso(),
        )
    )

    assert pagina.texto_procurado is None
