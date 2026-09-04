"""Laço persistente do Worker para VM/container, ainda só em homologação."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import signal
from typing import Awaitable, Callable

from main import executar_fila_banco_homologacao
from scripts.verificar_privilegios_banco import verificar as verificar_privilegios
from .config import Config, carregar_config
from .utils.logging import configurar_logger


ExecutorFila = Callable[[Config, logging.Logger], Awaitable[int]]


async def _executar_ciclo_persistente(config: Config, logger: logging.Logger) -> int:
    """Mantém recuperação 24h e restringe emissões à janela operacional."""

    return await executar_fila_banco_homologacao(
        config,
        logger,
        silencioso_sem_tarefas=True,
        usar_janela_operacional=True,
    )


def _inteiro_env(nome: str, padrao: int, minimo: int, maximo: int) -> int:
    try:
        valor = int((os.getenv(nome) or str(padrao)).strip())
    except ValueError as exc:
        raise RuntimeError(f"{nome} deve ser um número inteiro.") from exc
    if not minimo <= valor <= maximo:
        raise RuntimeError(f"{nome} deve ficar entre {minimo} e {maximo} segundos.")
    return valor


def _gravar_saude(caminho: Path, *, estado: str, codigo_saida: int) -> None:
    """Publica apenas estado operacional; nenhuma configuração entra no arquivo."""

    caminho.parent.mkdir(parents=True, exist_ok=True)
    temporario = caminho.with_suffix(caminho.suffix + ".tmp")
    temporario.write_text(
        json.dumps(
            {
                "estado": estado,
                "codigo_saida": codigo_saida,
                "atualizado_em": datetime.now(timezone.utc).isoformat(),
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    os.chmod(temporario, 0o600)
    os.replace(temporario, caminho)


def _instalar_sinais(evento: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    for sinal in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sinal, evento.set)
        except (NotImplementedError, RuntimeError):
            # Windows não implementa add_signal_handler; o container Linux sim.
            pass


async def executar_servico(
    config: Config,
    logger: logging.Logger,
    *,
    executor: ExecutorFila = _executar_ciclo_persistente,
    max_ciclos: int | None = None,
) -> int:
    if not config.worker_persistente:
        raise RuntimeError("O serviço exige WORKER_PERSISTENTE=true.")

    intervalo = _inteiro_env("WORKER_POLL_SECONDS", 15, 5, 300)
    recuo_erro = _inteiro_env("WORKER_ERROR_BACKOFF_SECONDS", 30, 5, 600)
    toque_saude = _inteiro_env("WORKER_HEALTH_TOUCH_SECONDS", 30, 5, 120)
    saude = Path(os.getenv("WORKER_HEALTHCHECK_PATH", "/tmp/nf-worker-health.json"))
    parar = asyncio.Event()
    _instalar_sinais(parar)
    ciclos = 0

    logger.info(
        "Worker persistente iniciado em homologação; recuperações 24h e "
        "janela de novas emissões carregada do banco.",
    )
    while not parar.is_set():
        _gravar_saude(saude, estado="processando", codigo_saida=0)
        try:
            tarefa = asyncio.create_task(executor(config, logger))
            while not tarefa.done():
                feito, _ = await asyncio.wait({tarefa}, timeout=toque_saude)
                if not feito:
                    _gravar_saude(saude, estado="processando", codigo_saida=0)
            codigo = await tarefa
        except Exception as exc:  # noqa: BLE001 - serviço precisa sobreviver à indisponibilidade
            codigo = 1
            logger.error("Ciclo do Worker falhou (%s).", type(exc).__name__)
        _gravar_saude(saude, estado="ok" if codigo == 0 else "degradado", codigo_saida=codigo)
        ciclos += 1
        if max_ciclos is not None and ciclos >= max_ciclos:
            break
        espera = intervalo if codigo == 0 else recuo_erro
        try:
            await asyncio.wait_for(parar.wait(), timeout=espera)
        except TimeoutError:
            pass

    logger.info("Worker persistente encerrado de forma controlada.")
    return 0


async def _executar_principal(config: Config, logger: logging.Logger) -> int:
    assert config.worker_database_url
    try:
        auditoria = await verificar_privilegios(config.worker_database_url)
    except Exception as exc:  # noqa: BLE001 - não revelar host ou credencial
        raise RuntimeError(
            f"Não foi possível auditar o papel do Worker ({type(exc).__name__})."
        ) from None
    if auditoria.get("papelWorkerSeguro") is not True:
        raise RuntimeError("O papel do Worker não passou na auditoria de menor privilégio.")
    logger.info("Papel dedicado do Worker aprovado antes do início do serviço.")
    return await executar_servico(config, logger)


def main() -> int:
    config = carregar_config()
    logger = configurar_logger(config.log_dir)
    return asyncio.run(_executar_principal(config, logger))


if __name__ == "__main__":
    raise SystemExit(main())
