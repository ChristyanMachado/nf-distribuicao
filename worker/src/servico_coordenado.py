"""Supervisão portátil ativa/passiva; a autoridade de posse é sempre o Postgres."""
from __future__ import annotations

import asyncio
from contextlib import suppress
import json
import os
from pathlib import Path
import re
import time
from uuid import UUID, uuid4

from .executor_contexto import IdentidadeExecutor, executor_atual, controle_solicitado
from .fonte_tarefas import FontePostgresTarefas


class Coordenador:
    def __init__(self, config, identidade):
        self.config, self.identidade = config, identidade
        self.fonte = FontePostgresTarefas(config.worker_database_url, identidade.worker_id)

    async def __aenter__(self):
        await self.fonte.__aenter__()
        return self

    async def __aexit__(self, *args):
        await self.fonte.__aexit__(*args)

    async def _chamar(self, sql, *args):
        async with self.fonte._conexao() as conn:
            resultado = await conn.fetchval(sql, self.identidade.worker_id, self.identidade.boot_id, *args)
        return json.loads(resultado) if isinstance(resultado, str) else resultado

    async def iniciar(self):
        return await self._chamar("SELECT fiscal.worker_start($1,$2::uuid,$3,$4)",
                                 self.identidade.versao, self.config.max_concorrencia)

    async def heartbeat(self, *, drenando=False, erro=None):
        return await self._chamar("SELECT fiscal.worker_heartbeat($1,$2::uuid,$3,$4)", drenando, erro)

    async def recuperar(self):
        return await self._chamar("SELECT fiscal.worker_recover_abandoned($1,$2::uuid)")

    async def parar(self):
        return await self._chamar("SELECT fiscal.worker_stop($1,$2::uuid)")


def identificar(config):
    versao = os.getenv("WORKER_VERSION", "")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]{0,63}", versao):
        raise RuntimeError("WORKER_VERSION explícita é obrigatória no executor coordenado.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", config.worker_id or ""):
        raise RuntimeError("WORKER_ID coordenado deve ter 1–64 letras, números, _ ou -.")
    try:
        boot = str(UUID(os.environ["WORKER_BOOT_ID"])) if os.getenv("WORKER_BOOT_ID") else str(uuid4())
    except ValueError:
        raise RuntimeError("WORKER_BOOT_ID inválido.") from None
    return IdentidadeExecutor(config.worker_id, boot, versao)


