"""
Ferramentas de depuração pro fluxo de reconhecimento ao vivo (amanhã).

O objetivo aqui é reduzir o custo de "onde exatamente travou e por quê"
quando um seletor ainda não confirmado quebrar — que é o tipo de falha
esperado nesta fase (RNF07 — observabilidade).
"""
from __future__ import annotations

import datetime
import logging
import os
import re

from playwright.sync_api import Page


def rodar_etapa(nome: str, page: Page, logger: logging.Logger, download_dir: str, fn, *args, **kwargs):
    """
    Envolve uma etapa do fluxo (ex: preencher_destinatario) com logging
    consistente, screenshot automático em caso de falha, e — se
    INSPECIONAR=true no .env — abre o Playwright Inspector bem no ponto do
    erro, pronto pra você clicar no elemento certo e copiar o seletor
    gerado, sem precisar reconstruir o cenário manualmente.
    """
    logger.info(f"→ Etapa: {nome}")
    try:
        resultado = fn(*args, **kwargs)
        logger.info(f"✓ Etapa concluída: {nome}")
        return resultado
    except Exception as e:
        logger.error(f"✗ Etapa falhou: {nome} — {e}")
        _salvar_screenshot_erro(page, nome, download_dir, logger)

        if os.getenv("INSPECIONAR", "false").lower() == "true":
            logger.warning(
                f"INSPECIONAR=true — abrindo o Playwright Inspector na etapa "
                f"'{nome}'. Clique no elemento certo pra ver/copiar o seletor "
                "gerado (aba 'Explore'), depois clique ▶ Resume no Inspector "
                "pra deixar a exceção original seguir seu curso normal."
            )
            page.pause()

        raise


def _salvar_screenshot_erro(page: Page, nome_etapa: str, download_dir: str, logger: logging.Logger) -> None:
    os.makedirs(download_dir, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", nome_etapa.lower()).strip("-")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    caminho = os.path.join(download_dir, f"erro_{slug}_{timestamp}.png")
    try:
        page.screenshot(path=caminho, full_page=True)
        logger.info(f"Screenshot da falha salvo em: {caminho}")
    except Exception as e:  # noqa: BLE001 — screenshot é auxiliar, não pode derrubar o fluxo
        logger.warning(f"Não foi possível salvar screenshot: {e}")
