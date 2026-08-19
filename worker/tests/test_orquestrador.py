"""
Testa a orquestração de sessões paralelas (RF14) SEM depender de um
navegador real — passamos um `browser` fictício (None) porque a função
só repassa esse objeto adiante, não interage com ele diretamente.
"""
import logging

from src.orquestrador import processar_clientes_em_paralelo


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste")
    logger.addHandler(logging.NullHandler())
    return logger


def test_processa_todos_os_clientes_com_sucesso():
    chamados = []

    def tarefa_ok(cliente_id: str, browser) -> None:
        chamados.append(cliente_id)

    resultados = processar_clientes_em_paralelo(
        browser=None,
        clientes_ids=["CLIENTE_A", "CLIENTE_B", "CLIENTE_C"],
        processar_uma_tarefa=tarefa_ok,
        logger=_logger_silencioso(),
    )

    assert len(resultados) == 3
    assert all(r.sucesso for r in resultados)
    assert sorted(chamados) == ["CLIENTE_A", "CLIENTE_B", "CLIENTE_C"]


def test_falha_de_um_cliente_nao_impede_os_demais():
    def tarefa_com_falha_no_b(cliente_id: str, browser) -> None:
        if cliente_id == "CLIENTE_B":
            raise RuntimeError("login falhou")

    resultados = processar_clientes_em_paralelo(
        browser=None,
        clientes_ids=["CLIENTE_A", "CLIENTE_B", "CLIENTE_C"],
        processar_uma_tarefa=tarefa_com_falha_no_b,
        logger=_logger_silencioso(),
    )

    por_cliente = {r.cliente_id: r for r in resultados}

    assert por_cliente["CLIENTE_A"].sucesso is True
    assert por_cliente["CLIENTE_C"].sucesso is True
    assert por_cliente["CLIENTE_B"].sucesso is False
    assert "login falhou" in por_cliente["CLIENTE_B"].erro