async def executar_coordenado(config, logger, *, executor, max_ciclos=None,
                             criar_coordenador=Coordenador, tick=1.0):
    from .servico import _gravar_saude, _instalar_sinais, _inteiro_env

    identidade = identificar(config)
    contexto = executor_atual.set(identidade)
    saude = Path(os.getenv("WORKER_HEALTHCHECK_PATH", str(Path(config.log_dir) / "health.json")))
    parar = asyncio.Event()
    _instalar_sinais(parar)
    intervalo = _inteiro_env("WORKER_POLL_SECONDS", 5, 5, 300)
    backoff = _inteiro_env("WORKER_ERROR_BACKOFF_SECONDS", 30, 5, 600)
    # Prazo total inclui navegador/Storage; evita heartbeat infinito de ciclo travado.
    max_ciclo = _inteiro_env("WORKER_MAX_CYCLE_SECONDS", 1200, 180, 3600)
    tarefa = None
    resumo = {"admitted": False, "active_count": 0}
    ciclos = 0
    codigo = 0
    erro = None
    ultima_ok = 0.0
    proximo_heartbeat = 0.0
    proximo_ciclo = 0.0
    inicio_ciclo = 0.0
    conectado = False
    falhas_consecutivas = 0

    def publicar(estado, saida=0):
        _gravar_saude(saude, estado=estado, codigo_saida=saida, detalhes={
            "worker_id": identidade.worker_id, "versao": identidade.versao,
            "boot_id": identidade.boot_id, "pid": os.getpid(),
            "tarefas_ativas": int(resumo.get("active_count", 0)),
        })

    try:
        async with criar_coordenador(config, identidade) as coordenador:
            resumo = await coordenador.iniciar()
            ultima_ok = time.monotonic()
            logger.info("Executor %s iniciado na versão %s; prioridade definida no banco.",
                        identidade.worker_id, identidade.versao)
            try:
                while True:
                    agora = time.monotonic()
                    drenar = parar.is_set() or controle_solicitado("WORKER_CONTROL_PATH")
                    hold = controle_solicitado("WORKER_STARTUP_HOLD_PATH")
                    if agora >= proximo_heartbeat:
                        try:
                            resumo = await coordenador.heartbeat(drenando=drenar or hold, erro=erro)
                            ultima_ok = time.monotonic()
                            conectado = True
                            erro = None
                            proximo_heartbeat = ultima_ok + 30
                            if resumo["admitted"] and not drenar and not hold:
                                await coordenador.recuperar()
                        except Exception as exc:
                            conectado = False
                            resumo["admitted"] = False
                            erro = "WORKER_HEARTBEAT_FAILED"
                            proximo_heartbeat = time.monotonic() + 5
                            logger.warning("Comunicação do executor indisponível (%s).", type(exc).__name__)
                    # Margem de 20s para fechar o browser antes de expirar o lease de 120s.
                    if time.monotonic() - ultima_ok >= 100:
                        codigo = 1
                        publicar("degradado", 1)
                        break
                    if tarefa is not None and tarefa.done():
                        try:
                            resultado = await tarefa
                        except Exception as exc:
                            logger.error("Ciclo interrompido (%s).", type(exc).__name__)
                            resultado = 1
                        tarefa = None
                        ciclos += 1
                        erro = "WORKER_CYCLE_FAILED" if resultado == 1 else None
                        falhas_consecutivas = falhas_consecutivas + 1 if resultado == 1 else 0
                        if falhas_consecutivas >= 3:
                            codigo = 1
                            logger.error("Três ciclos falharam; liberando o executor para reinício supervisionado.")
                            break
                        proximo_ciclo = time.monotonic() + (backoff if resultado == 1 else 0 if resultado == 2 else intervalo)
                        proximo_heartbeat = 0
                        if max_ciclos is not None and ciclos >= max_ciclos:
                            break
                    if tarefa is not None and agora - inicio_ciclo >= max_ciclo:
                        codigo = 1
                        erro = "WORKER_CYCLE_TIMEOUT"
                        logger.error("Ciclo excedeu o prazo total; executor será reiniciado sem retry fiscal.")
                        break
                    if drenar and tarefa is None:
                        break
                    if (tarefa is None and conectado and resumo["admitted"] and not drenar and not hold
                            and agora >= proximo_ciclo):
                        inicio_ciclo = time.monotonic()
                        tarefa = asyncio.create_task(executor(config, logger))
                    estado = ("degradado" if not conectado else "drenando" if drenar else
                              "manutencao" if hold else "processando" if tarefa is not None else
                              "ok" if resumo["admitted"] else "espera")
                    publicar(estado, 0 if conectado else 1)
                    try:
                        await asyncio.wait_for(parar.wait(), timeout=tick)
                    except TimeoutError:
                        pass
                    if parar.is_set() and tarefa is not None:
                        await asyncio.sleep(tick)
            finally:
                if tarefa is not None:
                    tarefa.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await asyncio.wait_for(tarefa, timeout=20)
                with suppress(Exception):
                    resumo = await coordenador.heartbeat(drenando=True, erro=erro)
                    await coordenador.parar()
                publicar("parado" if codigo == 0 else "degradado", codigo)
    except Exception as exc:
        publicar("degradado", 1)
        logger.error("Executor recusado ou indisponível (%s).", type(exc).__name__)
        codigo = 1
    finally:
        executor_atual.reset(contexto)
    return codigo
