"""Testes da validação de identidade pós-login, sem navegador real."""

from __future__ import annotations

import asyncio
import logging

import pytest
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from src.auth import (
    FalhaAutenticacao,
    FalhaIdentidadeAutenticada,
    realizar_login,
    validar_identidade_autenticada,
)
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


class CampoLoginFalso:
    def __init__(self, pagina: "PaginaLoginFalsa", nome: str) -> None:
        self.pagina = pagina
        self.nome = nome

    async def fill(self, valor: str) -> None:
        self.pagina.preenchimentos.append((self.nome, valor))


class BotaoLoginFalso:
    def __init__(self, pagina: "PaginaLoginFalsa") -> None:
        self.pagina = pagina

    async def click(self) -> None:
        self.pagina.login_clicado = True


class PaginaLoginFalsa:
    """Page mínima que permite provar a ordem goto -> origem -> credenciais."""

    def __init__(self, url_final: str) -> None:
        self.url_final = url_final
        self.url = "about:blank"
        self.preenchimentos: list[tuple[str, str]] = []
        self.login_clicado = False

    async def goto(self, url: str, *, wait_until: str) -> None:
        assert url == "https://receita.pr.gov.br/login"
        assert wait_until == "domcontentloaded"
        self.url = self.url_final

    def locator(self, seletor: str) -> CampoLoginFalso:
        assert seletor == "#cpfusuario"
        return CampoLoginFalso(self, "usuario")

    def get_by_placeholder(self, nome: str) -> CampoLoginFalso:
        assert nome == "Senha"
        return CampoLoginFalso(self, "senha")

    def get_by_role(self, papel: str, *, name: str) -> BotaoLoginFalso:
        assert papel == "button"
        assert name == "Login"
        return BotaoLoginFalso(self)

    async def wait_for_selector(self, seletor: str, *, timeout: int) -> None:
        assert seletor == "#icons"
        assert timeout == 15000


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


def test_repr_da_credencial_nunca_expoe_login_nem_senha():
    """
    RNF02: dataclass gera __repr__ por padrão expondo todos os campos —
    isso foi sobrescrito em CredencialCliente pra nunca vazar login/senha
    se alguém logar/formatar o objeto inteiro por engano.
    """
    credencial = CredencialCliente(
        cliente_id="CLIENTE_A",
        login="12345678900",
        senha="minha-senha-secreta",
    )

    texto = repr(credencial)

    assert "12345678900" not in texto
    assert "minha-senha-secreta" not in texto
    assert "CLIENTE_A" in texto
    assert "***" in texto


def test_str_da_credencial_tambem_nao_expoe_segredo():
    # str() cai no __repr__ quando __str__ não é definido — confirma que
    # não existe um caminho alternativo (ex: __str__ próprio) vazando o dado.
    credencial = CredencialCliente(cliente_id="CLIENTE_B", login="000", senha="segredo")
    assert "segredo" not in str(credencial)
    assert "000" not in str(credencial)


def test_login_confere_origem_final_antes_de_preencher_credenciais():
    pagina = PaginaLoginFalsa("https://receita.pr.gov.br/login?fluxo=oficial")
    credencial = _credencial(None)

    asyncio.run(
        realizar_login(
            pagina,
            "https://receita.pr.gov.br/login",
            credencial,
            _logger_silencioso(),
        )
    )

    assert pagina.preenchimentos == [
        ("usuario", credencial.login),
        ("senha", credencial.senha),
    ]
    assert pagina.login_clicado is True


@pytest.mark.parametrize(
    "url_final",
    [
        "http://receita.pr.gov.br/login",
        "https://receita.pr.gov.br.evil.example/login",
        "https://usuario:senha@receita.pr.gov.br/login",
        "https://receita.pr.gov.br:porta-invalida/login",
    ],
)
def test_login_recusa_redirecionamento_inseguro_sem_tocar_em_credenciais(url_final):
    pagina = PaginaLoginFalsa(url_final)

    with pytest.raises(FalhaAutenticacao, match="origem HTTPS oficial"):
        asyncio.run(
            realizar_login(
                pagina,
                "https://receita.pr.gov.br/login",
                _credencial(None),
                _logger_silencioso(),
            )
        )

    assert pagina.preenchimentos == []
    assert pagina.login_clicado is False
