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
import re

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

# Confirmado no teste ao vivo: checkbox apresentado ao chegar na emissão.
SELETOR_POS_NAVEGACAO_EMISSAO = "#div-consentimento input[type=checkbox]"
URL_EMISSAO = re.compile(r"^https://nfae\.fazenda\.pr\.gov\.br/nfae/produtor/emitir/")


class FalhaAutenticacao(Exception):
    """Levantada quando o login não é confirmado dentro do timeout."""


class FalhaIdentidadeAutenticada(Exception):
    """Levantada quando a área autenticada não exibe a identidade esperada."""


class FalhaNavegacaoEmissao(Exception):
    """Levantada quando a tela de emissão não é confirmada após a navegação."""


async def validar_identidade_autenticada(
    page: Page,
    credencial: CredencialCliente,
    logger: logging.Logger,
) -> None:
    """Confirma a identidade pós-login sem expor o texto esperado nos logs.

    ``CLIENTE_X_IDENTIDADE_ESPERADA`` deve conter um texto que o portal exibe
    na área autenticada, como o nome do emitente. A validação é opcional
    durante a transição: quando a variável não está definida, o login segue,
    mas o log deixa claro que a identidade não foi comprovada.
    """

    identidade_esperada = credencial.identidade_esperada
    if not identidade_esperada:
        logger.warning(
            "[%s] Identidade pós-login não validada: "
            "configure %s_IDENTIDADE_ESPERADA no .env.",
            credencial.cliente_id,
            credencial.cliente_id,
        )
        return

    try:
        await page.get_by_text(identidade_esperada, exact=False).wait_for(
            state="visible",
            timeout=10000,
        )
    except PlaywrightTimeoutError as exc:
        raise FalhaIdentidadeAutenticada(
            f"[{credencial.cliente_id}] A área autenticada não exibiu a "
            "identidade configurada. Verifique a credencial, o texto "
            "esperado no .env ou a interface do portal."
        ) from exc

    logger.info("[%s] Identidade pós-login confirmada", credencial.cliente_id)


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

    await validar_identidade_autenticada(page, credencial, logger)


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

    # Confirmado no teste ao vivo em 19/08. Localizar pelo papel e texto é
    # mais resistente que a posição estrutural ``a:nth-child(44)``.
    logger.info("Navegação: abrindo menu Produtor Rural")
    await page.get_by_role(
        "link",
        name="Produtor Rural",
        exact=True,
    ).click()

    logger.info("Navegação: abrindo NFP-e")
    await page.get_by_role("link", name="NFP-e", exact=True).click()

    logger.info("Navegação: abrindo Emissão")
    await page.locator("#menuLink1119").click()

    try:
        await page.wait_for_url(
            URL_EMISSAO,
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await page.wait_for_selector(
            SELETOR_POS_NAVEGACAO_EMISSAO,
            state="visible",
            timeout=30000,
        )
    except PlaywrightTimeoutError as exc:
        raise FalhaNavegacaoEmissao(
            "A tela de emissão não foi confirmada em 30s após a navegação. "
            "Verifique os seletores de menu ou o seletor pós-navegação."
        ) from exc

    logger.info(
        "Área de emissão carregada"
    )
