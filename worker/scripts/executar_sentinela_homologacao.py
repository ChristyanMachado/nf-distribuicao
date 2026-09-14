"""Emissão sentinela, manual e estritamente limitada à homologação fiscal.

O comando encapsula o ensaio local já validado pelo projeto. Ele nunca lê fila,
nunca armazena no Storage e nunca aceita ambiente de produção. Cada execução
usa uma pasta vazia para que documentos antigos não produzam falso positivo.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from uuid import uuid4

from dotenv import dotenv_values

from src.flows.emissao import FalhaDownloadDocumento, extrair_metadados_xml


RAIZ_WORKER = Path(__file__).resolve().parents[1]
CONFIRMACAO = "--confirmar-emissao-de-teste"


def _ler_cliente_tarefa(caminho: Path) -> str:
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("A tarefa sentinela não pôde ser lida como JSON.") from exc
    if not isinstance(dados, dict):
        raise RuntimeError("A tarefa sentinela deve ser um objeto JSON.")
    cliente_id = str(dados.get("cliente_id", "")).strip()
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,63}", cliente_id):
        raise RuntimeError("cliente_id da tarefa sentinela é inválido.")
    return cliente_id


def montar_ambiente_seguro(
    *, cliente_id: str, env_file: Path, downloads: Path, logs: Path
) -> dict[str, str]:
    if not env_file.is_file():
        raise RuntimeError(f"Arquivo de ambiente não encontrado: {env_file}")
    ambiente = dict(os.environ)
    ambiente.update({k: v for k, v in dotenv_values(env_file).items() if v is not None})
    # Valores vazios também impedem load_dotenv() no filho de restaurar segredos.
    for nome in tuple(ambiente):
        if nome.startswith(("SUPABASE_", "NEXT_PUBLIC_", "WORKER_", "CLIENTE_")) or nome == "DATABASE_URL":
            if not nome.startswith(f"{cliente_id}_"):
                ambiente[nome] = ""
    ambiente["WORKER_DATABASE_URL"] = ""

    obrigatorias = (
        f"{cliente_id}_LOGIN",
        f"{cliente_id}_SENHA",
        f"{cliente_id}_EMITENTE",
    )
    ausentes = [nome for nome in obrigatorias if not ambiente.get(nome, "").strip()]
    if ausentes:
        raise RuntimeError(
            "Credenciais/configuração da sentinela incompletas: " + ", ".join(ausentes)
        )

    # Valores herdados de um terminal de produção são deliberadamente anulados.
    ambiente.update(
        {
            "SISTEMA_FISCAL_URL": "https://receita.pr.gov.br/login",
            "SMOKE_TEST": "true",
            "FONTE_TAREFAS": "arquivo",
            "PROCESSAR_FILA_BANCO": "false",
            "TESTAR_INTEGRACAO_BANCO": "false",
            "TESTAR_NAVEGACAO_EMISSAO": "true",
            "TESTAR_NAVEGACAO_CONSULTA": "false",
            "CONSULTAR_ULTIMO_XML": "false",
            "BAIXAR_DOCUMENTOS_CONSULTA": "false",
            "TESTAR_PREENCHIMENTO_COMPLETO": "true",
            "TESTAR_EMISSAO_HOMOLOGACAO": "true",
            "HABILITAR_PRODUCAO_FISCAL": "false",
            "AMBIENTE_EMISSAO": "teste",
            "MODO_OPERACAO": "conferencia",
            "CLIENTES_ATIVOS": cliente_id,
            "MAX_CONCORRENCIA": "1",
            "HEADLESS": "false",
            "INSPECIONAR": "false",
            "PAUSAR_ANTES_TRANSPORTE": "false",
            "PAUSAR_ANTES_EMITIR": "false",
            "PAUSAR_APOS_DOWNLOADS": "false",
            "PAUSAR_APOS_CONSULTA": "false",
            "WORKER_PERSISTENTE": "false",
            "WORKER_COORDENADO": "false",
            "ARMAZENAR_DOCUMENTOS": "false",
            "LIMPAR_DOCUMENTOS_EXPIRADOS": "false",
            "PROCESSAR_RECUPERACOES_DOCUMENTOS": "false",
            "PROCESSAR_CANCELAMENTOS_FISCAIS": "false",
            "IMPRIMIR_ROTEIROS": "false",
            "DOWNLOAD_DIR": str(downloads),
            "LOG_DIR": str(logs),
        }
    )
    return ambiente


def validar_documentos(downloads: Path) -> dict[str, object]:
    xmls = list(downloads.glob("*.xml"))
    pdfs = list(downloads.glob("*.pdf"))
    if len(xmls) != 1 or len(pdfs) != 1:
        raise RuntimeError(
            "A sentinela exige exatamente um XML e um DANFE novos; "
            f"encontrou XML={len(xmls)} e PDF={len(pdfs)}."
        )
    metadados = extrair_metadados_xml(str(xmls[0]))
    with pdfs[0].open("rb") as arquivo_pdf:
        cabecalho_pdf = arquivo_pdf.read(5)
    if cabecalho_pdf != b"%PDF-":
        raise FalhaDownloadDocumento("O DANFE sentinela não é um PDF válido.")
    return {
        "xml_bytes": xmls[0].stat().st_size,
        "pdf_bytes": pdfs[0].stat().st_size,
        "numero_homologacao": metadados.numero,
        "codigo_status": metadados.codigo_status,
        # Chave e protocolo existem e foram validados, mas não entram no relatório.
        "chave_validada": True,
        "protocolo_validado": True,
    }


def executar(args: argparse.Namespace) -> int:
    if not args.confirmar_emissao_de_teste:
        raise RuntimeError(
            f"Emissão não iniciada. Repita com {CONFIRMACAO} após conferir a tarefa."
        )
    tarefa = Path(args.tarefa).resolve()
    env_file = Path(args.env_file).resolve()
    cliente_id = _ler_cliente_tarefa(tarefa)
    instante = datetime.now(timezone.utc)
    execucao_id = f"{instante.strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    downloads = RAIZ_WORKER / "downloads" / "sentinela" / execucao_id
    logs = RAIZ_WORKER / "logs"
    downloads.mkdir(parents=True, exist_ok=False)
    logs.mkdir(parents=True, exist_ok=True)
    ambiente = montar_ambiente_seguro(
        cliente_id=cliente_id, env_file=env_file, downloads=downloads, logs=logs
    )
    inicio = monotonic()
    processo = subprocess.run(
        [sys.executable, str(RAIZ_WORKER / "main.py"), str(tarefa)],
        cwd=RAIZ_WORKER,
        env=ambiente,
        check=False,
    )
    relatorio: dict[str, object] = {
        "execucao_id": execucao_id,
        "ambiente": "homologacao",
        "escopo": "portal_emissao_downloads",
        "inicio_utc": instante.isoformat(),
        "duracao_segundos": round(monotonic() - inicio, 2),
        "codigo_processo": processo.returncode,
        "sucesso": False,
    }
    if processo.returncode == 0:
        try:
            relatorio.update(validar_documentos(downloads))
            relatorio["sucesso"] = True
        except Exception as exc:
            # O relatório registra somente a classe estável do erro. Mensagens do
            # portal e nomes dos documentos podem conter dados fiscais.
            relatorio["erro_codigo"] = type(exc).__name__
    caminho_relatorio = logs / f"sentinela-{execucao_id}.json"
    caminho_relatorio.write_text(
        json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if relatorio["sucesso"]:
        print(f"SENTINELA_HOMOLOGACAO_OK relatorio={caminho_relatorio}")
        return 0
    print(f"SENTINELA_HOMOLOGACAO_FALHOU relatorio={caminho_relatorio}")
    return processo.returncode or 1


def criar_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tarefa", default="tarefa_real.json")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument(CONFIRMACAO, dest="confirmar_emissao_de_teste", action="store_true")
    return parser


def main() -> int:
    try:
        return executar(criar_parser().parse_args())
    except Exception as exc:  # mensagem curta; segredos nunca são impressos
        print(f"SENTINELA_HOMOLOGACAO_BLOQUEADA ({type(exc).__name__}): {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
