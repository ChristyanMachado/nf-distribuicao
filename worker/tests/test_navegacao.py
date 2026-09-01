"""Testes unitários da navegação Async até a emissão, sem navegador real."""

from __future__ import annotations

import asyncio
import logging

import pytest
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from src.auth import (
    FalhaNavegacaoConsulta,
    FalhaNavegacaoEmissao,
    SELETOR_MENU_EMISSAO_TESTE,
    SELETOR_MENU_CONSULTA_TESTE,
    SELETOR_MENU_NFPE_TESTES,
    SELETOR_POS_NAVEGACAO_EMISSAO,
    SELETOR_POS_NAVEGACAO_CONSULTA,
    URL_EMISSAO,
    URL_EMISSAO_TESTE,
    URL_CONSULTA_TESTE,
    navegar_ate_emissao,
    navegar_ate_consulta_teste,
)


class LocalizadorFalso:
    def __init__(self, seletor: str, cliques: list[str], href_consulta: str) -> None:
        self.seletor = seletor
        self.cliques = cliques
        self.href_consulta = href_consulta

    async def click(self) -> None:
        self.cliques.append(self.seletor)

    async def wait_for(self, **kwargs) -> None:
        assert kwargs == {"state": "visible", "timeout": 30000}

    async def get_attribute(self, nome: str) -> str | None:
        assert nome == "href"
        return self.href_consulta


class PaginaFalsa:
    def __init__(
        self,
        deve_expirar: bool = False,
        href_consulta: str = "http://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/consulta",
    ) -> None:
        self.cliques: list[str] = []
        self.deve_expirar = deve_expirar
        self.seletor_aguardado: str | None = None
        self.url_esperada_recebida = None
        self.url_aberta: str | None = None
        self.href_consulta = href_consulta

    def locator(self, seletor: str) -> LocalizadorFalso:
        return LocalizadorFalso(seletor, self.cliques, self.href_consulta)

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
        return LocalizadorFalso(f"link:{name}", self.cliques, self.href_consulta)

    async def wait_for_url(self, url, **kwargs) -> None:
        self.url_esperada_recebida = url
        assert kwargs["wait_until"] == "domcontentloaded"
        assert kwargs["timeout"] == 30000
        if self.deve_expirar:
            raise PlaywrightTimeoutError("URL não carregou")

    async def goto(self, url: str, **kwargs) -> None:
        self.url_aberta = url
        assert kwargs == {"wait_until": "domcontentloaded"}

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
    """Sem especificar ambiente, a função preserva a homologação como padrão."""
    pagina = PaginaFalsa()

    asyncio.run(navegar_ate_emissao(pagina, _logger_silencioso()))

    assert pagina.cliques == [
        "link:Produtor Rural",
        "link:NFP-e",
        SELETOR_MENU_NFPE_TESTES,
        SELETOR_MENU_EMISSAO_TESTE,
    ]
    assert pagina.seletor_aguardado == SELETOR_POS_NAVEGACAO_EMISSAO
    assert pagina.url_esperada_recebida == URL_EMISSAO_TESTE


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


def test_url_de_homologacao_exige_https():
    caminho = "/nfae/produtor/emitir/emitente"

    assert URL_EMISSAO_TESTE.match(
        f"https://homologacao.nfae.fazenda.pr.gov.br{caminho}"
    )
    assert not URL_EMISSAO_TESTE.match(
        f"http://homologacao.nfae.fazenda.pr.gov.br{caminho}"
    )


def test_navega_para_consulta_teste_sem_seguir_href_http():
    pagina = PaginaFalsa()

    asyncio.run(navegar_ate_consulta_teste(pagina, _logger_silencioso()))

    assert pagina.cliques == [
        "link:Produtor Rural",
        "link:NFP-e",
        SELETOR_MENU_NFPE_TESTES,
    ]
    assert SELETOR_MENU_CONSULTA_TESTE not in pagina.cliques
    assert pagina.url_aberta == (
        "https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/consulta"
    )
    assert pagina.url_esperada_recebida == URL_CONSULTA_TESTE
    assert pagina.seletor_aguardado == SELETOR_POS_NAVEGACAO_CONSULTA


def test_consulta_teste_falha_fechado_quando_pagina_nao_carrega():
    with pytest.raises(FalhaNavegacaoConsulta, match="não foi confirmada"):
        asyncio.run(
            navegar_ate_consulta_teste(
                PaginaFalsa(deve_expirar=True), _logger_silencioso()
            )
        )


def test_consulta_recusa_link_apontando_para_host_inesperado():
    pagina = PaginaFalsa(
        href_consulta="https://homologacao.nfae.fazenda.pr.gov.br.evil.example/nfae/produtor/consulta"
    )

    with pytest.raises(FalhaNavegacaoConsulta, match="não pertence"):
        asyncio.run(navegar_ate_consulta_teste(pagina, _logger_silencioso()))

    assert pagina.url_aberta is None
