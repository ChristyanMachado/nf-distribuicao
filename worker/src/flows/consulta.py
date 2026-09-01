"""RF20 — recuperação de XML/DANFE já emitidos pela consulta da NFP-e.

Este módulo é deliberadamente separado de ``emissao.py``: consultar uma nota
existente nunca pode reaproveitar o comando que cria uma nova emissão.
"""
from __future__ import annotations

import logging
import re

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError


SELETOR_EMITENTE_CONSULTA = "article select.slds-select"


class ConsultaFiscalInvalida(ValueError):
    """Dados insuficientes ou incompatíveis para uma consulta segura."""


async def selecionar_emitente_consulta(
    page: Page,
    valor_select_nfpe: str,
    logger: logging.Logger,
) -> None:
    """Seleciona exatamente o emitente original da nota.

    Mesmo que a tela mostre apenas uma opção hoje, nunca escolhemos por posição:
    o ``value`` persistido no cadastro do emitente é estável e evita recuperar
    documentos sob a sessão fiscal errada caso novas opções apareçam.
    """

    valor = valor_select_nfpe.strip()
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,120}", valor):
        raise ConsultaFiscalInvalida(
            "O identificador NFP-e do emitente é inválido; revise o cadastro."
        )

    # A tela ganha outros selects conforme carrega os filtros. Restringir pelo
    # value esperado evita strict-mode ambiguity e não depende da ordem visual.
    campo = page.locator(
        f'{SELETOR_EMITENTE_CONSULTA}:has(option[value="{valor}"])'
    )
    try:
        # A SPA publica o <select> antes de terminar de carregar suas opções.
        # select_option espera a opção exata existir, sem uma pausa fixa.
        await campo.select_option(value=valor, timeout=15_000)
    except PlaywrightTimeoutError as exc:
        raise ConsultaFiscalInvalida(
            "O emitente original não está disponível nesta sessão fiscal."
        ) from exc

    if await campo.input_value() != valor:
        raise ConsultaFiscalInvalida(
            "A seleção do emitente original não foi confirmada pela tela."
        )
    logger.info("Emitente original selecionado para consulta fiscal")


def validar_chave_acesso(chave_acesso: str) -> str:
    """Aceita somente a chave oficial de 44 dígitos, sem registrá-la em log."""

    chave = chave_acesso.strip()
    if not re.fullmatch(r"\d{44}", chave):
        raise ConsultaFiscalInvalida(
            "A nota não possui uma chave de acesso válida para consulta."
        )
    return chave
