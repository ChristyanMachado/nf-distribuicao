from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.executor_contexto import IdentidadeExecutor, executor_atual
from src.fonte_tarefas import FontePostgresTarefas, FonteTarefasErro
from src.servico_coordenado import executar_coordenado, identificar


class CoordenadorFalso:
    admitted = True
    failed = False
    stop = False
    instances = []

    def __init__(self, config, identidade):
        self.identidade = identidade
        self.beats = []
        self.recovered = 0
        self.stopped = False
        type(self).instances.append(self)

    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    async def iniciar(self): return {"admitted": False, "active_count": 0}
    async def heartbeat(self, **kwargs):
        self.beats.append(kwargs)
        if self.failed: raise RuntimeError("credencial privada")
        return {"admitted": self.admitted, "active_count": 0}
    async def recuperar(self): self.recovered += 1
    async def parar(self): self.stopped = True


@pytest.fixture
def setup(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKER_VERSION", "abcd1234")
    monkeypatch.setenv("WORKER_HEALTHCHECK_PATH", str(tmp_path / "health.json"))
    monkeypatch.setenv("WORKER_CONTROL_PATH", str(tmp_path / "drain"))
    monkeypatch.setenv("WORKER_STARTUP_HOLD_PATH", str(tmp_path / "hold"))
    monkeypatch.delenv("WORKER_BOOT_ID", raising=False)
    monkeypatch.setattr(CoordenadorFalso, "admitted", True)
    monkeypatch.setattr(CoordenadorFalso, "failed", False)
    return SimpleNamespace(worker_id="pc1", max_concorrencia=1, log_dir=str(tmp_path)), tmp_path


def run(config, executor, **kwargs):
    return asyncio.run(executar_coordenado(config, logging.getLogger("coordenacao"),
        criar_coordenador=CoordenadorFalso, executor=executor, tick=0.001, **kwargs))


def test_processa_identificado_e_encerra_sem_vazar_contexto(setup):
    config, path = setup
    async def executor(*_):
        assert executor_atual.get().worker_id == "pc1"
        return 2
    assert run(config, executor, max_ciclos=1) == 0
    assert executor_atual.get() is None
    saude = json.loads((path / "health.json").read_text())
    assert saude["estado"] == "parado"
    assert saude["versao"] == "abcd1234"
    assert saude["tarefas_ativas"] == 0
    assert CoordenadorFalso.instances[-1].stopped


def test_drain_existente_nao_processa(setup):
    config, path = setup
    (path / "drain").touch()
    executor = AsyncMock(return_value=0)
    assert run(config, executor) == 0
    executor.assert_not_called()
    assert CoordenadorFalso.instances[-1].beats[0]["drenando"]


def test_drain_durante_operacao_espera_conclusao(setup):
    config, path = setup
    terminou = []
    async def executor(*_):
        (path / "drain").touch()
        await asyncio.sleep(0.005)
        terminou.append(True)
        return 2
    assert run(config, executor) == 0
    assert terminou == [True]


def test_hold_e_backup_nao_abrem_fila(setup, monkeypatch):
    config, path = setup
    (path / "hold").touch()
    monkeypatch.setattr(CoordenadorFalso, "admitted", False)
    executor = AsyncMock()
    async def scenario():
        async def parar_depois():
            await asyncio.sleep(0.01)
            (path / "drain").touch()
        timer = asyncio.create_task(parar_depois())
        result = await executar_coordenado(config, logging.getLogger("test"), executor=executor,
            criar_coordenador=CoordenadorFalso, tick=0.001)
        await timer
        return result
    assert asyncio.run(scenario()) == 0
    executor.assert_not_called()


def test_versao_e_boot_invalidos_bloqueiam(setup, monkeypatch):
    config, _ = setup
    monkeypatch.setenv("WORKER_VERSION", "senha\n")
    with pytest.raises(RuntimeError, match="VERSION"): identificar(config)
    monkeypatch.setenv("WORKER_VERSION", "abc")
    monkeypatch.setenv("WORKER_BOOT_ID", "invalido")
    with pytest.raises(RuntimeError, match="BOOT"): identificar(config)


def test_contexto_sql_local_reseta_mesmo_em_excecao():
    conexao = SimpleNamespace(execute=AsyncMock())
    encerrado = []
    @asynccontextmanager
    async def transacao():
        try: yield
        finally: encerrado.append(True)
    conexao.transaction = transacao
    fonte = FontePostgresTarefas("nao-conecta", "pc1")
    async def scenario():
        token = executor_atual.set(IdentidadeExecutor("pc1", str(uuid4()), "abcd"))
        try:
            with pytest.raises(ValueError):
                async with fonte._identificar_conexao(conexao):
                    raise ValueError("teste")
        finally: executor_atual.reset(token)
    asyncio.run(scenario())
    assert encerrado == [True]
    assert "set_config('fiscal.worker_run_id',$2,true)" in conexao.execute.call_args.args[0]


def test_contexto_de_outro_worker_e_recusado():
    fonte = FontePostgresTarefas("nao-conecta", "pc2")
    async def scenario():
        token = executor_atual.set(IdentidadeExecutor("pc1", str(uuid4()), "abcd"))
        try:
            with pytest.raises(FonteTarefasErro):
                async with fonte._identificar_conexao(None): pass
        finally: executor_atual.reset(token)
    asyncio.run(scenario())


def test_heartbeat_perdido_para_sem_iniciar_operacao(setup, monkeypatch, caplog):
    config, path = setup
    monkeypatch.setattr(CoordenadorFalso, "failed", True)
    import src.servico_coordenado as servico
    # Relógio só da supervisão: não altera o relógio interno do event loop.
    ticks = iter(range(0, 10000, 30))
    monkeypatch.setattr(servico, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    executor = AsyncMock()
    assert run(config, executor) == 1
    executor.assert_not_called()
    assert json.loads((path / "health.json").read_text())["estado"] == "degradado"
    assert "credencial privada" not in caplog.text


def test_confirmacao_no_portal_sem_persistencia_exige_conferencia():
    from main import _diagnostico_falha_cancelamento
    codigo, _, conferencia = _diagnostico_falha_cancelamento("persistencia", RuntimeError())
    assert conferencia is True
    assert codigo == "RESULTADO_CANCELAMENTO_INCERTO"


@pytest.mark.parametrize("falhar", [False, True])
def test_cancelamento_marca_fronteira_sob_token_antes_do_clique(falhar):
    from src.flows.consulta import cancelar_nota_consultada, CancelamentoNaoEnviado
    from tests.test_consulta import PaginaCancelamentoFalsa
    pagina = PaginaCancelamentoFalsa()
    chamadas = []
    async def proteger():
        assert not pagina.confirmar.clicado
        chamadas.append(True)
        if falhar: raise FonteTarefasErro("sessao vencida")
    async def scenario():
        await cancelar_nota_consultada(pagina, motivo="Correção operacional", ambiente="teste",
            logger=logging.getLogger("cancelamento"), antes_confirmar=proteger)
    if falhar:
        with pytest.raises(CancelamentoNaoEnviado): asyncio.run(scenario())
    else: asyncio.run(scenario())
    assert chamadas == [True]
    assert pagina.confirmar.clicado is not falhar
