"""Testes puros para a separação entre smoke test e preenchimento fiscal."""

import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from main import (
    _diagnostico_falha_pre_emissao,
    _limpar_documentos_expirados,
    _recuperar_uploads_pendentes,
    executar_emissao_homologacao,
    executar_fila_banco_homologacao,
    executar_validacao_fila_banco,
    preparar_tarefa_para_cliente,
    teste_autenticacao as _teste_autenticacao,
)
from src.flows.emissao import (
    AcessoPortalNegado,
    Destinatario,
    Emitente,
    FalhaConfirmacaoEmissao,
    Tarefa,
)


def test_diagnostico_especifico_quando_portal_nega_modulo():
    assert _diagnostico_falha_pre_emissao(
        "preenchimento",
        AcessoPortalNegado("negado"),
    ) == (
        "ACESSO_PORTAL_NEGADO",
        "A Receita negou acesso ao módulo seguinte antes da emissão.",
    )


def _tarefa_de_teste() -> Tarefa:
    return Tarefa(
        tarefa_id="tarefa-de-teste",
        cliente_id="cliente-de-teste",
        emitente=Emitente(valor_select="emitente-original"),
        destinatario=Destinatario(
            cnpj="00000000000000",
            indicador_ie="NAO_CONTRIBUINTE",
            razao_social="Destinatário de teste",
            cep="00000000",
            numero_endereco="1",
        ),
    )


def _config_banco() -> SimpleNamespace:
    return SimpleNamespace(
        worker_database_url="postgresql://worker@db.invalid/fiscal?sslmode=require",
        worker_id="worker-teste",
        max_concorrencia=1,
        ambiente_emissao="teste",
        sistema_fiscal_url="https://receita.pr.gov.br/login",
        headless=False,
        download_dir="downloads",
        storage_documentos=None,
    )


def _reserva_banco() -> SimpleNamespace:
    return SimpleNamespace(
        reserva_token="22222222-2222-4222-8222-222222222222",
        contratada=SimpleNamespace(
            ambiente="teste",
            credencial_referencia="CLIENTE_A",
            tarefa=_tarefa_de_teste(),
        ),
    )


class _FonteBancoFake:
    def __init__(self, reservas: list[SimpleNamespace]) -> None:
        self.reservar = AsyncMock(return_value=reservas)
        self.devolver_pendente_sem_processar = AsyncMock()
        self.registrar_status = AsyncMock()
        self.registrar_emissao_autorizada = AsyncMock()
        self.registrar_documentos_armazenados = AsyncMock()
        self.renovar_reserva = AsyncMock()
        self.reservar_documentos_expirados = AsyncMock(return_value=[])
        self.concluir_limpeza_documentos = AsyncMock()
        self.liberar_limpeza_documentos = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, _tipo, _valor, _traceback) -> None:
        return None


async def _orquestrador_sem_browser(
    *,
    tarefas_ids,
    processar_tarefa,
    **_kwargs,
):
    pagina = SimpleNamespace(close=AsyncMock())
    contexto = SimpleNamespace(new_page=AsyncMock(return_value=pagina))
    resultados = []
    for tarefa_id in tarefas_ids:
        try:
            await processar_tarefa(tarefa_id, contexto)
            resultados.append(SimpleNamespace(sucesso=True))
        except Exception:
            resultados.append(SimpleNamespace(sucesso=False))
    return resultados


def test_smoke_test_sem_tarefa_nao_exige_emitente():
    assert preparar_tarefa_para_cliente(None, "CLIENTE_A", None) is None


