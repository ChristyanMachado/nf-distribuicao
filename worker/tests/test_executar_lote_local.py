from uuid import uuid4

import pytest

from scripts.executar_lote_local import validar_selecao


def test_selecao_exata_pendente():
    lote, tarefa = uuid4(), uuid4()
    validar_selecao([dict(id=tarefa, lote_id=lote, status="PENDENTE", tentativas=0)], {tarefa}, lote)


@pytest.mark.parametrize("campo,valor", [("lote_id", uuid4()), ("status", "PROCESSANDO"), ("tentativas", 1)])
def test_selecao_alterada_bloqueia(campo, valor):
    lote, tarefa = uuid4(), uuid4()
    linha = dict(id=tarefa, lote_id=lote, status="PENDENTE", tentativas=0)
    linha[campo] = valor
    with pytest.raises(RuntimeError):
        validar_selecao([linha], {tarefa}, lote)


def test_selecao_incompleta_bloqueia():
    with pytest.raises(RuntimeError):
        validar_selecao([], {uuid4()}, uuid4())
