"""
Testa que a confirmação humana (validar_antes_de_emitir) é serializada
entre threads — sem isso, com RF14 (3 sessões em paralelo), dois clientes
podem disputar o mesmo input() do terminal ao mesmo tempo.
"""
import logging
import threading
import time
from unittest.mock import patch

from src.flows.emissao import Destinatario, Emitente, Tarefa, validar_antes_de_emitir


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste-emissao")
    logger.addHandler(logging.NullHandler())
    return logger


def _tarefa_fake(tarefa_id: str) -> Tarefa:
    return Tarefa(
        tarefa_id=tarefa_id,
        cliente_id="CLIENTE_TESTE",
        emitente=Emitente(valor_select="1"),
        destinatario=Destinatario(
            cnpj="00.000.000/0001-00",
            indicador_ie="CONTRIBUINTE",
            razao_social="Teste",
            cep="00000-000",
            numero_endereco="1",
        ),
    )


def test_confirmacao_humana_e_serializada_entre_threads():
    """
    Sem o lock, os 3 input() concorrentes poderiam se sobrepor. Simulamos
    3 chamadas simultâneas e verificamos que nunca mais de 1 está "dentro"
    do input() ao mesmo tempo.
    """
    em_andamento: list[int] = []
    picos_simultaneos: list[int] = []
    lock_contagem = threading.Lock()

    def input_falso(prompt: str) -> str:
        with lock_contagem:
            em_andamento.append(1)
            picos_simultaneos.append(len(em_andamento))
        time.sleep(0.05)  # simula o tempo que uma pessoa levaria pra digitar
        with lock_contagem:
            em_andamento.pop()
        return "s"

    logger = _logger_silencioso()
    resultados = []

    def rodar(tarefa_id: str):
        resultados.append(validar_antes_de_emitir(None, _tarefa_fake(tarefa_id), logger))

    with patch("builtins.input", side_effect=input_falso):
        threads = [threading.Thread(target=rodar, args=(f"tarefa-{i}",)) for i in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    assert max(picos_simultaneos) == 1, "mais de um input() rodou ao mesmo tempo — lock não está funcionando"
    assert resultados == [True, True, True]