def test_consulta_do_ultimo_xml_pesquisa_sem_logar_chave_e_pausa():
    chave = "1" * 44
    pagina = SimpleNamespace(pause=AsyncMock(), close=AsyncMock())
    contexto = SimpleNamespace(new_page=AsyncMock(return_value=pagina))
    config = SimpleNamespace(
        sistema_fiscal_url="https://receita.pr.gov.br/login",
        testar_navegacao_consulta=True,
        consultar_ultimo_xml=True,
        pausar_apos_consulta=True,
        download_dir="downloads",
        testar_navegacao_emissao=False,
        headless=False,
    )
    credencial = SimpleNamespace(
        emitente="emitente-original",
        nome_emitente="Emitente original",
    )
    logger = logging.getLogger("teste-consulta-ultimo-xml")

    with (
        patch("main.carregar_credencial", return_value=credencial),
        patch("main.realizar_login", new_callable=AsyncMock),
        patch("main.navegar_ate_consulta_teste", new_callable=AsyncMock),
        patch("main.selecionar_emitente_consulta", new_callable=AsyncMock),
        patch(
            "main.localizar_xml_autorizado_mais_recente",
            return_value="downloads/nota.xml",
        ),
        patch(
            "main.fluxo_emissao.extrair_metadados_xml",
            return_value=SimpleNamespace(chave_acesso=chave),
        ),
        patch("main.pesquisar_nota_por_chave", new_callable=AsyncMock) as pesquisar,
    ):
        asyncio.run(
            _teste_autenticacao("CLIENTE_A", contexto, config, logger, None)
        )

    pesquisar.assert_awaited_once_with(pagina, chave, logger)
    pagina.pause.assert_awaited_once()
    pagina.close.assert_awaited_once()


def test_emissao_local_pausa_somente_depois_dos_downloads():
    pagina = SimpleNamespace(pause=AsyncMock(), close=AsyncMock())
    contexto = SimpleNamespace(new_page=AsyncMock(return_value=pagina))
    config = SimpleNamespace(
        sistema_fiscal_url="https://receita.pr.gov.br/login",
        testar_navegacao_consulta=False,
        testar_navegacao_emissao=True,
        testar_preenchimento_completo=True,
        testar_emissao_homologacao=True,
        pausar_antes_emitir=False,
        pausar_apos_downloads=True,
        ambiente_emissao="teste",
        headless=False,
    )
    credencial = SimpleNamespace(
        emitente="emitente-original",
        nome_emitente="Emitente original",
    )
    logger = logging.getLogger("teste-pausa-downloads")

    with (
        patch("main.carregar_credencial", return_value=credencial),
        patch("main.realizar_login", new_callable=AsyncMock),
        patch("main.navegar_ate_emissao", new_callable=AsyncMock),
        patch("main.preencher_formulario_completo", new_callable=AsyncMock),
        patch(
            "main.executar_emissao_homologacao",
            new_callable=AsyncMock,
            return_value={"xml_path": "nota.xml", "pdf_path": "danfe.pdf"},
        ) as emitir,
    ):
        asyncio.run(
            _teste_autenticacao(
                "CLIENTE_A", contexto, config, logger, _tarefa_de_teste()
            )
        )

    emitir.assert_awaited_once()
    pagina.pause.assert_awaited_once()
    pagina.close.assert_awaited_once()


def test_fila_persistente_nao_repete_log_quando_esta_ociosa(caplog):
    fonte = _FonteBancoFake([])
    logger = logging.getLogger("teste-fila-ociosa")

    with patch("main.FontePostgresTarefas", return_value=fonte):
        with caplog.at_level(logging.INFO, logger=logger.name):
            resultado = asyncio.run(
                executar_fila_banco_homologacao(
                    _config_banco(),
                    logger,
                    silencioso_sem_tarefas=True,
                )
            )

    assert resultado == 0
    assert "Nenhuma tarefa elegível" not in caplog.text


def test_recuperacao_de_upload_associa_documentos_sem_abrir_portal():
    fonte = _FonteBancoFake([])
    tarefa_id = "11111111-1111-4111-8111-111111111111"
    manifesto = SimpleNamespace(
        tarefa_id=tarefa_id,
        reserva_token="22222222-2222-4222-8222-222222222222",
        documentos={"xml_path": "nota.xml", "pdf_path": "danfe.pdf"},
    )
    config = _config_banco()
    config.storage_documentos = SimpleNamespace(retencao_dias=365)

    with (
        patch("main.listar_manifestos_upload_pendente", return_value=(object(),)),
        patch("main.carregar_manifesto_upload_pendente", return_value=manifesto),
        patch(
            "main.armazenar_documentos",
            new_callable=AsyncMock,
            return_value={
                "xml_path": f"notas/{tarefa_id}/xml-{'a' * 64}.xml",
                "pdf_path": f"notas/{tarefa_id}/danfe-{'b' * 64}.pdf",
            },
        ),
        patch("main.remover_manifesto_upload_pendente") as remover_manifesto,
    ):
        resultado = asyncio.run(
            _recuperar_uploads_pendentes(fonte, config, logging.getLogger("teste-recuperacao"))
        )

    assert resultado is True
    fonte.registrar_documentos_armazenados.assert_awaited_once()
    remover_manifesto.assert_called_once_with(manifesto)


