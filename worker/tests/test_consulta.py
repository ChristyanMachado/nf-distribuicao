"""Testes puros do início da recuperação fiscal, sem acessar a Receita."""
from __future__ import annotations

import asyncio
import logging

import pytest
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from src.flows.consulta import (
    ConsultaFiscalInvalida,
    SELETOR_EMITENTE_CONSULTA,
    selecionar_emitente_consulta,
    validar_chave_acesso,
)


class SelectFalso:
    def __init__(self, valores: list[str]) -> None:
        self.valores = valores
        self.selecionado: str | None = None

    async def select_option(self, *, value: str, timeout: int) -> None:
        assert timeout == 15_000
        if value not in self.valores:
            raise PlaywrightTimeoutError("opção não apareceu")
        self.selecionado = value

    async def input_value(self) -> str:
        return self.selecionado or ""


class PaginaFalsa:
    def __init__(self, valores: list[str]) -> None:
        self.campo = SelectFalso(valores)

    def locator(self, seletor: str) -> SelectFalso:
        assert seletor.startswith(SELETOR_EMITENTE_CONSULTA)
        return self.campo


def _logger() -> logging.Logger:
    logger = logging.getLogger("teste_consulta")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    return logger


def test_seleciona_emitente_exato_sem_depender_da_posicao() -> None:
    pagina = PaginaFalsa(["", "outro", "emitente-esperado"])

    asyncio.run(
        selecionar_emitente_consulta(pagina, "emitente-esperado", _logger())
    )

    assert pagina.campo.selecionado == "emitente-esperado"


def test_recusa_emitente_ausente_na_sessao() -> None:
    with pytest.raises(ConsultaFiscalInvalida, match="não está disponível"):
        asyncio.run(
            selecionar_emitente_consulta(
                PaginaFalsa(["", "outro"]), "esperado", _logger()
            )
        )


@pytest.mark.parametrize("chave", ["", "1" * 43, "1" * 45, "A" * 44])
def test_chave_de_acesso_exige_44_digitos(chave: str) -> None:
    with pytest.raises(ConsultaFiscalInvalida, match="chave de acesso válida"):
        validar_chave_acesso(chave)


def test_chave_de_acesso_valida_e_preservada() -> None:
    chave = "1" * 44
    assert validar_chave_acesso(chave) == chave


def test_identificador_do_emitente_nao_pode_injetar_seletor() -> None:
    with pytest.raises(ConsultaFiscalInvalida, match="identificador NFP-e"):
        asyncio.run(
            selecionar_emitente_consulta(
                PaginaFalsa([]), 'x"] select', _logger()
            )
        )
