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


async def executar(args):
    configurar_ambiente(args.env_file)
    import main as worker
    from src.config import carregar_config
    from src.contrato_tarefa import carregar_contrato_tarefa
    from src.fonte_tarefas import FontePostgresTarefas, TarefaReservada
    from src.utils.logging import configurar_logger

    config = carregar_config()
    esperadas = set(args.tarefa)
    if len(esperadas) != 3 or len(args.tarefa) != 3:
        raise RuntimeError("Esta contingência está limitada a exatamente três tarefas explícitas.")
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
            print("PRECHECK_OK: três snapshots e credenciais validados; nenhuma reserva.", flush=True)
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
    for _ in range(3):
        if await worker.executar_fila_banco(config, logger) != 0:
            print("INTERROMPIDO: conferir resultado; não haverá repetição automática.", flush=True)
            return 1
    print("EXECUCAO_ENCERRADA: conferir três autorizações e documentos no banco.", flush=True)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--lote-id", type=UUID, required=True)
    parser.add_argument("--tarefa", type=UUID, action="append", required=True)
    parser.add_argument("--executar", action="store_true")
    try:
        raise SystemExit(asyncio.run(executar(parser.parse_args())))
    except Exception as exc:
        # Não imprimir exceções de bibliotecas que podem conter dados/segredos.
        print(f"CONTINGENCIA_BLOQUEADA ({type(exc).__name__}); nenhuma repetição automática.", flush=True)
        raise SystemExit(1) from None
