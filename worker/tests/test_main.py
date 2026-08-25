"""Testes puros para a separação entre smoke test e preenchimento fiscal."""

import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from main import executar_emissao_homologacao, preparar_tarefa_para_cliente
from src.flows.emissao import Destinatario, Emitente, Tarefa


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


def test_smoke_test_sem_tarefa_nao_exige_emitente():
    assert preparar_tarefa_para_cliente(None, "CLIENTE_A", None) is None


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
    )

    assert tarefa_cliente is not None
    assert tarefa_cliente.emitente.valor_select == "emitente-da-sessao"
    assert tarefa.emitente.valor_select == "emitente-original"


def test_emissao_controlada_encadeia_emitir_e_downloads():
    tarefa = _tarefa_de_teste()
    config = SimpleNamespace(ambiente_emissao="teste", download_dir="downloads")
    logger = logging.getLogger("teste-main-emissao")

    with (
        patch("main.fluxo_emissao.validar_antes_de_emitir", return_value=True),
        patch("main.fluxo_emissao.emitir", new_callable=AsyncMock) as emitir_mock,
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
    baixar_mock.assert_awaited_once()


def test_emissao_cancelada_na_conferencia_nao_clica_nem_baixa():
    tarefa = _tarefa_de_teste()
    config = SimpleNamespace(ambiente_emissao="teste", download_dir="downloads")
    logger = logging.getLogger("teste-main-cancelamento")

    with (
        patch("main.fluxo_emissao.validar_antes_de_emitir", return_value=False),
        patch("main.fluxo_emissao.emitir", new_callable=AsyncMock) as emitir_mock,
        patch("main.fluxo_emissao.baixar_documentos", new_callable=AsyncMock) as baixar_mock,
    ):
        resultado = asyncio.run(
            executar_emissao_homologacao(object(), tarefa, config, logger)
        )

    assert resultado is None
    emitir_mock.assert_not_awaited()
    baixar_mock.assert_not_awaited()
