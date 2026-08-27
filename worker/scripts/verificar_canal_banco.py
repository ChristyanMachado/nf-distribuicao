"""Verifica TLS + função da fila somente quando não há tarefa elegível.

Este utilitário não abre navegador e se recusa a chamar a reserva se houver
qualquer tarefa pronta, evitando alterar o estado fiscal durante um teste de
infraestrutura.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os

from dotenv import dotenv_values

from src.fonte_tarefas import FontePostgresTarefas


def _argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file")
    parser.add_argument("--database-key", default="WORKER_DATABASE_URL")
    return parser.parse_args()


async def _verificar(database_url: str) -> int:
    import asyncpg

    conexao = await asyncpg.connect(
        database_url,
        timeout=15,
        command_timeout=30,
        ssl="require",
    )
    try:
        elegiveis = await conexao.fetchval(
            """SELECT count(*) FROM fiscal.tarefas
               WHERE status='PENDENTE' AND lote_id IS NOT NULL
                 AND contrato_versao=1 AND payload_worker IS NOT NULL
                 AND payload_hash IS NOT NULL"""
        )
    finally:
        await conexao.close()

    if elegiveis:
        print(json.dumps({"canalBancoWorker": "nao_testado", "tarefasElegiveis": elegiveis}))
        return 2

    async with FontePostgresTarefas(
        database_url,
        "worker-contract-check",
    ) as fonte:
        reservas = await fonte.reservar(1)
    print(json.dumps({"canalBancoWorker": "ok", "reservasElegiveis": len(reservas)}))
    return 0


def main() -> int:
    args = _argumentos()
    valor = os.getenv(args.database_key)
    if not valor and args.env_file:
        valor = dotenv_values(args.env_file).get(args.database_key)
    if not valor:
        print(json.dumps({
            "canalBancoWorker": "nao_configurado",
            "variavelAusente": args.database_key,
        }))
        return 2
    try:
        return asyncio.run(_verificar(valor))
    except Exception as exc:  # noqa: BLE001 — diagnóstico público deve ser sanitizado
        print(json.dumps({
            "canalBancoWorker": "erro",
            "tipoErro": type(exc).__name__,
        }))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
