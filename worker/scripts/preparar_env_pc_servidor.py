"""Prepara o env privado do PC servidor sem expor ou reutilizar o papel antigo."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

from dotenv import dotenv_values


_CAMPO_CREDENCIAL = (
    "LOGIN|SENHA|IDENTIDADE_ESPERADA|EMITENTE|NOME_EMITENTE"
)
_CREDENCIAL = re.compile(
    rf"^(?P<referencia>[A-Z][A-Z0-9_]{{2,63}})_(?P<campo>{_CAMPO_CREDENCIAL})$"
)
_WORKER_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _serializar(valores: dict[str, str]) -> str:
    return "".join(
        nome + "='" + valor.replace("\\", "\\\\").replace("'", "\\'") + "'\n"
        for nome, valor in valores.items()
    )


def preparar(
    origem: Path,
    destino: Path,
    *,
    worker_id: str = "pc-servidor-01",
    ambiente_emissao: str = "teste",
    producao_fiscal: bool = False,
) -> dict[str, object]:
    if origem.resolve() == destino.resolve():
        raise ValueError("Origem e destino precisam ser diferentes.")
    if not _WORKER_ID.fullmatch(worker_id):
        raise ValueError("WORKER_ID deve ter 1-64 letras, números, _ ou -.")
    if ambiente_emissao not in {"teste", "normal"}:
        raise ValueError("Ambiente de emissão deve ser teste ou normal.")
    if producao_fiscal and ambiente_emissao != "normal":
        raise ValueError("Produção fiscal exige AMBIENTE_EMISSAO=normal.")
    antigos = {k: v for k, v in dotenv_values(origem, interpolate=False).items() if v}
    credenciais_encontradas = {
        correspondencia.group("referencia")
        for nome in antigos
        if (correspondencia := _CREDENCIAL.fullmatch(nome))
    }
    clientes = sorted(credenciais_encontradas)
    if not clientes or len(clientes) > 20:
        raise RuntimeError(
            "A origem deve conter entre 1 e 20 referências de credencial fiscal."
        )
    obrigatorios = {
        "SUPABASE_SECRET_KEY",
        *(
            f"{cliente}_{campo}"
            for cliente in clientes
            for campo in ("LOGIN", "SENHA", "IDENTIDADE_ESPERADA", "EMITENTE")
        ),
    }
    ausentes = sorted(nome for nome in obrigatorios if not antigos.get(nome))
    if ausentes:
        raise RuntimeError("Configuração operacional de origem está incompleta.")
    url_storage = antigos.get("SUPABASE_URL", "")
    if url_storage != "https://kcukzbszakwrfhbsiihw.supabase.co":
        raise RuntimeError("A origem não pertence ao projeto de produção esperado.")

    valores: dict[str, str] = {
        "APP_ENVIRONMENT": "producao",
        "WORKER_COORDENADO": "true",
        "WORKER_ID": worker_id,
        "WORKER_DATABASE_URL": "",
        "MAX_CONCORRENCIA": "1",
        "WORKER_POLL_SECONDS": "5",
        "WORKER_MAX_CYCLE_SECONDS": "1200",
        "FONTE_TAREFAS": "banco",
        "TESTAR_INTEGRACAO_BANCO": "true",
        "PROCESSAR_FILA_BANCO": "true",
        "MODO_OPERACAO": "automatico",
        "SISTEMA_FISCAL_URL": "https://receita.pr.gov.br/login",
        "AMBIENTE_EMISSAO": ambiente_emissao,
        "TESTAR_NAVEGACAO_EMISSAO": "true",
        "TESTAR_PREENCHIMENTO_COMPLETO": "true",
        "TESTAR_EMISSAO_HOMOLOGACAO": "true" if ambiente_emissao == "teste" else "false",
        "HABILITAR_PRODUCAO_FISCAL": "true" if producao_fiscal else "false",
        "ARMAZENAR_DOCUMENTOS": "true",
        "SUPABASE_URL": url_storage,
        "SUPABASE_SECRET_KEY": antigos["SUPABASE_SECRET_KEY"],
        "SUPABASE_STORAGE_BUCKET": antigos.get("SUPABASE_STORAGE_BUCKET", "documentos-fiscais"),
        "DOCUMENTOS_RETENCAO_DIAS": "30",
        "LIMPAR_DOCUMENTOS_EXPIRADOS": "false",
        "PROCESSAR_RECUPERACOES_DOCUMENTOS": "false",
        "PROCESSAR_CANCELAMENTOS_FISCAIS": "false",
        "IMPRIMIR_ROTEIROS": "false",
        "IMPRESSAO_WEB_URL": "https://nf-distribuicao.vercel.app",
        "IMPRESSORA_NOME": "",
        "SUMATRA_PDF_EXE": r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        "IMPRIMIR_ROTEIROS_DESDE": "2026-09-15T23:59:59-03:00",
        "CLIENTES_ATIVOS": ",".join(clientes),
    }
    for nome, valor in antigos.items():
        if (
            (correspondencia := _CREDENCIAL.fullmatch(nome))
            and correspondencia.group("referencia") in clientes
        ):
            valores[nome] = valor

    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(_serializar(valores), encoding="utf-8")
    conferido = dotenv_values(destino, interpolate=False)
    if dict(conferido) != valores:
        destino.unlink(missing_ok=True)
        raise RuntimeError("O arquivo gerado não preservou a configuração.")
    return {
        "arquivoPreparado": True,
        "clientes": len(clientes),
        "bancoPendente": not bool(valores["WORKER_DATABASE_URL"]),
        "segredosExibidos": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--worker-id", default="pc-servidor-01")
    parser.add_argument("--ambiente-emissao", choices=("teste", "normal"), default="teste")
    parser.add_argument("--producao-fiscal", action="store_true")
    args = parser.parse_args()
    print(json.dumps(preparar(
        args.source,
        args.output,
        worker_id=args.worker_id,
        ambiente_emissao=args.ambiente_emissao,
        producao_fiscal=args.producao_fiscal,
    )))


if __name__ == "__main__":
    main()
