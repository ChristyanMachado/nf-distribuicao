"""RF20 — recuperação de XML/DANFE já emitidos pela consulta da NFP-e.

Este módulo é deliberadamente separado de ``emissao.py``: consultar uma nota
existente nunca pode reaproveitar o comando que cria uma nova emissão.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

from playwright.async_api import Locator, Page, TimeoutError as PlaywrightTimeoutError


SELETOR_EMITENTE_CONSULTA = "article select.slds-select"
SELETOR_FILTRO_CHAVE = 'article select.slds-select:has(option[value="1"])'
SELETOR_CAMPO_CHAVE = "input.slds-input.slds-size_6-of-12:visible"
SELETOR_CONTAGEM_RESULTADO = "p.VuePagination__count"
SELETOR_DANFE_RESULTADO = '[title="DANFE"]'
SELETOR_XML_RESULTADO = '[title="Obter XML da nota"]'


class ConsultaFiscalInvalida(ValueError):
    """Dados insuficientes ou incompatíveis para uma consulta segura."""


class NotaConsultaNaoEncontrada(RuntimeError):
    """A consulta não retornou exatamente os documentos esperados."""


def localizar_xml_autorizado_mais_recente(download_dir: str) -> str:
    """Localiza o XML autorizado mais recente sem expor seu conteúdo.

    Este auxiliar existe para o ensaio humano emissão → consulta. Ele só aceita
    arquivos regulares criados pelo padrão de nomes do Worker e recusa links.
    A autorização e a chave ainda são validadas pelo parser fiscal antes do uso.
    """

    diretorio = Path(download_dir)
    if not diretorio.is_dir() or diretorio.is_symlink():
        raise ConsultaFiscalInvalida(
            "O diretório privado de downloads não está disponível para consulta."
        )
    candidatos = [
        caminho
        for caminho in diretorio.glob("xml_*.xml")
        if caminho.is_file() and not caminho.is_symlink()
    ]
    if not candidatos:
        raise ConsultaFiscalInvalida(
            "Nenhum XML autorizado local foi encontrado para o ensaio de consulta."
        )
    return str(max(candidatos, key=lambda caminho: caminho.stat().st_mtime_ns))


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


async def pesquisar_nota_por_chave(
    page: Page,
    chave_acesso: str,
    logger: logging.Logger,
) -> None:
    """Pesquisa uma nota conhecida e confirma um único resultado baixável.

    A chave nunca aparece em logs. O método somente prepara o resultado; os
    downloads serão ligados à fila/Storage em uma etapa separada.
    """

    chave = validar_chave_acesso(chave_acesso)
    campo = await preparar_filtro_chave(page, logger)
    try:
        await campo.fill(chave)
        if await campo.input_value() != chave:
            raise ConsultaFiscalInvalida(
                "A chave de acesso foi alterada pela tela antes da consulta."
            )
        await page.get_by_role(
            "button", name="Consultar", exact=True
        ).click(timeout=15_000)
        contagem = page.locator(SELETOR_CONTAGEM_RESULTADO).filter(
            has_text=re.compile(r"^\s*Um registro\s*$", re.IGNORECASE)
        )
        await contagem.wait_for(state="visible", timeout=30_000)
        await page.locator(SELETOR_DANFE_RESULTADO).wait_for(
            state="visible", timeout=15_000
        )
        await page.locator(SELETOR_XML_RESULTADO).wait_for(
            state="visible", timeout=15_000
        )
    except ConsultaFiscalInvalida:
        raise
    except PlaywrightTimeoutError as exc:
        raise NotaConsultaNaoEncontrada(
            "A Receita não retornou um único resultado com XML e DANFE."
        ) from exc

    logger.info("Nota localizada por chave; XML e DANFE estão disponíveis")


async def preparar_filtro_chave(
    page: Page,
    logger: logging.Logger,
) -> Locator:
    """Ativa o filtro por chave e devolve o campo ainda vazio."""

    filtro = page.locator(SELETOR_FILTRO_CHAVE)
    try:
        await filtro.select_option(value="1", timeout=15_000)
        campo = page.locator(SELETOR_CAMPO_CHAVE)
        await campo.wait_for(state="visible", timeout=15_000)
    except PlaywrightTimeoutError as exc:
        raise ConsultaFiscalInvalida(
            "O filtro por chave de acesso não ficou disponível na consulta."
        ) from exc

    logger.info("Filtro por chave de acesso preparado (campo vazio)")
    return campo
