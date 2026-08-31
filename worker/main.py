"""Ponto de entrada do Worker durante a migração para Playwright Async.

Enquanto a migração está em andamento, este ponto de entrada executa somente
testes controlados sobre Async Playwright: autenticação, navegação até a
emissão e (opcionalmente) o preenchimento completo do formulário — sem
nunca emitir no ambiente normal. Uma emissão controlada em homologação pode
ser liberada por flag explícita; produção permanece desabilitada.
"""

from __future__ import annotations

import asyncio
import os
import sys
from time import perf_counter
from dataclasses import replace
from contextlib import suppress

from playwright.async_api import BrowserContext

from src.auth import navegar_ate_emissao, realizar_login
from src.config import Config, carregar_config, carregar_credencial
from src.flows import emissao as fluxo_emissao
from src.flows.emissao import Emitente, Tarefa
from src.fonte_tarefas import FontePostgresTarefas, FonteTarefasErro
from src.storage_documentos import (
    armazenar_documentos,
    carregar_manifesto_upload_pendente,
    criar_manifesto_upload_pendente,
    listar_manifestos_upload_pendente,
    remover_documentos_expirados,
    remover_manifesto_upload_pendente,
)
from src.orquestrador import (
    processar_tarefas_em_paralelo,
    processar_tarefas_em_paralelo_async,
)
from src.utils.logging import configurar_logger


class FalhaPreparacaoTarefa(RuntimeError):
    """Falha pré-navegador com diagnóstico seguro para o Web."""

    def __init__(self, codigo: str, mensagem: str) -> None:
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem_usuario = mensagem


def _validar_preparacao_reserva(reserva, config: Config):
    contratada = reserva.contratada
    if contratada.ambiente != "teste" or config.ambiente_emissao != "teste":
        raise FalhaPreparacaoTarefa(
            "AMBIENTE_INCORRETO",
            "A tarefa não pertence ao ambiente seguro configurado no Worker.",
        )

    try:
        credencial = carregar_credencial(contratada.credencial_referencia)
    except RuntimeError as exc:
        raise FalhaPreparacaoTarefa(
            "CREDENCIAL_INCOMPLETA",
            "A configuração segura do emitente está incompleta no Worker.",
        ) from exc

    if not credencial.identidade_esperada:
        raise FalhaPreparacaoTarefa(
            "CREDENCIAL_INCOMPLETA",
            "A confirmação de identidade do emitente não está configurada no Worker.",
        )
    if (
        not credencial.emitente
        or credencial.emitente != contratada.tarefa.emitente.valor_select
    ):
        raise FalhaPreparacaoTarefa(
            "EMITENTE_DIVERGENTE",
            "O identificador NFP-e desta distribuição não corresponde à configuração segura do emitente.",
        )
    return credencial


def _diagnostico_falha_pre_emissao(
    etapa: str,
    exc: Exception | None = None,
) -> tuple[str, str]:
    if isinstance(exc, fluxo_emissao.AcessoPortalNegado):
        return (
            "ACESSO_PORTAL_NEGADO",
            "A Receita negou acesso ao módulo seguinte antes da emissão.",
        )
    return {
        "autenticacao": (
            "FALHA_AUTENTICACAO",
            "A Receita não confirmou o acesso do emitente.",
        ),
        "navegacao": (
            "FALHA_NAVEGACAO",
            "A tela de emissão da Receita não abriu como esperado.",
        ),
        "preenchimento": (
            "FALHA_PREENCHIMENTO",
            "Um dado da distribuição não foi aceito ou um campo do portal mudou.",
        ),
    }.get(
        etapa,
        (
            "FALHA_TECNICA",
            "O processamento foi interrompido com segurança antes da emissão.",
        ),
    )


