"""
RF14 — cada cliente processado em uma sessão/contexto de navegador
independente, evitando logout/login entre emissões.

Este módulo é sobre ORQUESTRAÇÃO (abrir N contextos, rodar uma tarefa em
cada, isolar falhas de um cliente das dos demais — RF24) e não depende dos
seletores reais do site fiscal. Por isso dá pra escrever e testar antes de
termos os logins: o teste usa about:blank/example.com no lugar do site real,
só pra provar que os 3 contextos funcionam de forma isolada e em paralelo.

Quando os seletores de src/auth.py e src/flows/emissao.py estiverem prontos,
troque `processar_uma_tarefa` para chamar o fluxo real (realizar_login →
preencher_nota → emitir → aguardar_autorizacao → baixar_documentos).
"""
from __future__ import annotations

import asyncio
import logging
import os
import traceback
from contextlib import nullcontext
from dataclasses import dataclass
from typing import Awaitable, Callable

from playwright.async_api import (
    Browser,
    BrowserContext,
    async_playwright,
)


@dataclass
class ResultadoProcessamento:
    tarefa_id: str
    sucesso: bool
    erro: str | None = None
    tipo_erro: str | None = None


ProcessarTarefa = Callable[
    [str, BrowserContext],
    Awaitable[None],
]


async def _processar_uma_tarefa(
    tarefa_id: str,
    browser: Browser,
    processar_tarefa: ProcessarTarefa,
    logger: logging.Logger,
    semaphore: asyncio.Semaphore | None = None,
) -> ResultadoProcessamento:

    context: BrowserContext | None = None

    # RNF: concorrência hoje é limitada só pelo tamanho de CLIENTES_ATIVOS
    # (3 testados). Pra crescer de 3 pra N tarefas num servidor sem abrir N
    # Chromiums simultâneos, MAX_CONCORRENCIA (opcional) limita quantas
    # tarefas têm um BrowserContext aberto ao mesmo tempo — as demais
    # esperam a vez, sem serem canceladas nem perder isolamento (RF24).
    # Sem configurar nada, o comportamento é idêntico ao de antes (sem limite).
    async with (semaphore if semaphore is not None else nullcontext()):
        try:
            logger.info(
                "[%s] Criando contexto independente",
                tarefa_id,
            )

            # Cada tarefa possui sua própria sessão e aceita downloads
            # iniciados pelo sistema fiscal (XML/DANFE), sem depender da UI
            # visual de downloads do Chromium.
            context = await browser.new_context(accept_downloads=True)

            logger.info(
                "[%s] Contexto criado",
                tarefa_id,
            )

            await processar_tarefa(
                tarefa_id,
                context,
            )

            logger.info(
                "[%s] Concluído com sucesso",
                tarefa_id,
            )

            return ResultadoProcessamento(
                tarefa_id=tarefa_id,
                sucesso=True,
            )

        except Exception as exc:
            pilha = traceback.extract_tb(exc.__traceback__)
            origem = pilha[-1] if pilha else None
            logger.error(
                "[%s] Falha isolada (%s%s)",
                tarefa_id,
                type(exc).__name__,
                (
                    f" em {os.path.basename(origem.filename)}:{origem.lineno}"
                    if origem
                    else ""
                ),
            )

            return ResultadoProcessamento(
                tarefa_id=tarefa_id,
                sucesso=False,
                erro=f"Falha operacional isolada ({type(exc).__name__}).",
                tipo_erro=type(exc).__name__,
            )

        finally:
            if context is not None:
                try:
                    await context.close()
                except Exception:
                    logger.error(
                        "[%s] Erro ao fechar contexto do navegador",
                        tarefa_id,
                    )


async def processar_tarefas_em_paralelo_async(
    tarefas_ids: list[str],
    processar_tarefa: ProcessarTarefa,
    logger: logging.Logger,
    headless: bool = False,
    max_concorrencia: int | None = None,
) -> list[ResultadoProcessamento]:

    if not tarefas_ids:
        return []

    semaphore = asyncio.Semaphore(max_concorrencia) if max_concorrencia else None
    if max_concorrencia:
        logger.info("Concorrência limitada a %d contexto(s) simultâneo(s)", max_concorrencia)

    async with async_playwright() as playwright:

        logger.info(
            "Iniciando Chromium para %d tarefa(s)",
            len(tarefas_ids),
        )

        browser = await playwright.chromium.launch(
            headless=headless,
        )

        try:
            resultados = await asyncio.gather(
                *(
                    _processar_uma_tarefa(
                        tarefa_id=tarefa_id,
                        browser=browser,
                        processar_tarefa=processar_tarefa,
                        logger=logger,
                        semaphore=semaphore,
                    )
                    for tarefa_id in tarefas_ids
                )
            )

            return resultados

        finally:
            await browser.close()


def processar_tarefas_em_paralelo(
    tarefas_ids: list[str],
    processar_tarefa: ProcessarTarefa,
    logger: logging.Logger,
    headless: bool = False,
    max_concorrencia: int | None = None,
) -> list[ResultadoProcessamento]:
    """
    Wrapper síncrono para manter a main.py simples.

    O restante da aplicação não precisa conhecer asyncio.
    """

    return asyncio.run(
        processar_tarefas_em_paralelo_async(
            tarefas_ids=tarefas_ids,
            processar_tarefa=processar_tarefa,
            logger=logger,
            headless=headless,
            max_concorrencia=max_concorrencia,
        )
    )
