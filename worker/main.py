"""Ponto de entrada do Worker durante a migração para Playwright Async.

Enquanto a migração está em andamento, este ponto de entrada executa somente
o smoke test de autenticação Async. O fluxo fiscal completo permanece
desabilitado até que todas as etapas sejam convertidas e testadas.
"""

from __future__ import annotations

import asyncio
import os
import sys

from playwright.async_api import BrowserContext

from src.auth import realizar_login
from src.config import Config, carregar_config, carregar_credencial
from src.orquestrador import processar_tarefas_em_paralelo
from src.utils.logging import configurar_logger


async def teste_autenticacao(
    tarefa_id: str,
    context: BrowserContext,
    config: Config,
    logger,
) -> None:
    """Valida Context -> Page -> login -> confirmação, sem emitir nota."""

    credencial = carregar_credencial(tarefa_id)
    page = await context.new_page()

    try:
        logger.info("[%s] Iniciando teste de autenticação", tarefa_id)
        await realizar_login(
            page=page,
            url_base=config.sistema_fiscal_url,
            credencial=credencial,
            logger=logger,
        )
        logger.info("[%s] TESTE DE AUTENTICAÇÃO OK", tarefa_id)

        # Mantém a página visível brevemente para conferência manual.
        if not config.headless:
            await asyncio.sleep(5)
    finally:
        await page.close()


def executar_smoke_test(config: Config, logger) -> int:
    """Executa o teste Async para todos os clientes ativos configurados."""

    async def callback_autenticacao(
        tarefa_id: str,
        context: BrowserContext,
    ) -> None:
        await teste_autenticacao(tarefa_id, context, config, logger)

    resultados = processar_tarefas_em_paralelo(
        tarefas_ids=list(config.clientes_ativos),
        processar_tarefa=callback_autenticacao,
        logger=logger,
        headless=config.headless,
    )

    for resultado in resultados:
        if resultado.sucesso:
            logger.info("[%s] AUTENTICAÇÃO OK", resultado.tarefa_id)
        else:
            logger.error(
                "[%s] AUTENTICAÇÃO FALHOU: %s",
                resultado.tarefa_id,
                resultado.erro,
            )

    return int(any(not resultado.sucesso for resultado in resultados))


def main() -> int:
    config = carregar_config()
    logger = configurar_logger(config.log_dir)
    tarefa_path = sys.argv[1] if len(sys.argv) > 1 else "tarefa_real.json"
    smoke_test = os.getenv("SMOKE_TEST", "").lower() in {
        "1", "true", "yes", "sim"
    }

    logger.info(
        "Processando %d cliente(s) (%s), tarefa=%s",
        len(config.clientes_ativos),
        ", ".join(config.clientes_ativos),
        tarefa_path,
    )

    if not smoke_test:
        logger.error(
            "Fluxo fiscal completo está desabilitado durante a migração Async. "
            "Defina SMOKE_TEST=true para testar somente a autenticação."
        )
        return 2

    logger.info("SMOKE_TEST=true — testando Async Playwright + autenticação")
    return executar_smoke_test(config, logger)


if __name__ == "__main__":
    sys.exit(main())
