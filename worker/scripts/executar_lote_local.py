"""Contingência supervisionada: pré-checagem por padrão, execução explicitamente limitada.

Não inicia serviço, não reenfileira e não altera permissões da VM.
O operador deve isolar o papel nf_worker_vm antes de usar --executar.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import hmac
import json
import os
from uuid import UUID
from urllib.parse import urlsplit

from dotenv import dotenv_values

CHAVE_TRAVA_CONTINGENCIA = (713247, 20260910)


def configurar_ambiente(env_file: str) -> None:
    valores = dotenv_values(env_file)
    # O arquivo indicado é a única origem dos segredos desta execução.
    for chave in list(os.environ):
        if chave.startswith(("CLIENTE", "WORKER_", "SUPABASE_", "TESTAR_", "PROCESSAR_", "PAUSAR_")):
            os.environ.pop(chave)
    os.environ.update({k: v for k, v in valores.items() if v is not None})
    os.environ.update({
        "AMBIENTE_EMISSAO": "normal", "HABILITAR_PRODUCAO_FISCAL": "true",
        "TESTAR_EMISSAO_HOMOLOGACAO": "false", "FONTE_TAREFAS": "banco",
        "MODO_OPERACAO": "automatico", "MAX_CONCORRENCIA": "1",
        "TESTAR_INTEGRACAO_BANCO": "true", "PROCESSAR_FILA_BANCO": "true",
        "TESTAR_NAVEGACAO_EMISSAO": "true", "TESTAR_PREENCHIMENTO_COMPLETO": "true",
        "TESTAR_NAVEGACAO_CONSULTA": "false", "CONSULTAR_ULTIMO_XML": "false",
        "BAIXAR_DOCUMENTOS_CONSULTA": "false", "WORKER_PERSISTENTE": "false",
        "HEADLESS": "true", "INSPECIONAR": "false", "ARMAZENAR_DOCUMENTOS": "true",
        "LIMPAR_DOCUMENTOS_EXPIRADOS": "false", "PROCESSAR_RECUPERACOES_DOCUMENTOS": "false",
        "PROCESSAR_CANCELAMENTOS_FISCAIS": "false", "PAUSAR_ANTES_EMITIR": "false",
        "PAUSAR_APOS_DOWNLOADS": "false", "PAUSAR_APOS_CONSULTA": "false",
        "PAUSAR_ANTES_TRANSPORTE": "false", "WORKER_ID": "contingencia-local-supervisionada",
        "DOWNLOAD_DIR": "./downloads/contingencia-local", "LOG_DIR": "./logs/contingencia-local",
    })
    if urlsplit(os.environ.get("WORKER_DATABASE_URL", "")).username != "nf_worker_local.kcukzbszakwrfhbsiihw":
        raise RuntimeError("A contingência exige o papel local do projeto de produção.")


def validar_selecao(linhas, esperadas, lote_id):
    if {r["id"] for r in linhas} != esperadas:
        raise RuntimeError("Seleção incompleta; nenhuma reserva realizada.")
    if any(r["lote_id"] != lote_id or r["status"] != "PENDENTE" or r["tentativas"] != 0 for r in linhas):
        raise RuntimeError("Lote alterado ou já iniciado; conferência obrigatória.")


async def consultar_fila(env_file: str) -> dict[str, object]:
    """Retorna somente metadados operacionais, sem reservar ou expor dados fiscais."""
    configurar_ambiente(env_file)
    import asyncpg

    conexao = await asyncpg.connect(
        os.environ["WORKER_DATABASE_URL"], timeout=15, command_timeout=30,
        ssl="require", statement_cache_size=0,
    )
    try:
        estado = await conexao.fetchrow(
            """SELECT
                 (SELECT rolcanlogin FROM pg_roles WHERE rolname='nf_worker_vm') AS vm_login,
                 (SELECT count(*) FROM pg_stat_activity WHERE usename='nf_worker_vm') AS vm_sessoes,
                 (SELECT count(*) FROM fiscal.tarefas
                   WHERE status IN ('PROCESSANDO','EMITINDO')) AS tarefas_ativas"""
        )
        linhas = await conexao.fetch(
            """WITH lote_prioritario AS (
                   SELECT lote_id,min(criado_em) AS primeiro
                   FROM fiscal.tarefas
                   WHERE status='PENDENTE' AND lote_id IS NOT NULL
                   GROUP BY lote_id ORDER BY primeiro,lote_id LIMIT 1
               )
               SELECT t.id,t.lote_id,t.tentativas,
                      t.payload_worker->'tarefa'->>'numeroDistribuicao' AS numero
               FROM fiscal.tarefas t JOIN lote_prioritario l ON l.lote_id=t.lote_id
               WHERE t.status='PENDENTE'
               ORDER BY t.criado_em,t.id"""
        )
        return {
            "vmIsolada": estado["vm_login"] is False and estado["vm_sessoes"] == 0,
            "tarefasAtivas": estado["tarefas_ativas"],
            "loteId": str(linhas[0]["lote_id"]) if linhas else None,
            "numero": linhas[0]["numero"] if linhas else None,
            "quantidade": len(linhas),
            "tarefaIds": [str(linha["id"]) for linha in linhas],
            "primeiraTentativa": bool(linhas) and all(linha["tentativas"] == 0 for linha in linhas),
        }
    finally:
        await conexao.close()


async def verificar_trava_global(env_file: str) -> bool:
    configurar_ambiente(env_file)
    import asyncpg

    conexao = await asyncpg.connect(
        os.environ["WORKER_DATABASE_URL"], timeout=15, command_timeout=30,
        ssl="require", statement_cache_size=0,
    )
    adquiriu = False
    try:
        adquiriu = bool(await conexao.fetchval(
            "SELECT pg_try_advisory_lock($1,$2)", *CHAVE_TRAVA_CONTINGENCIA
        ))
        return adquiriu
    finally:
        if adquiriu:
            await conexao.fetchval(
                "SELECT pg_advisory_unlock($1,$2)", *CHAVE_TRAVA_CONTINGENCIA
            )
        await conexao.close()


async def executar(args):
    configurar_ambiente(args.env_file)
    if args.verificar_trava:
        print(json.dumps({"travaDisponivel": await verificar_trava_global(args.env_file)}), flush=True)
        return 0
    if args.listar:
        print(json.dumps(await consultar_fila(args.env_file), ensure_ascii=False), flush=True)
        return 0
    import main as worker
    from src.config import carregar_config
    from src.contrato_tarefa import carregar_contrato_tarefa
    from src.fonte_tarefas import FontePostgresTarefas, TarefaReservada
    from src.utils.logging import configurar_logger

    config = carregar_config()
    esperadas = set(args.tarefa)
    if not 1 <= len(esperadas) <= 20 or len(esperadas) != len(args.tarefa):
        raise RuntimeError("A contingência exige de uma a vinte tarefas explícitas, sem repetição.")
    if args.lote_id is None:
        raise RuntimeError("O lote explícito é obrigatório para executar.")
    quantidade_inicial = len(esperadas)
    async with FontePostgresTarefas(config.worker_database_url, config.worker_id) as fonte:
        async with fonte._conexao() as con:
            if await con.fetchval("SELECT current_user") != "nf_worker_local":
                raise RuntimeError("Papel inesperado.")
            linhas = await con.fetch("SELECT id,lote_id,status,tentativas,payload_worker::text AS payload,payload_hash FROM fiscal.tarefas WHERE id=ANY($1::uuid[])", list(esperadas))
            validar_selecao(linhas, esperadas, args.lote_id)
            for r in linhas:
                if not hmac.compare_digest(hashlib.sha256(r["payload"].encode()).hexdigest(), r["payload_hash"]):
                    raise RuntimeError("Hash do snapshot divergente.")
                contratada = carregar_contrato_tarefa(json.loads(r["payload"]))
                worker._validar_preparacao_reserva(TarefaReservada(contratada, "preflight-sem-reserva"), config)
            print(f"PRECHECK_OK: {quantidade_inicial} snapshot(s) e credencial(is) validados; nenhuma reserva.", flush=True)
    if not args.executar:
        return 0

    class FonteLimitada(FontePostgresTarefas):
        async def reservar(self, limite=1):
            async with self._conexao() as con:
                async with con.transaction():
                    if await con.fetchval("SELECT rolcanlogin FROM pg_roles WHERE rolname='nf_worker_vm'") is not False:
                        raise RuntimeError("Papel da VM não está isolado.")
                    if await con.fetchval("SELECT count(*) FROM pg_stat_activity WHERE usename='nf_worker_vm'") != 0:
                        raise RuntimeError("Ainda há sessão da VM.")
                    if await con.fetchval("SELECT count(*) FROM fiscal.tarefas WHERE status IN ('PROCESSANDO','EMITINDO')"):
                        raise RuntimeError("Há tarefa em andamento; não iniciar outra.")
                    reservas = await con.fetch("SELECT tarefa_id,reserva_token FROM fiscal.reservar_tarefas_worker($1,1)", self.worker_id)
                    if len(reservas) != 1 or reservas[0]["tarefa_id"] not in esperadas:
                        raise RuntimeError("Reserva fora do escopo; transação revertida.")
                    resultado = await self._materializar_reservas(con, reservas)
                    if len(resultado) != 1:
                        raise RuntimeError("Contrato inválido; reserva revertida.")
                    esperadas.remove(reservas[0]["tarefa_id"])
                    return resultado

    worker.FontePostgresTarefas = FonteLimitada
    logger = configurar_logger(config.log_dir)
    import asyncpg
    trava = await asyncpg.connect(
        config.worker_database_url, timeout=15, command_timeout=30,
        ssl="require", statement_cache_size=0,
    )
    try:
        if not await trava.fetchval(
            "SELECT pg_try_advisory_lock($1,$2)", *CHAVE_TRAVA_CONTINGENCIA
        ):
            raise RuntimeError("Outra contingência local já está em execução.")
        for _ in range(quantidade_inicial):
            if await worker.executar_fila_banco(config, logger) != 0:
                print("INTERROMPIDO: conferir resultado; não haverá repetição automática.", flush=True)
                return 1
    finally:
        try:
            await trava.fetchval(
                "SELECT pg_advisory_unlock($1,$2)", *CHAVE_TRAVA_CONTINGENCIA
            )
        finally:
            await trava.close()
    print(f"EXECUCAO_ENCERRADA: conferir {quantidade_inicial} autorização(ões) e documentos no banco.", flush=True)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--listar", action="store_true")
    parser.add_argument("--verificar-trava", action="store_true")
    parser.add_argument("--lote-id", type=UUID)
    parser.add_argument("--tarefa", type=UUID, action="append", default=[])
    parser.add_argument("--executar", action="store_true")
    try:
        raise SystemExit(asyncio.run(executar(parser.parse_args())))
    except Exception as exc:
        # Não imprimir exceções de bibliotecas que podem conter dados/segredos.
        print(f"CONTINGENCIA_BLOQUEADA ({type(exc).__name__}); nenhuma repetição automática.", flush=True)
        raise SystemExit(1) from None