def test_recuperacao_com_falha_nao_remove_manifesto_nem_processa_novas_notas():
    fonte = _FonteBancoFake([])
    config = _config_banco()
    config.storage_documentos = SimpleNamespace(retencao_dias=365)

    with (
        patch("main.listar_manifestos_upload_pendente", return_value=(object(),)),
        patch("main.carregar_manifesto_upload_pendente", side_effect=RuntimeError("arquivo inválido")),
        patch("main.remover_manifesto_upload_pendente") as remover_manifesto,
    ):
        resultado = asyncio.run(
            _recuperar_uploads_pendentes(fonte, config, logging.getLogger("teste-recuperacao"))
        )

    assert resultado is False
    fonte.registrar_documentos_armazenados.assert_not_awaited()
    remover_manifesto.assert_not_called()


def test_limpeza_remota_so_limpa_referencia_apos_storage_confirmar():
    fonte = _FonteBancoFake([])
    documento = SimpleNamespace(
        tarefa_id="11111111-1111-4111-8111-111111111111",
        pdf_path="pdf",
        xml_path="xml",
    )
    fonte.reservar_documentos_expirados.return_value = [documento]
    config = _config_banco()
    config.limpar_documentos_expirados = True
    config.storage_documentos = SimpleNamespace()

    with patch("main.remover_documentos_expirados", new_callable=AsyncMock):
        asyncio.run(_limpar_documentos_expirados(fonte, config, logging.getLogger("teste-limpeza")))

    fonte.concluir_limpeza_documentos.assert_awaited_once_with(documento)
    fonte.liberar_limpeza_documentos.assert_not_awaited()


def test_limpeza_com_falha_libera_reserva_sem_apagar_referencia():
    fonte = _FonteBancoFake([])
    documento = SimpleNamespace(tarefa_id="11111111-1111-4111-8111-111111111111")
    fonte.reservar_documentos_expirados.return_value = [documento]
    config = _config_banco()
    config.limpar_documentos_expirados = True
    config.storage_documentos = SimpleNamespace()

    with patch("main.remover_documentos_expirados", new_callable=AsyncMock, side_effect=RuntimeError):
        asyncio.run(_limpar_documentos_expirados(fonte, config, logging.getLogger("teste-limpeza")))

    fonte.concluir_limpeza_documentos.assert_not_awaited()
    fonte.liberar_limpeza_documentos.assert_awaited_once_with(documento)


def test_preenchimento_completo_exige_emitente():
    tarefa = _tarefa_de_teste()

    with pytest.raises(RuntimeError, match="CLIENTE_X_EMITENTE"):
        preparar_tarefa_para_cliente(tarefa, "CLIENTE_A", None)


def test_preenchimento_substitui_emitente_pela_sessao_do_cliente():
    tarefa = _tarefa_de_teste()

    tarefa_cliente = preparar_tarefa_para_cliente(
        tarefa,
        "CLIENTE_A",
        "emitente-da-sessao",
        "Emissor da Sessão",
    )

    assert tarefa_cliente is not None
    assert tarefa_cliente.emitente.valor_select == "emitente-da-sessao"
    assert tarefa_cliente.nome_emitente == "Emissor da Sessão"
    assert tarefa.emitente.valor_select == "emitente-original"


