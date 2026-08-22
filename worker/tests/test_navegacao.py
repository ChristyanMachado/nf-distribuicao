"""Testes unitários da navegação Async até a emissão, sem navegador real."""

from __future__ import annotations

import asyncio
import logging

import pytest
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from src.auth import (
    FalhaNavegacaoEmissao,
    SELETOR_MENU_EMISSAO_TESTE,
    SELETOR_MENU_NFPE_TESTES,
    SELETOR_POS_NAVEGACAO_EMISSAO,
    URL_EMISSAO,
    URL_EMISSAO_TESTE,
    navegar_ate_emissao,
)


class LocalizadorFalso:
    def __init__(self, seletor: str, cliques: list[str]) -> None:
        self.seletor = seletor
        self.cliques = cliques

    async def click(self) -> None:
        self.cliques.append(self.seletor)


class PaginaFalsa:
    def __init__(self, deve_expirar: bool = False) -> None:
        self.cliques: list[str] = []
        self.deve_expirar = deve_expirar
        self.seletor_aguardado: str | None = None
        self.url_esperada_recebida = None

    def locator(self, seletor: str) -> LocalizadorFalso:
        return LocalizadorFalso(seletor, self.cliques)

    def get_by_role(
        self,
        papel: str,
        *,
        name: str,
        exact: bool,
    ) -> LocalizadorFalso:
        assert papel == "link"
        assert name in {"Produtor Rural", "NFP-e"}
        assert exact is True
        return LocalizadorFalso(f"link:{name}", self.cliques)

    async def wait_for_url(self, url, **kwargs) -> None:
        self.url_esperada_recebida = url
        assert kwargs["wait_until"] == "domcontentloaded"
        assert kwargs["timeout"] == 30000
        if self.deve_expirar:
            raise PlaywrightTimeoutError("URL não carregou")

    async def wait_for_selector(self, seletor: str, **kwargs) -> None:
        self.seletor_aguardado = seletor
        assert kwargs["state"] == "visible"
        assert kwargs["timeout"] == 30000
        if self.deve_expirar:
            raise PlaywrightTimeoutError("tela não carregou")


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste_navegacao")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    return logger


def test_navega_e_confirma_tela_de_emissao():
    """Sem especificar ambiente, o padrão da FUNÇÃO continua sendo 'normal'
    (o padrão do .env/Config é outra coisa — ver test_config.py)."""
    pagina = PaginaFalsa()

    asyncio.run(navegar_ate_emissao(pagina, _logger_silencioso()))

    assert pagina.cliques == [
        "link:Produtor Rural",
        "link:NFP-e",
        "#menuLink1119",
    ]
    assert pagina.seletor_aguardado == SELETOR_POS_NAVEGACAO_EMISSAO
    assert pagina.url_esperada_recebida == URL_EMISSAO


def test_falha_quando_tela_de_emissao_nao_carrega():
    with pytest.raises(FalhaNavegacaoEmissao, match="não foi confirmada"):
        asyncio.run(
            navegar_ate_emissao(PaginaFalsa(deve_expirar=True), _logger_silencioso())
        )


def test_navega_para_ambiente_teste_nfpe_testes():
    """
    Adicionado em 21/08 — ambiente de homologação (NFP-e TESTES), pra não
    poluir o histórico fiscal real durante o desenvolvimento.
    """
    pagina = PaginaFalsa()

    asyncio.run(navegar_ate_emissao(pagina, _logger_silencioso(), ambiente="teste"))

    assert pagina.cliques == [
        "link:Produtor Rural",
        "link:NFP-e",
        SELETOR_MENU_NFPE_TESTES,
        SELETOR_MENU_EMISSAO_TESTE,
    ]
    assert pagina.seletor_aguardado == SELETOR_POS_NAVEGACAO_EMISSAO
    assert pagina.url_esperada_recebida == URL_EMISSAO_TESTE


def test_ambiente_teste_nao_clica_no_menu_normal():
    """Garante que os dois caminhos são mutuamente exclusivos — o clique do
    ambiente normal (#menuLink1119) não deve aparecer no caminho de teste."""
    pagina = PaginaFalsa()

    asyncio.run(navegar_ate_emissao(pagina, _logger_silencioso(), ambiente="teste"))

    assert "#menuLink1119" not in pagina.cliques


def test_ambiente_normal_nao_clica_no_menu_de_teste():
    pagina = PaginaFalsa()

    asyncio.run(navegar_ate_emissao(pagina, _logger_silencioso(), ambiente="normal"))

    assert SELETOR_MENU_NFPE_TESTES not in pagina.cliques
    assert SELETOR_MENU_EMISSAO_TESTE not in pagina.cliques


def test_falha_no_ambiente_teste_menciona_o_ambiente_na_mensagem():
    with pytest.raises(FalhaNavegacaoEmissao, match="ambiente=teste"):
        asyncio.run(
            navegar_ate_emissao(
                PaginaFalsa(deve_expirar=True), _logger_silencioso(), ambiente="teste"
            )
        )
