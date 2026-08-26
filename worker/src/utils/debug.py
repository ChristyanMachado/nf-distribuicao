"""
Ferramentas de depuração pro fluxo de reconhecimento ao vivo.

O objetivo aqui é reduzir o custo de "onde exatamente travou e por quê"
quando um seletor ainda não confirmado quebrar — que é o tipo de falha
esperado nesta fase (RNF07 — observabilidade).

Convertido para Async em 20/08, junto com o resto do fluxo fiscal — este
módulo não é chamado por nenhum outro ainda (fica pronto pra quando as
etapas do fluxo passarem a usar rodar_etapa()), mas precisa estar em Async
pra não virar uma armadilha: chamar page.screenshot()/page.pause() em Sync
sobre uma Page Async simplesmente não funciona (a chamada sem await retorna
uma coroutine nunca executada, sem erro óbvio).
"""
from __future__ import annotations

import datetime
import logging
import os
import re

from playwright.async_api import Page


async def rodar_etapa(nome: str, page: Page, logger: logging.Logger, download_dir: str, fn, *args, **kwargs):
    """
    Envolve uma etapa do fluxo (ex: preencher_destinatario) com logging
    consistente, screenshot automático em caso de falha, e — se
    INSPECIONAR=true no .env e o navegador NÃO estiver headless — abre o
    Playwright Inspector bem no ponto do erro.

    `fn` deve ser uma função async; é chamada como `await fn(*args, **kwargs)`.
    """
    logger.info(f"→ Etapa: {nome}")
    try:
        resultado = await fn(*args, **kwargs)
        logger.info(f"✓ Etapa concluída: {nome}")
        return resultado
    except Exception as e:
        logger.error("✗ Etapa falhou: %s (%s)", nome, type(e).__name__)
        await _salvar_screenshot_erro(page, nome, download_dir, logger)

        headless = os.getenv("HEADLESS", "false").lower() == "true"
        inspecionar = os.getenv("INSPECIONAR", "false").lower() == "true"

        if inspecionar and headless:
            # Servidor/VM não tem tela: o Inspector precisa de uma janela de
            # navegador interativa pra funcionar. Sem essa checagem, isso
            # travaria a tarefa indefinidamente esperando um humano que
            # nunca vai aparecer, em produção — pior ainda numa VM (RF24:
            # falha de uma tarefa não deveria travar as demais, mas um
            # page.pause() pendurado consome o recurso do contexto por tempo
            # indeterminado).
            logger.warning(
                "INSPECIONAR=true mas HEADLESS=true — ignorando (o Inspector "
                "precisa de navegador visível). Deixe HEADLESS=false pra "
                "depurar interativamente."
            )
        elif inspecionar:
            logger.warning(
                f"INSPECIONAR=true — abrindo o Playwright Inspector na etapa "
                f"'{nome}'. Clique no elemento certo pra ver/copiar o seletor "
                "gerado (aba 'Explore'), depois clique ▶ Resume no Inspector "
                "pra deixar a exceção original seguir seu curso normal."
            )
            await page.pause()

        raise


async def _salvar_screenshot_erro(page: Page, nome_etapa: str, download_dir: str, logger: logging.Logger) -> None:
    os.makedirs(download_dir, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", nome_etapa.lower()).strip("-")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    caminho = os.path.join(download_dir, f"erro_{slug}_{timestamp}.png")
    try:
        await page.screenshot(path=caminho, full_page=True)
        try:
            os.chmod(caminho, 0o600)
        except OSError:
            # ACLs da VM devem complementar quando o SO não usa bits POSIX.
            pass
        logger.info(f"Screenshot da falha salvo em: {caminho}")
    except Exception as e:  # noqa: BLE001 — screenshot é auxiliar, não pode derrubar o fluxo
        logger.warning(f"Não foi possível salvar screenshot: {e}")
