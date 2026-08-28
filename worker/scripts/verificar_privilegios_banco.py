"""Audita o papel PostgreSQL do Worker sem consultar dados fiscais.

O resultado expõe apenas booleanos. Nome do papel, URL, host e privilégios de
outros usuários nunca são impressos.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Mapping

from dotenv import dotenv_values


PRIVILEGIOS_OBRIGATORIOS = (
    "conectar_banco",
    "usar_schema",
    "executar_reserva",
    "ler_tarefas",
    "atualizar_status",
    "ler_notas",
    "inserir_notas",
)

PRIVILEGIOS_PROIBIDOS = (
    "ler_emitentes",
    "ler_login_legado",
    "ler_senha_legada",
    "excluir_tarefas",
    "excluir_notas",
    "atualizar_notas",
)


def avaliar_privilegios(resultado: Mapping[str, object]) -> dict[str, object]:
    ausentes = [nome for nome in PRIVILEGIOS_OBRIGATORIOS if not resultado.get(nome)]
    excessivos = [nome for nome in PRIVILEGIOS_PROIBIDOS if resultado.get(nome)]
    return {
        "papelWorkerSeguro": not ausentes and not excessivos,
        "privilegiosObrigatoriosAusentes": ausentes,
        "privilegiosExcessivos": excessivos,
    }


async def verificar(database_url: str) -> dict[str, object]:
    import asyncpg

    conexao = await asyncpg.connect(
        database_url,
        timeout=15,
        command_timeout=30,
        ssl="require",
        statement_cache_size=0,
    )
    try:
        resultado = await conexao.fetchrow(
            """
            SELECT
              has_database_privilege(current_user, current_database(), 'CONNECT') AS conectar_banco,
              has_schema_privilege(current_user, 'fiscal', 'USAGE') AS usar_schema,
              has_function_privilege(
                current_user,
                'fiscal.reservar_tarefas_worker(text,integer,integer)',
                'EXECUTE'
              ) AS executar_reserva,
              has_table_privilege(current_user, 'fiscal.tarefas', 'SELECT') AS ler_tarefas,
              has_column_privilege(current_user, 'fiscal.tarefas', 'status', 'UPDATE')
                AND has_column_privilege(current_user, 'fiscal.tarefas', 'reserva_token', 'UPDATE')
                AND has_column_privilege(current_user, 'fiscal.tarefas', 'atualizado_em', 'UPDATE')
                AS atualizar_status,
              has_table_privilege(current_user, 'fiscal.notas', 'SELECT') AS ler_notas,
              has_column_privilege(current_user, 'fiscal.notas', 'tarefa_id', 'INSERT')
                AND has_column_privilege(current_user, 'fiscal.notas', 'chave_acesso', 'INSERT')
                AND has_column_privilege(current_user, 'fiscal.notas', 'protocolo_autorizacao', 'INSERT')
                AS inserir_notas,
              has_table_privilege(current_user, 'fiscal.emitentes', 'SELECT') AS ler_emitentes,
              has_column_privilege(current_user, 'fiscal.emitentes', 'login_usuario', 'SELECT')
                AS ler_login_legado,
              has_column_privilege(current_user, 'fiscal.emitentes', 'senha', 'SELECT')
                AS ler_senha_legada,
              has_table_privilege(current_user, 'fiscal.tarefas', 'DELETE') AS excluir_tarefas,
              has_table_privilege(current_user, 'fiscal.notas', 'DELETE') AS excluir_notas,
              has_table_privilege(current_user, 'fiscal.notas', 'UPDATE') AS atualizar_notas
            """
        )
        return avaliar_privilegios(dict(resultado))
    finally:
        await conexao.close()


def _argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file")
    parser.add_argument("--database-key", default="WORKER_DATABASE_URL")
    return parser.parse_args()


def main() -> int:
    args = _argumentos()
    valor = os.getenv(args.database_key)
    if not valor and args.env_file:
        valor = dotenv_values(args.env_file).get(args.database_key)
    if not valor:
        print(json.dumps({
            "papelWorkerSeguro": False,
            "configuracaoAusente": args.database_key,
        }))
        return 2
    try:
        resultado = asyncio.run(verificar(valor))
    except Exception as exc:  # noqa: BLE001 — nunca expor detalhes da conexão
        print(json.dumps({
            "papelWorkerSeguro": False,
            "tipoErro": type(exc).__name__,
        }))
        return 1
    print(json.dumps(resultado))
    return 0 if resultado["papelWorkerSeguro"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