async def preencher_formulario_completo(page, tarefa: Tarefa, logger) -> None:
    """
    RF13 passos 4-10 — parte da tela de emissão (já alcançada por
    navegar_ate_emissao) e vai até o fim de Transporte. A emissão continua
    desabilitada por padrão e só é chamada posteriormente quando a flag de
    homologação estiver explícita.
    """
    async def etapa(nome, chamada):
        inicio = perf_counter()
        try:
            return await chamada
        finally:
            logger.info("[%s] Desempenho · %s: %.2fs", tarefa.tarefa_id, nome, perf_counter() - inicio)

    await etapa("consentimento", fluxo_emissao.aceitar_consentimento(page, logger))
    await etapa("emitente", fluxo_emissao.selecionar_emitente(page, tarefa.emitente, logger))
    await etapa("destinatário", fluxo_emissao.preencher_destinatario(page, tarefa.destinatario, logger))
    await etapa("operação", fluxo_emissao.preencher_identificacao_operacao(page, tarefa, logger))
    await etapa("retirada", fluxo_emissao.avancar_local_retirada(page, logger))
    await etapa("produtos", fluxo_emissao.preencher_produtos(page, tarefa, logger))
    await etapa("transporte", fluxo_emissao.preencher_transporte(page, tarefa, logger))


async def executar_emissao_homologacao(page, tarefa: Tarefa, config: Config, logger):
    """Executa emissão de teste após as travas técnicas de homologação."""
    await fluxo_emissao.emitir(
        page,
        tarefa,
        logger,
        ambiente=config.ambiente_emissao,
    )
    try:
        await fluxo_emissao.aguardar_autorizacao(
            page,
            tarefa,
            logger,
            ambiente=config.ambiente_emissao,
        )
    except fluxo_emissao.FalhaConfirmacaoEmissao:
        caminhos = await fluxo_emissao.salvar_diagnostico_resultado(
            page,
            tarefa,
            config.download_dir,
            logger,
        )
        logger.warning(
            "[%s] RESULTADO NÃO AUTORIZADO OU NÃO CONFIRMADO; "
            "%d artefato(s) de diagnóstico protegido(s) foram salvo(s).",
            tarefa.tarefa_id,
            len(caminhos),
        )
        raise
    return await fluxo_emissao.baixar_documentos(
        page,
        tarefa,
        config.download_dir,
        logger,
    )


def preparar_tarefa_para_cliente(
    tarefa: Tarefa | None,
    tarefa_id: str,
    emitente: str | None,
    nome_emitente: str | None = None,
) -> Tarefa | None:
    """Associa o emitente da sessão à tarefa somente quando ela existe.

    O smoke test de autenticação/navegação não carrega ``tarefa_real.json``.
    Portanto, ele não deve exigir ``CLIENTE_X_EMITENTE`` nem tentar alterar
    uma tarefa inexistente. O emitente passa a ser obrigatório somente no
    modo de preenchimento completo, que de fato seleciona esse campo.
    """
    if tarefa is None:
        return None

    if not emitente:
        raise RuntimeError(
            f"[{tarefa_id}] Emitente não configurado para este cliente. "
            "Defina CLIENTE_X_EMITENTE antes do preenchimento completo."
        )

    return replace(
        tarefa,
        emitente=Emitente(valor_select=emitente),
        nome_emitente=nome_emitente or tarefa.nome_emitente,
    )


