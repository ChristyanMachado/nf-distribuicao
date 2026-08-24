"""Testes puros para a separação entre smoke test e preenchimento fiscal."""

import pytest

from main import preparar_tarefa_para_cliente
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