def test_emissao_controlada_encadeia_emitir_e_downloads():
    tarefa = _tarefa_de_teste()
    config = SimpleNamespace(ambiente_emissao="teste", download_dir="downloads")
    logger = logging.getLogger("teste-main-emissao")

    with (
        patch("main.fluxo_emissao.emitir", new_callable=AsyncMock) as emitir_mock,
        patch(
            "main.fluxo_emissao.aguardar_autorizacao", new_callable=AsyncMock
        ) as autorizacao_mock,
        patch(
            "main.fluxo_emissao.baixar_documentos",
            new_callable=AsyncMock,
            return_value={"xml_path": "x.xml", "pdf_path": "x.pdf"},
        ) as baixar_mock,
    ):
        resultado = asyncio.run(
            executar_emissao_homologacao(object(), tarefa, config, logger)
        )

    assert resultado == {"xml_path": "x.xml", "pdf_path": "x.pdf"}
    emitir_mock.assert_awaited_once()
    assert emitir_mock.await_args.kwargs["ambiente"] == "teste"
    autorizacao_mock.assert_awaited_once()
    assert autorizacao_mock.await_args.kwargs["ambiente"] == "teste"
    baixar_mock.assert_awaited_once()

    assert (
        emitir_mock.await_count
        == autorizacao_mock.await_count
        == baixar_mock.await_count
        == 1
    )


def test_emissao_sem_autorizacao_confirmada_nao_baixa():
    tarefa = _tarefa_de_teste()
    config = SimpleNamespace(ambiente_emissao="teste", download_dir="downloads")
    logger = logging.getLogger("teste-main-sem-autorizacao")

    with (
        patch("main.fluxo_emissao.emitir", new_callable=AsyncMock),
        patch(
            "main.fluxo_emissao.aguardar_autorizacao",
            new_callable=AsyncMock,
            side_effect=FalhaConfirmacaoEmissao("status não confirmado"),
        ),
        patch(
            "main.fluxo_emissao.salvar_diagnostico_resultado",
            new_callable=AsyncMock,
            return_value=("resultado.html", "resultado.png"),
        ) as diagnostico_mock,
        patch(
            "main.fluxo_emissao.baixar_documentos", new_callable=AsyncMock
        ) as baixar_mock,
    ):
        with pytest.raises(FalhaConfirmacaoEmissao, match="status não confirmado"):
            asyncio.run(
                executar_emissao_homologacao(object(), tarefa, config, logger)
            )

    baixar_mock.assert_not_awaited()
    diagnostico_mock.assert_awaited_once()


def test_validacao_banco_devolve_contrato_valido_sem_consumir_tentativa():
    reserva = _reserva_banco()
    fonte = _FonteBancoFake([reserva])
    logger = logging.getLogger("teste-validacao-banco")

    with (
        patch("main.FontePostgresTarefas", return_value=fonte),
        patch("main.carregar_credencial", return_value=SimpleNamespace()),
    ):
        resultado = asyncio.run(executar_validacao_fila_banco(_config_banco(), logger))

    assert resultado == 0
    fonte.devolver_pendente_sem_processar.assert_awaited_once_with(
        reserva.contratada.tarefa.tarefa_id,
        reserva.reserva_token,
    )
    fonte.registrar_status.assert_not_awaited()


def test_validacao_banco_isola_credencial_ausente_para_conferencia():
    reserva = _reserva_banco()
    fonte = _FonteBancoFake([reserva])
    logger = logging.getLogger("teste-validacao-credencial-ausente")

    with (
        patch("main.FontePostgresTarefas", return_value=fonte),
        patch("main.carregar_credencial", side_effect=RuntimeError("ausente")),
    ):
        resultado = asyncio.run(executar_validacao_fila_banco(_config_banco(), logger))

    assert resultado == 1
    fonte.devolver_pendente_sem_processar.assert_not_awaited()
    fonte.registrar_status.assert_awaited_once_with(
        reserva.contratada.tarefa.tarefa_id,
        reserva.reserva_token,
        "AGUARDANDO_CONFERENCIA",
        mensagem="Credencial local ausente ou tarefa requer revisão.",
        codigo_erro="CREDENCIAL_INCOMPLETA",
    )