async def teste_autenticacao(
    tarefa_id: str,
    context: BrowserContext,
    config: Config,
    logger,
    tarefa: Tarefa | None,
) -> None:
    """Valida Context -> Page -> login -> confirmação, sem emitir nota."""

    credencial = carregar_credencial(tarefa_id)
    tarefa_cliente = preparar_tarefa_para_cliente(
        tarefa,
        tarefa_id,
        credencial.emitente,
        credencial.nome_emitente,
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
            await navegar_ate_emissao(
                page,
                logger,
                ambiente=config.ambiente_emissao,
            )
            logger.info("[%s] TESTE DE NAVEGAÇÃO ATÉ EMISSÃO OK", tarefa_id)

            if config.testar_preenchimento_completo:
                if tarefa_cliente is None:
                    raise RuntimeError(
                        f"[{tarefa_id}] TESTAR_PREENCHIMENTO_COMPLETO=true mas nenhuma "
                        "tarefa foi carregada — isso não deveria acontecer (bug em main())."
                    )
                logger.info("[%s] Iniciando preenchimento completo (sem emitir)", tarefa_id)
                await preencher_formulario_completo(page, tarefa_cliente, logger)
                logger.info(
                    "[%s] PREENCHIMENTO COMPLETO OK",
                    tarefa_id,
                )

                if config.testar_emissao_homologacao:
                    logger.warning(
                        "[%s] TESTE CONTROLADO DE EMISSÃO EM HOMOLOGAÇÃO habilitado",
                        tarefa_id,
                    )
                    documentos = await executar_emissao_homologacao(
                        page,
                        tarefa_cliente,
                        config,
                        logger,
                    )
                    if documentos is None:
                        return
                    logger.info(
                        "[%s] EMISSÃO DE HOMOLOGAÇÃO E DOWNLOADS CONCLUÍDOS (%s)",
                        tarefa_id,
                        ", ".join(sorted(documentos)),
                    )
                    return

        # Mantém a página visível brevemente apenas nos testes sem emissão.
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


async def executar_validacao_fila_banco(config: Config, logger) -> int:
    """Reserva e valida tarefas reais sem abrir o navegador nesta primeira etapa.

    Contratos válidos voltam para PENDENTE sem consumir uma tentativa. Somente
    contrato, hash ou credencial incompatíveis vão para conferência: é o ensaio
    seguro do canal entre máquinas, não uma habilitação de emissão automática.
    """
    assert config.worker_database_url and config.worker_id
    limite = config.max_concorrencia or 1
    try:
        async with FontePostgresTarefas(
            config.worker_database_url,
            config.worker_id,
        ) as fonte:
            reservas = await fonte.reservar(limite)

            if not reservas:
                logger.info("Nenhuma tarefa elegível encontrada na fila do banco.")
                return 0

            falhas = 0
            for reserva in reservas:
                contratada = reserva.contratada
                try:
                    # Confirma que a referência sem segredo aponta para uma
                    # credencial disponível somente neste Worker.
                    carregar_credencial(contratada.credencial_referencia)
                    await fonte.devolver_pendente_sem_processar(
                        contratada.tarefa.tarefa_id,
                        reserva.reserva_token,
                    )
                    logger.info(
                        "[%s] Contrato do banco validado; tarefa continua pendente.",
                        contratada.tarefa.tarefa_id,
                    )
                except (FonteTarefasErro, RuntimeError) as exc:
                    logger.error(
                        "[%s] Tarefa reservada requer conferência (%s).",
                        contratada.tarefa.tarefa_id,
                        type(exc).__name__,
                    )
                    falhas += 1
                    try:
                        await fonte.registrar_status(
                            contratada.tarefa.tarefa_id,
                            reserva.reserva_token,
                            "AGUARDANDO_CONFERENCIA",
                            mensagem="Credencial local ausente ou tarefa requer revisão.",
                            codigo_erro="CREDENCIAL_INCOMPLETA",
                        )
                    except FonteTarefasErro:
                        logger.error(
                            "[%s] Não foi possível devolver a tarefa para conferência.",
                            contratada.tarefa.tarefa_id,
                        )
            return int(falhas > 0)
    except FonteTarefasErro as exc:
        logger.error("Integração com banco falhou (%s).", type(exc).__name__)
        return 1


async def _manter_reserva_ativa(
    fonte: FontePostgresTarefas,
    tarefa_id: str,
    reserva_token: str,
    logger,
) -> None:
    """Heartbeat silencioso: uma tela lenta não perde a posse da tarefa."""
    while True:
        await asyncio.sleep(120)
        try:
            await fonte.renovar_reserva(tarefa_id, reserva_token)
        except FonteTarefasErro:
            # Uma indisponibilidade curta não cancela o lease original de 15
            # minutos. A conclusão continua protegida pelo token e falhará
            # fechada se a posse realmente tiver expirado.
            logger.warning(
                "[%s] Não foi possível renovar a reserva nesta tentativa.",
                tarefa_id,
            )


async def _recuperar_uploads_pendentes(
    fonte: FontePostgresTarefas,
    config: Config,
    logger,
) -> bool:
    """Retoma upload confirmado localmente, sem abrir o portal fiscal.

    Qualquer falha mantém o manifesto e impede novas emissões naquele ciclo.
    Isso preserva o documento original e evita que uma indisponibilidade do
    Storage seja compensada, por engano, com outra emissão.
    """

    storage = config.storage_documentos
    if storage is None:
        return True
    manifestos = listar_manifestos_upload_pendente(config.download_dir)
    if not manifestos:
        return True

    logger.warning("Recuperando %d upload(s) fiscal(is) pendente(s).", len(manifestos))
    for caminho in manifestos:
        try:
            manifesto = carregar_manifesto_upload_pendente(config.download_dir, caminho)
            caminhos_remotos = await armazenar_documentos(
                storage,
                manifesto.tarefa_id,
                manifesto.documentos,
                logger,
            )
            await fonte.registrar_documentos_armazenados(
                manifesto.tarefa_id,
                manifesto.reserva_token,
                pdf_path=caminhos_remotos["pdf_path"],
                xml_path=caminhos_remotos["xml_path"],
                retencao_dias=storage.retencao_dias,
            )
            remover_manifesto_upload_pendente(manifesto)
            logger.info("[%s] Upload pendente recuperado com sucesso.", manifesto.tarefa_id)
        except Exception as exc:  # noqa: BLE001 - não expor caminho ou documento
            logger.error(
                "Não foi possível recuperar um upload pendente (%s).",
                type(exc).__name__,
            )
            return False
    return True


async def _limpar_documentos_expirados(
    fonte: FontePostgresTarefas,
    config: Config,
    logger,
) -> None:
    """Remove binários vencidos sem afetar emissão, nota ou histórico.

    A rotina é opcional. Falhas são registradas e deixam o banco intacto para
    nova tentativa posterior; não bloqueiam uma emissão fiscal válida.
    """

    if not getattr(config, "limpar_documentos_expirados", False):
        return
    storage = config.storage_documentos
    if storage is None:
        return
    try:
        documentos = await fonte.reservar_documentos_expirados()
    except FonteTarefasErro as exc:
        logger.error("Não foi possível localizar documentos vencidos (%s).", type(exc).__name__)
        return
    for documento in documentos:
        try:
            await remover_documentos_expirados(
                storage,
                documento.tarefa_id,
                pdf_path=documento.pdf_path,
                xml_path=documento.xml_path,
            )
            await fonte.concluir_limpeza_documentos(documento)
            logger.info("[%s] Documentos vencidos removidos do Storage.", documento.tarefa_id)
        except Exception as exc:  # noqa: BLE001 - erro sanitizado, preserva a referência
            logger.error(
                "[%s] Limpeza de documentos adiada (%s).",
                documento.tarefa_id,
                type(exc).__name__,
            )
            try:
                await fonte.liberar_limpeza_documentos(documento)
            except FonteTarefasErro:
                logger.error("[%s] Reserva de limpeza será liberada pelo lease.", documento.tarefa_id)


async def executar_fila_banco_homologacao(
    config: Config,
    logger,
    *,
    silencioso_sem_tarefas: bool = False,
) -> int:
    """Processa até três tarefas do banco, exclusivamente em homologação.

    O token de reserva acompanha todas as mudanças de estado. Falhas depois
    de entrar em EMITINDO nunca voltam automaticamente à fila, pois o clique
    pode ter chegado à Receita mesmo quando a resposta não voltou ao Worker.
    """
    assert config.worker_database_url and config.worker_id
    limite = min(config.max_concorrencia or 1, 3)

    try:
        async with FontePostgresTarefas(
            config.worker_database_url,
            config.worker_id,
        ) as fonte:
            await _limpar_documentos_expirados(fonte, config, logger)
            if not await _recuperar_uploads_pendentes(fonte, config, logger):
                logger.error("Fila fiscal adiada até recuperar os documentos pendentes.")
                return 1
            reservas = await fonte.reservar(limite)
            if not reservas:
                if not silencioso_sem_tarefas:
                    logger.info("Nenhuma tarefa elegível encontrada na fila do banco.")
                return 0

            por_id = {}
            credenciais = {}
            falhas_preparacao = 0
            for reserva in reservas:
                tarefa_id = reserva.contratada.tarefa.tarefa_id
                try:
                    credenciais[tarefa_id] = _validar_preparacao_reserva(
                        reserva,
                        config,
                    )
                    por_id[tarefa_id] = reserva
                except FalhaPreparacaoTarefa as exc:
                    falhas_preparacao += 1
                    await fonte.registrar_status(
                        tarefa_id,
                        reserva.reserva_token,
                        "ERRO",
                        mensagem=exc.mensagem_usuario,
                        codigo_erro=exc.codigo,
                    )
                    logger.error(
                        "[%s] Preparação bloqueada antes de abrir o navegador (%s).",
                        tarefa_id,
                        exc.codigo,
                    )

            if not por_id:
                return int(falhas_preparacao > 0)

            async def processar_reserva(
                tarefa_id: str,
                context: BrowserContext,
            ) -> None:
                reserva = por_id[tarefa_id]
                contratada = reserva.contratada
                entrou_em_emissao = False
                autorizacao_registrada = False
                etapa = "preparacao"
                page = None
                heartbeat = asyncio.create_task(
                    _manter_reserva_ativa(
                        fonte,
                        tarefa_id,
                        reserva.reserva_token,
                        logger,
                    )
                )
                try:
                    credencial = credenciais[tarefa_id]
                    page = await context.new_page()
                    etapa = "autenticacao"
                    await realizar_login(
                        page,
                        config.sistema_fiscal_url,
                        credencial,
                        logger,
                    )
                    etapa = "navegacao"
                    await navegar_ate_emissao(page, logger, ambiente="teste")
                    etapa = "preenchimento"
                    await preencher_formulario_completo(
                        page,
                        contratada.tarefa,
                        logger,
                    )
                    await fonte.registrar_status(
                        tarefa_id,
                        reserva.reserva_token,
                        "EMITINDO",
                        mensagem="Formulário conferido; emissão em homologação iniciada.",
                    )
                    entrou_em_emissao = True
                    etapa = "emissao"
                    documentos = await executar_emissao_homologacao(
                        page,
                        contratada.tarefa,
                        config,
                        logger,
                    )
                    if not documentos:
                        raise RuntimeError("Documentos fiscais não foram baixados.")
                    storage = config.storage_documentos
                    manifesto = None
                    if storage is not None:
                        manifesto = criar_manifesto_upload_pendente(
                            config.download_dir,
                            tarefa_id,
                            reserva.reserva_token,
                            documentos,
                        )
                    metadados = fluxo_emissao.extrair_metadados_xml(
                        documentos["xml_path"]
                    )
                    await fonte.registrar_emissao_autorizada(
                        tarefa_id,
                        reserva.reserva_token,
                        chave_acesso=metadados.chave_acesso,
                        numero=metadados.numero,
                        protocolo=metadados.protocolo,
                    )
                    autorizacao_registrada = True
                    if storage is None:
                        logger.info(
                            "[%s] Autorização registrada no banco; documentos locais protegidos.",
                            tarefa_id,
                        )
                    else:
                        etapa = "armazenamento"
                        caminhos_remotos = await armazenar_documentos(
                            storage,
                            tarefa_id,
                            documentos,
                            logger,
                        )
                        await fonte.registrar_documentos_armazenados(
                            tarefa_id,
                            reserva.reserva_token,
                            pdf_path=caminhos_remotos["pdf_path"],
                            xml_path=caminhos_remotos["xml_path"],
                            retencao_dias=storage.retencao_dias,
                        )
                        assert manifesto is not None
                        remover_manifesto_upload_pendente(manifesto)
                        logger.info(
                            "[%s] Documentos privados associados à nota autorizada.",
                            tarefa_id,
                        )
                except Exception as exc:
                    if autorizacao_registrada:
                        logger.error(
                            "[%s] Nota autorizada, mas os documentos ainda não foram "
                            "confirmados no Storage (%s). Não reemitir a nota.",
                            tarefa_id,
                            type(exc).__name__,
                        )
                        raise RuntimeError(
                            "Nota autorizada; armazenamento pendente."
                        ) from None
                    destino = (
                        "AGUARDANDO_CONFERENCIA" if entrou_em_emissao else "ERRO"
                    )
                    if (
                        getattr(config, "inspecionar", False)
                        and not entrou_em_emissao
                        and page is not None
                    ):
                        try:
                            caminhos = await fluxo_emissao.salvar_diagnostico_resultado(
                                page,
                                contratada.tarefa,
                                config.download_dir,
                                logger,
                            )
                            logger.warning(
                                "[%s] Diagnóstico privado pré-emissão salvo (%d artefato(s)); "
                                "a pasta é ignorada pelo Git.",
                                tarefa_id,
                                len(caminhos),
                            )
                        except Exception as diagnostico_exc:  # noqa: BLE001
                            logger.error(
                                "[%s] Diagnóstico privado não pôde ser salvo (%s).",
                                tarefa_id,
                                type(diagnostico_exc).__name__,
                            )
                    if entrou_em_emissao:
                        codigo_erro = "RESULTADO_FISCAL_INCERTO"
                        mensagem = "Resultado fiscal incerto; confira a Receita antes de qualquer nova tentativa."
                    else:
                        codigo_erro, mensagem = _diagnostico_falha_pre_emissao(
                            etapa,
                            exc,
                        )
                    try:
                        await fonte.registrar_status(
                            tarefa_id,
                            reserva.reserva_token,
                            destino,
                            mensagem=mensagem,
                            codigo_erro=codigo_erro,
                        )
                    except FonteTarefasErro:
                        logger.error(
                            "[%s] Falha também ao registrar o estado seguro da tarefa.",
                            tarefa_id,
                        )
                    raise RuntimeError(
                        f"Processamento fiscal interrompido ({type(exc).__name__})."
                    ) from None
                finally:
                    heartbeat.cancel()
                    with suppress(asyncio.CancelledError):
                        await heartbeat
                    if page is not None:
                        try:
                            await page.close()
                        except Exception:
                            logger.warning(
                                "[%s] A página não fechou normalmente; o contexto será encerrado.",
                                tarefa_id,
                            )

            resultados = await processar_tarefas_em_paralelo_async(
                tarefas_ids=list(por_id),
                processar_tarefa=processar_reserva,
                logger=logger,
                headless=config.headless,
                max_concorrencia=limite,
            )
            return int(
                falhas_preparacao > 0
                or any(not resultado.sucesso for resultado in resultados)
            )
    except FonteTarefasErro as exc:
        logger.error("Integração com banco falhou (%s).", type(exc).__name__)
        return 1


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

    if config.fonte_tarefas == "banco":
        if config.processar_fila_banco:
            logger.warning(
                "FONTE_TAREFAS=banco — processando fila exclusivamente em homologação"
            )
            return asyncio.run(executar_fila_banco_homologacao(config, logger))
        logger.info(
            "FONTE_TAREFAS=banco — validando contratos sem abrir o navegador"
        )
        return asyncio.run(executar_validacao_fila_banco(config, logger))

    tarefa: Tarefa | None = None
    if config.testar_preenchimento_completo:
        logger.info("TESTAR_PREENCHIMENTO_COMPLETO=true — carregando %s", tarefa_path)
        tarefa = fluxo_emissao.carregar_tarefa_de_json(tarefa_path)

    logger.info("SMOKE_TEST=true — testando Async Playwright + autenticação")
    return executar_smoke_test(config, logger, tarefa)


if __name__ == "__main__":
    sys.exit(main())
