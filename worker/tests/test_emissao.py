"""
Testa que a confirmação humana (validar_antes_de_emitir) é serializada
entre threads — sem isso, com RF14 (3 sessões em paralelo), dois clientes
podem disputar o mesmo input() do terminal ao mesmo tempo.
"""
import asyncio
import logging
import threading
import time
from unittest.mock import patch

import pytest

from src.flows.emissao import (
    Destinatario,
    Emitente,
    EmissaoBloqueada,
    Tarefa,
    emitir,
    validar_antes_de_emitir,
)


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


class BotaoEmitirFalso:
    def __init__(self) -> None:
        self.clicado = False

    async def click(self) -> None:
        self.clicado = True


class PaginaEmissaoFalsa:
    def __init__(self, url: str) -> None:
        self.url = url
        self.botao = BotaoEmitirFalso()

    def get_by_role(self, papel: str, *, name: str, exact: bool):
        assert papel == "button"
        assert name == "Emitir"
        assert exact is True
        return self.botao


def test_emitir_clica_somente_no_dominio_de_homologacao():
    pagina = PaginaEmissaoFalsa(
        "https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo"
    )

    asyncio.run(emitir(pagina, _tarefa_fake("T1"), _logger_silencioso(), ambiente="teste"))

    assert pagina.botao.clicado is True


@pytest.mark.parametrize(
    ("url", "ambiente"),
    [
        ("https://nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo", "teste"),
        ("https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo", "normal"),
        ("https://homologacao.nfae.fazenda.pr.gov.br.evil.example/nfae/x", "teste"),
    ],
)
def test_emitir_bloqueia_fora_da_homologacao(url, ambiente):
    pagina = PaginaEmissaoFalsa(url)

    with pytest.raises(EmissaoBloqueada, match="homologação"):
        asyncio.run(
            emitir(
                pagina,
                _tarefa_fake("T1"),
                _logger_silencioso(),
                ambiente=ambiente,
            )
        )

    assert pagina.botao.clicado is False
