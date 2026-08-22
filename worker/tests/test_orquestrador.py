"""Testes unitários da orquestração Async, sem navegador real."""

from __future__ import annotations

import asyncio
import logging

from src.orquestrador import _processar_uma_tarefa


class ContextoFalso:
    def __init__(self) -> None:
        self.fechado = False

    async def close(self) -> None:
        self.fechado = True


class BrowserFalso:
    def __init__(self) -> None:
        self.contextos: list[ContextoFalso] = []

    async def new_context(self) -> ContextoFalso:
        contexto = ContextoFalso()
        self.contextos.append(contexto)
        return contexto


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste_orquestrador")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    return logger


def test_processa_tarefa_com_sucesso_e_fecha_contexto():
    chamados: list[str] = []

    async def tarefa_ok(tarefa_id: str, context: ContextoFalso) -> None:
        chamados.append(tarefa_id)
        assert context.fechado is False

    browser = BrowserFalso()
    resultado = asyncio.run(
        _processar_uma_tarefa("CLIENTE_A", browser, tarefa_ok, _logger_silencioso())
    )

    assert resultado.sucesso is True
    assert resultado.erro is None
    assert chamados == ["CLIENTE_A"]
    assert browser.contextos[0].fechado is True


def test_falha_da_tarefa_retorna_resultado_e_fecha_contexto():
    async def tarefa_com_falha(tarefa_id: str, context: ContextoFalso) -> None:
        raise RuntimeError("login falhou")

    browser = BrowserFalso()
    resultado = asyncio.run(
        _processar_uma_tarefa(
            "CLIENTE_B", browser, tarefa_com_falha, _logger_silencioso()
        )
    )

    assert resultado.sucesso is False
    assert resultado.tipo_erro == "RuntimeError"
    assert resultado.erro == "login falhou"
    assert browser.contextos[0].fechado is True


def test_sem_semaphore_tarefas_rodam_de_verdade_em_paralelo():
    """
    Comportamento de hoje (sem MAX_CONCORRENCIA configurado): nada limita
    quantos contextos ficam abertos ao mesmo tempo — os 3 picos simultâneos
    já validados manualmente (CLIENTE_A/B/C) continuam possíveis.
    """
    em_andamento: list[int] = []
    picos: list[int] = []

    async def tarefa_lenta(tarefa_id: str, context: ContextoFalso) -> None:
        em_andamento.append(1)
        picos.append(len(em_andamento))
        await asyncio.sleep(0.05)
        em_andamento.pop()

    browser = BrowserFalso()

    async def rodar():
        return await asyncio.gather(
            *(
                _processar_uma_tarefa(f"T{i}", browser, tarefa_lenta, _logger_silencioso())
                for i in range(3)
            )
        )

    resultados = asyncio.run(rodar())

    assert all(r.sucesso for r in resultados)
    assert max(picos) == 3, "sem limite configurado, as 3 tarefas deveriam rodar juntas"


def test_com_semaphore_limita_contextos_simultaneos():
    """
    MAX_CONCORRENCIA=1: mesmo pedindo 3 tarefas de uma vez, no máximo 1
    contexto deve estar aberto em cada instante — as outras esperam a vez,
    sem serem canceladas (todas devem terminar com sucesso).
    """
    em_andamento: list[int] = []
    picos: list[int] = []

    async def tarefa_lenta(tarefa_id: str, context: ContextoFalso) -> None:
        em_andamento.append(1)
        picos.append(len(em_andamento))
        await asyncio.sleep(0.05)
        em_andamento.pop()

    browser = BrowserFalso()

    async def rodar():
        semaphore = asyncio.Semaphore(1)
        return await asyncio.gather(
            *(
                _processar_uma_tarefa(f"T{i}", browser, tarefa_lenta, _logger_silencioso(), semaphore)
                for i in range(3)
            )
        )

    resultados = asyncio.run(rodar())

    assert len(resultados) == 3
    assert all(r.sucesso for r in resultados), "nenhuma tarefa deveria ser cancelada, só esperar a vez"
    assert max(picos) == 1, "com MAX_CONCORRENCIA=1, nunca deveria haver 2 contextos abertos ao mesmo tempo"
    assert len(browser.contextos) == 3, "as 3 tarefas ainda deveriam rodar, uma de cada vez"
    assert all(c.fechado for c in browser.contextos)
