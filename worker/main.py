"""Ponto de entrada do Worker durante a migração para Playwright Async.

Enquanto a migração está em andamento, este ponto de entrada executa somente
testes controlados sobre Async Playwright: autenticação, navegação até a
emissão e (opcionalmente) o preenchimento completo do formulário — sem
nunca clicar em "Emitir". O fluxo fiscal completo automatizado (emissão de
verdade) permanece desabilitado até que todas as etapas sejam validadas ao
vivo.
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import replace

from playwright.async_api import BrowserContext

from src.auth import navegar_ate_emissao, realizar_login
from src.config import Config, carregar_config, carregar_credencial
from src.flows import emissao as fluxo_emissao
from src.flows.emissao import Emitente, Tarefa
from src.orquestrador import processar_tarefas_em_paralelo
from src.utils.logging import configurar_logger


async def preencher_formulario_completo(page, tarefa: Tarefa, logger) -> None:
    """
    RF13 passos 4-10 — parte da tela de emissão (já alcançada por
    navegar_ate_emissao) e vai até o fim de Transporte. NÃO chama
    validar_antes_de_emitir() nem emitir() — este teste é só de
    preenchimento, a etapa de emissão de verdade continua fora do escopo
    até ser explicitamente decidida e testada à parte (docs/ARCHITECTURE.md
    — "limite operacional atual").
    """
    await fluxo_emissao.aceitar_consentimento(page, logger)
    await fluxo_emissao.selecionar_emitente(page, tarefa.emitente, logger)
    await fluxo_emissao.preencher_destinatario(page, tarefa.destinatario, logger)
    await fluxo_emissao.preencher_identificacao_operacao(page, tarefa, logger)
    await fluxo_emissao.avancar_local_retirada(page, logger)
    await fluxo_emissao.preencher_produtos(page, tarefa, logger)
    await fluxo_emissao.preencher_transporte(page, tarefa, logger)


async def teste_autenticacao(
    tarefa_id: str,
    context: BrowserContext,
    config: Config,
    logger,
    tarefa: Tarefa | None,
) -> None:
    """Valida Context -> Page -> login -> confirmação, sem emitir nota."""

    credencial = carregar_credencial(tarefa_id)
    
    tarefa_cliente = tarefa

    if tarefa is not None:
     if not credencial.emitente:
        raise RuntimeError(
            f"[{tarefa_id}] Emitente não configurado para este cliente."
        )

    tarefa_cliente = replace(
        tarefa,
        emitente=Emitente(
            valor_select=credencial.emitente
        ),
    )
    
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

        if config.testar_navegacao_emissao:
            logger.info("[%s] Iniciando teste de navegação até emissão", tarefa_id)
            await navegar_ate_emissao(page, logger)
            logger.info("[%s] TESTE DE NAVEGAÇÃO ATÉ EMISSÃO OK", tarefa_id)

            if config.testar_preenchimento_completo:
                if tarefa is None:
                    raise RuntimeError(
                        f"[{tarefa_id}] TESTAR_PREENCHIMENTO_COMPLETO=true mas nenhuma "
                        "tarefa foi carregada — isso não deveria acontecer (bug em main())."
                    )
                logger.info("[%s] Iniciando preenchimento completo (sem emitir)", tarefa_id)
                await preencher_formulario_completo(page, tarefa_cliente, logger)
                logger.info(
                    "[%s] PREENCHIMENTO COMPLETO OK — parado antes de 'Emitir' "
                    "(não implementado/testado de propósito)",
                    tarefa_id,
                )

        # Mantém a página visível brevemente para conferência manual.
        if not config.headless:
            await asyncio.sleep(5)
    finally:
        await page.close()


def executar_smoke_test(config: Config, logger, tarefa: Tarefa | None) -> int:
    """Executa o teste Async para todos os clientes ativos configurados."""

    async def callback_autenticacao(
        tarefa_id: str,
        context: BrowserContext,
    ) -> None:
        await teste_autenticacao(tarefa_id, context, config, logger, tarefa)

    resultados = processar_tarefas_em_paralelo(
        tarefas_ids=list(config.clientes_ativos),
        processar_tarefa=callback_autenticacao,
        logger=logger,
        headless=config.headless,
        max_concorrencia=config.max_concorrencia,
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

    tarefa: Tarefa | None = None
    if config.testar_preenchimento_completo:
        logger.info("TESTAR_PREENCHIMENTO_COMPLETO=true — carregando %s", tarefa_path)
        tarefa = fluxo_emissao.carregar_tarefa_de_json(tarefa_path)

    logger.info("SMOKE_TEST=true — testando Async Playwright + autenticação")
    return executar_smoke_test(config, logger, tarefa)


if __name__ == "__main__":
    sys.exit(main())
