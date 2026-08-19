"""
Ponto de entrada do worker.

Neste estágio existem dois modos:

1. Fluxo real:
   continua usando o código atual de auth/emissao,
   temporariamente em execução síncrona.

2. Smoke test:
   testa a nova arquitetura Async Playwright:
   1 Browser -> N BrowserContexts independentes.

Uso:

    python main.py
    python main.py tarefa_real.json

Para testar a nova arquitetura:

    PowerShell:
    $env:SMOKE_TEST="true"
    python main.py tarefa_real.json
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import BrowserContext

from src.config import carregar_config
from src.utils.logging import configurar_logger
from src.orquestrador import processar_tarefas_em_paralelo

from src.auth import (
    realizar_login,
    navegar_ate_emissao,
)

from src.flows.emissao import (
    aceitar_consentimento,
    avancar_local_retirada,
    preencher_destinatario,
    preencher_identificacao_operacao,
    preencher_produtos,
    preencher_transporte,
    selecionar_emitente,
    validar_antes_de_emitir,
    emitir,
    baixar_documentos,
    Destinatario,
    Emitente,
    ItemTarefa,
    Tarefa,
)

from src.config import carregar_credencial

from src.utils.debug import rodar_etapa


def carregar_tarefa(caminho: str) -> Tarefa:
    with open(caminho, encoding="utf-8") as f:
        dados = json.load(f)

    return Tarefa(
        tarefa_id=dados["tarefa_id"],
        cliente_id=dados["cliente_id"],
        emitente=Emitente(**dados["emitente"]),
        destinatario=Destinatario(**dados["destinatario"]),
        itens=[
            ItemTarefa(**item)
            for item in dados["itens"]
        ],
        **{
            k: v
            for k, v in dados.items()
            if k in (
                "natureza_operacao",
                "tipo_operacao",
                "finalidade_emissao",
                "indicador_presenca",
                "modalidade_frete",
            )
        },
    )


PLACEHOLDERS = {
    "",
    "0",
    "0.0",
    "00.000.000/0001-00",
    "00000-000",
    "0000000000",
}


def avisar_se_tarefa_parece_fixture(
    tarefa: Tarefa,
    tarefa_path: str,
    logger,
) -> None:

    campos_suspeitos = []

    if tarefa.destinatario.cnpj in PLACEHOLDERS:
        campos_suspeitos.append(
            "destinatario.cnpj"
        )

    if not tarefa.destinatario.razao_social:
        campos_suspeitos.append(
            "destinatario.razao_social"
        )

    if tarefa.destinatario.cep in PLACEHOLDERS:
        campos_suspeitos.append(
            "destinatario.cep"
        )

    if tarefa.emitente.valor_select in PLACEHOLDERS:
        campos_suspeitos.append(
            "emitente.valor_select"
        )

    for i, item in enumerate(tarefa.itens):
        if not item.codigo_produto:
            campos_suspeitos.append(
                f"itens[{i}].codigo_produto"
            )

    if campos_suspeitos:
        logger.warning(
            "'%s' parece ter valores de exemplo/vazios em: %s",
            tarefa_path,
            ", ".join(campos_suspeitos),
        )


# ============================================================
# NOVO: smoke test da arquitetura async
# ============================================================

async def teste_autenticacao(
    tarefa_id: str,
    context,
    config,
    logger,
) -> None:
    """
    Testa somente:

        Context
          ↓
        Page
          ↓
        Login
          ↓
        Confirmação

    Não navega até emissão.
    Não preenche NF.
    Não emite nada.
    """

    from src.auth import realizar_login

    credencial = carregar_credencial(
        tarefa_id
    )

    page = await context.new_page()

    try:
        logger.info(
            "[%s] Iniciando teste de autenticação",
            tarefa_id,
        )

        await realizar_login(
            page=page,
            url_base=config.sistema_fiscal_url,
            credencial=credencial,
            logger=logger,
        )

        logger.info(
            "[%s] TESTE DE AUTENTICAÇÃO OK",
            tarefa_id,
        )

        # Mantém a página aberta para você observar o resultado.
        await asyncio.sleep(5)

    finally:
        await page.close()

# ============================================================
# FLUXO REAL ANTIGO
# ============================================================

def processar_uma_tarefa_real(
    cliente_id: str,
    browser,
    tarefa_path: str,
    config,
    logger,
) -> None:

    credencial = carregar_credencial(
        cliente_id
    )

    tarefa = carregar_tarefa(
        tarefa_path
    )

    tarefa.cliente_id = cliente_id

    avisar_se_tarefa_parece_fixture(
        tarefa,
        tarefa_path,
        logger,
    )

    context = browser.new_context()
    page = context.new_page()

    def etapa(nome, fn, *args):
        return rodar_etapa(
            f"[{cliente_id}] {nome}",
            page,
            logger,
            config.download_dir,
            fn,
            *args,
        )

    try:

        etapa(
            "login",
            realizar_login,
            page,
            config.sistema_fiscal_url,
            credencial,
            logger,
        )

        etapa(
            "navegação até emissão",
            navegar_ate_emissao,
            page,
            logger,
        )

        etapa(
            "consentimento",
            aceitar_consentimento,
            page,
            logger,
        )

        etapa(
            "seleção do emitente",
            selecionar_emitente,
            page,
            tarefa.emitente,
            logger,
        )

        etapa(
            "destinatário",
            preencher_destinatario,
            page,
            tarefa.destinatario,
            logger,
        )

        etapa(
            "identificação da operação",
            preencher_identificacao_operacao,
            page,
            tarefa,
            logger,
        )

        etapa(
            "local de retirada",
            avancar_local_retirada,
            page,
            logger,
        )

        etapa(
            "produtos",
            preencher_produtos,
            page,
            tarefa,
            logger,
        )

        etapa(
            "transporte",
            preencher_transporte,
            page,
            tarefa,
            logger,
        )

        if config.modo_operacao == "simulacao":
            logger.info(
                "[%s] Modo simulação — não emite.",
                cliente_id,
            )
            return

        if not validar_antes_de_emitir(
            page,
            tarefa,
            logger,
        ):
            logger.info(
                "[%s] Emissão cancelada.",
                cliente_id,
            )
            return

        etapa(
            "emissão",
            emitir,
            page,
            tarefa,
            logger,
        )

        documentos = etapa(
            "download de documentos",
            baixar_documentos,
            page,
            tarefa,
            config.download_dir,
            logger,
        )

        logger.info(
            "[%s] Concluído. Documentos: %s",
            cliente_id,
            documentos,
        )

    finally:
        context.close()


def main() -> int:

    config = carregar_config()

    logger = configurar_logger(
        config.log_dir
    )

    tarefa_path = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "tarefas_exemplo.json"
    )

    smoke_test = os.getenv(
        "SMOKE_TEST",
        ""
    ).lower() in {
        "1",
        "true",
        "yes",
        "sim",
    }

    logger.info(
        "Processando %d cliente(s) (%s), tarefa=%s",
        len(config.clientes_ativos),
        ", ".join(config.clientes_ativos),
        tarefa_path,
    )

    # ========================================================
    # NOVO TESTE DA ARQUITETURA ASYNC
    # ========================================================

    if smoke_test:

        logger.info(
        "SMOKE_TEST=true — "
        "testando Async Playwright + autenticação"
    )

    async def callback_autenticacao(
        tarefa_id,
        context,
    ):
        await teste_autenticacao(
            tarefa_id,
            context,
            config,
            logger,
        )

    resultados = processar_tarefas_em_paralelo(
        tarefas_ids=list(config.clientes_ativos),
        processar_tarefa=callback_autenticacao,
        logger=logger,
        headless=config.headless,
    )

    for resultado in resultados:

        if resultado.sucesso:
            logger.info(
                "[%s] AUTENTICAÇÃO OK",
                resultado.tarefa_id,
            )

        else:
            logger.error(
                "[%s] AUTENTICAÇÃO FALHOU: %s",
                resultado.tarefa_id,
                resultado.erro,
            )

    return (
        1
        if any(
            not resultado.sucesso
            for resultado in resultados
        )
        else 0
    )
    # ========================================================
    # FLUXO REAL ANTIGO
    #
    # Mantemos temporariamente até auth.py/emissao.py
    # serem migrados para async.
    # ========================================================

    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:

        browser = playwright.chromium.launch(
            headless=config.headless,
        )

        try:

            # IMPORTANTE:
            # nesta fase, o fluxo real continua sendo síncrono.
            #
            # O novo orquestrador async NÃO é usado aqui ainda,
            # porque auth.py/emissao.py ainda usam Sync API.

            for cliente_id in config.clientes_ativos:

                try:

                    processar_uma_tarefa_real(
                        cliente_id,
                        browser,
                        tarefa_path,
                        config,
                        logger,
                    )

                except Exception as exc:

                    logger.exception(
                        "[%s] Falha: %s",
                        cliente_id,
                        exc,
                    )

                    # Continua para o próximo cliente.
                    continue

        finally:
            browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())