def test_fila_banco_falha_antes_de_emitir_vai_para_erro():
    reserva = _reserva_banco()
    fonte = _FonteBancoFake([reserva])
    logger = logging.getLogger("teste-fila-falha-antes-emissao")
    credencial = SimpleNamespace(
        identidade_esperada="Emitente esperado",
        emitente="emitente-original",
    )

    with (
        patch("main.FontePostgresTarefas", return_value=fonte),
        patch("main.carregar_credencial", return_value=credencial),
        patch("main._manter_reserva_ativa", new_callable=AsyncMock),
        patch("main.realizar_login", new_callable=AsyncMock, side_effect=RuntimeError("portal")),
        patch(
            "main.processar_tarefas_em_paralelo_async",
            side_effect=_orquestrador_sem_browser,
        ),
    ):
        resultado = asyncio.run(executar_fila_banco_homologacao(_config_banco(), logger))

    assert resultado == 1
    fonte.registrar_status.assert_awaited_once_with(
        reserva.contratada.tarefa.tarefa_id,
        reserva.reserva_token,
        "ERRO",
        mensagem="A Receita não confirmou o acesso do emitente.",
        codigo_erro="FALHA_AUTENTICACAO",
    )


def test_fila_banco_falha_depois_de_emitindo_exige_conferencia():
    reserva = _reserva_banco()
    fonte = _FonteBancoFake([reserva])
    logger = logging.getLogger("teste-fila-resultado-incerto")
    credencial = SimpleNamespace(
        identidade_esperada="Emitente esperado",
        emitente="emitente-original",
    )

    with (
        patch("main.FontePostgresTarefas", return_value=fonte),
        patch("main.carregar_credencial", return_value=credencial),
        patch("main._manter_reserva_ativa", new_callable=AsyncMock),
        patch("main.realizar_login", new_callable=AsyncMock),
        patch("main.navegar_ate_emissao", new_callable=AsyncMock),
        patch("main.preencher_formulario_completo", new_callable=AsyncMock),
        patch(
            "main.executar_emissao_homologacao",
            new_callable=AsyncMock,
            side_effect=RuntimeError("resposta interrompida"),
        ),
        patch(
            "main.processar_tarefas_em_paralelo_async",
            side_effect=_orquestrador_sem_browser,
        ),
    ):
        resultado = asyncio.run(executar_fila_banco_homologacao(_config_banco(), logger))

    assert resultado == 1
    assert fonte.registrar_status.await_count == 2
    assert fonte.registrar_status.await_args_list[0].args[2] == "EMITINDO"
    assert fonte.registrar_status.await_args_list[1].args[2] == "AGUARDANDO_CONFERENCIA"
    assert fonte.registrar_status.await_args_list[1].kwargs == {
        "mensagem": (
            "Resultado fiscal incerto; confira a Receita antes de qualquer nova tentativa."
        ),
        "codigo_erro": "RESULTADO_FISCAL_INCERTO",
    }
    fonte.registrar_emissao_autorizada.assert_not_awaited()


def test_fila_banco_bloqueia_emitente_divergente_antes_do_navegador():
    reserva = _reserva_banco()
    fonte = _FonteBancoFake([reserva])
    logger = logging.getLogger("teste-fila-emitente-divergente")
    credencial = SimpleNamespace(
        identidade_esperada="Emitente esperado",
        emitente="outro-emitente",
    )

    with (
        patch("main.FontePostgresTarefas", return_value=fonte),
        patch("main.carregar_credencial", return_value=credencial),
        patch(
            "main.processar_tarefas_em_paralelo_async",
            new_callable=AsyncMock,
        ) as orquestrador,
    ):
        resultado = asyncio.run(
            executar_fila_banco_homologacao(_config_banco(), logger)
        )

    assert resultado == 1
    orquestrador.assert_not_awaited()
    fonte.registrar_status.assert_awaited_once_with(
        reserva.contratada.tarefa.tarefa_id,
        reserva.reserva_token,
        "ERRO",
        mensagem=(
            "O identificador NFP-e desta distribuição não corresponde à "
            "configuração segura do emitente."
        ),
        codigo_erro="EMITENTE_DIVERGENTE",
    )


