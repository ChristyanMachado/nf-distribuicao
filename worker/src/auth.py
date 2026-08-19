"""
RF13 — autenticação e navegação no sistema fiscal.

Versão Async do Playwright.

A autenticação é executada dentro de um BrowserContext independente
por tarefa, permitindo que múltiplos emitentes sejam autenticados
simultaneamente sem compartilhar cookies, localStorage ou sessão.

Nesta etapa estamos validando somente:
    Login -> confirmação de login

A navegação até a emissão permanece implementada aqui, mas será
testada separadamente após a autenticação estar validada.
"""

from __future__ import annotations

import logging

from playwright.async_api import (
    Page,
    TimeoutError as PlaywrightTimeoutError,
)

from .config import CredencialCliente


URL_LOGIN = "https://receita.pr.gov.br/login"

SELETOR_CAMPO_USUARIO = "#cpfusuario"

# Confirmado no reconhecimento manual:
# elemento presente somente após login bem-sucedido.
SELETOR_POS_LOGIN = "#icons"


class FalhaAutenticacao(Exception):
    """Levantada quando o login não é confirmado dentro do timeout."""


async def realizar_login(
    page: Page,
    url_base: str,
    credencial: CredencialCliente,
    logger: logging.Logger,
) -> None:
    """
    Realiza a autenticação no sistema fiscal.

    A função recebe uma Page pertencente exclusivamente ao contexto
    do emitente/tarefa atual.
    """

    logger.info(
        "[%s] Abrindo %s",
        credencial.cliente_id,
        url_base,
    )

    await page.goto(
        url_base,
        wait_until="domcontentloaded",
    )

    logger.info(
        "[%s] Preenchendo credenciais",
        credencial.cliente_id,
    )

    await page.locator(
        SELETOR_CAMPO_USUARIO
    ).fill(
        credencial.login
    )

    await page.get_by_placeholder(
        "Senha"
    ).fill(
        credencial.senha
    )

    await page.get_by_role(
        "button",
        name="Login",
    ).click()

    logger.info(
        "[%s] Aguardando confirmação de login",
        credencial.cliente_id,
    )

    try:
        await page.wait_for_selector(
            SELETOR_POS_LOGIN,
            timeout=15000,
        )

    except PlaywrightTimeoutError as exc:
        raise FalhaAutenticacao(
            f"[{credencial.cliente_id}] "
            "Login não confirmado em 15s — "
            "usuário/senha incorretos ou o site mudou o "
            f"elemento pós-login ({SELETOR_POS_LOGIN})."
        ) from exc

    logger.info(
        "[%s] Login confirmado",
        credencial.cliente_id,
    )


async def navegar_ate_emissao(
    page: Page,
    logger: logging.Logger,
) -> None:
    """
    RF13 — passo 3.

    Caminho:
        Login
        -> Produtor Rural
        -> NFP-e
        -> Emissão

    Esta função foi convertida para Async, mas ainda não será
    executada no primeiro teste de autenticação.
    """

    logger.info(
        "Navegando: Produtor Rural -> NFP-e -> Emissão"
    )

    await page.locator(
        "#menulateral > div > a.menos"
    ).click()

    await page.locator(
        "#menulateral412 > div:nth-child(3) > a"
    ).click()

    await page.locator(
        "#menuLink1119"
    ).click()

    logger.info(
        "Área de emissão carregada"
    )