def test_fila_banco_autorizada_registra_metadados_com_token_da_reserva():
    reserva = _reserva_banco()
    fonte = _FonteBancoFake([reserva])
    logger = logging.getLogger("teste-fila-autorizada")
    credencial = SimpleNamespace(
        identidade_esperada="Emitente esperado",
        emitente="emitente-original",
    )
    metadados = SimpleNamespace(
        chave_acesso="1" * 44,
        numero="123",
        protocolo="456789",
    )

    with (
        patch("main.FontePostgresTarefas", return_value=fonte),
        patch("main.carregar_credencial", return_value=credencial),
        patch("main._manter_reserva_ativa", new_callable=AsyncMock),
        patch("main.realizar_login", new_callable=AsyncMock),
        patch("main.navegar_ate_emissao", new_callable=AsyncMock),
        patch("main.preencher_formulario_completo", new_callable=AsyncMock),
        patch(
            "main.executar_emissao_homologacao",
            new_callable=AsyncMock,
            return_value={"xml_path": "nota.xml", "pdf_path": "danfe.pdf"},
        ),
        patch("main.fluxo_emissao.extrair_metadados_xml", return_value=metadados),
        patch(
            "main.processar_tarefas_em_paralelo_async",
            side_effect=_orquestrador_sem_browser,
        ),
    ):
        resultado = asyncio.run(executar_fila_banco_homologacao(_config_banco(), logger))

    assert resultado == 0
    fonte.registrar_status.assert_awaited_once_with(
        reserva.contratada.tarefa.tarefa_id,
        reserva.reserva_token,
        "EMITINDO",
        mensagem="Formulário conferido; emissão em homologação iniciada.",
    )
    fonte.registrar_emissao_autorizada.assert_awaited_once_with(
        reserva.contratada.tarefa.tarefa_id,
        reserva.reserva_token,
        chave_acesso=metadados.chave_acesso,
        numero=metadados.numero,
        protocolo=metadados.protocolo,
    )
    fonte.registrar_documentos_armazenados.assert_not_awaited()


def test_fila_banco_com_storage_associa_documentos_sem_reemitir():
    reserva = _reserva_banco()
    fonte = _FonteBancoFake([reserva])
    logger = logging.getLogger("teste-fila-storage")
    credencial = SimpleNamespace(
        identidade_esperada="Emitente esperado",
        emitente="emitente-original",
    )
    metadados = SimpleNamespace(
        chave_acesso="1" * 44,
        numero="123",
        protocolo="456789",
    )
    storage = SimpleNamespace(retencao_dias=365)
    manifesto = SimpleNamespace()
    config = _config_banco()
    config.storage_documentos = storage

    with (
        patch("main.FontePostgresTarefas", return_value=fonte),
        patch("main.carregar_credencial", return_value=credencial),
        patch("main._manter_reserva_ativa", new_callable=AsyncMock),
        patch("main.realizar_login", new_callable=AsyncMock),
        patch("main.navegar_ate_emissao", new_callable=AsyncMock),
        patch("main.preencher_formulario_completo", new_callable=AsyncMock),
        patch(
            "main.executar_emissao_homologacao",
            new_callable=AsyncMock,
            return_value={"xml_path": "nota.xml", "pdf_path": "danfe.pdf"},
        ),
        patch("main.fluxo_emissao.extrair_metadados_xml", return_value=metadados),
        patch(
            "main.armazenar_documentos",
            new_callable=AsyncMock,
            return_value={
                "xml_path": f"notas/{reserva.contratada.tarefa.tarefa_id}/xml-{'a' * 64}.xml",
                "pdf_path": f"notas/{reserva.contratada.tarefa.tarefa_id}/danfe-{'b' * 64}.pdf",
            },
        ),
        patch("main.listar_manifestos_upload_pendente", return_value=()),
        patch("main.criar_manifesto_upload_pendente", return_value=manifesto) as criar_manifesto,
        patch("main.remover_manifesto_upload_pendente") as remover_manifesto,
        patch(
            "main.processar_tarefas_em_paralelo_async",
            side_effect=_orquestrador_sem_browser,
        ),
    ):
        resultado = asyncio.run(executar_fila_banco_homologacao(config, logger))

    assert resultado == 0
    fonte.registrar_emissao_autorizada.assert_awaited_once()
    fonte.registrar_documentos_armazenados.assert_awaited_once_with(
        reserva.contratada.tarefa.tarefa_id,
        reserva.reserva_token,
        pdf_path=f"notas/{reserva.contratada.tarefa.tarefa_id}/danfe-{'b' * 64}.pdf",
        xml_path=f"notas/{reserva.contratada.tarefa.tarefa_id}/xml-{'a' * 64}.xml",
        retencao_dias=365,
    )
    criar_manifesto.assert_called_once()
    remover_manifesto.assert_called_once_with(manifesto)
