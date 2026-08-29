"""Upload privado e idempotente de XML/DANFE para o Supabase Storage.

Os objetos usam somente UUID e hash no caminho remoto. Nomes de clientes,
emitentes e outros dados fiscais permanecem fora da URL. O upload nunca usa
``upsert``: se o objeto já existir, seu conteúdo é baixado e comparado antes
de considerar a repetição segura.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import hashlib
import logging
from pathlib import Path
import re
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


class FalhaStorageDocumentos(RuntimeError):
    """O Storage não confirmou a persistência dos documentos."""


@dataclass(frozen=True)
class ConfigStorageDocumentos:
    base_url: str
    chave_secreta: str = field(repr=False)
    bucket: str
    retencao_dias: int


def _caminho_objeto(tarefa_id: str, tipo: str, caminho_local: str) -> str:
    try:
        tarefa = str(UUID(tarefa_id))
    except (TypeError, ValueError) as exc:
        raise FalhaStorageDocumentos("Identificador da tarefa inválido para o Storage.") from exc
    if tipo not in {"xml", "danfe"}:
        raise FalhaStorageDocumentos("Tipo de documento inválido para o Storage.")
    extensao = "xml" if tipo == "xml" else "pdf"
    arquivo = Path(caminho_local)
    if (
        arquivo.suffix.lower() != f".{extensao}"
        or not arquivo.is_file()
        or arquivo.is_symlink()
    ):
        raise FalhaStorageDocumentos("Documento local não está disponível no formato esperado.")
    digest = hashlib.sha256(arquivo.read_bytes()).hexdigest()
    return f"notas/{tarefa}/{tipo}-{digest}.{extensao}"


def _url_objeto(config: ConfigStorageDocumentos, caminho: str, *, autenticado: bool) -> str:
    prefixo = "authenticated" if autenticado else ""
    partes = ["storage", "v1", "object"]
    if prefixo:
        partes.append(prefixo)
    partes.extend((config.bucket, *caminho.split("/")))
    return f"{config.base_url}/{'/'.join(quote(parte, safe='') for parte in partes)}"


def _requisicao(
    metodo: str,
    url: str,
    headers: Mapping[str, str],
    corpo: bytes | None = None,
) -> tuple[int, bytes]:
    class _SemRedirecionamento(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
            return None

    requisicao = Request(url, data=corpo, headers=dict(headers), method=metodo)
    opener = build_opener(_SemRedirecionamento())
    try:
        with opener.open(requisicao, timeout=30) as resposta:
            return resposta.status, resposta.read(21 * 1024 * 1024)
    except HTTPError as exc:
        return exc.code, exc.read(64 * 1024)
    except (URLError, TimeoutError, OSError) as exc:
        raise FalhaStorageDocumentos("Não foi possível conectar ao Storage privado.") from exc


def _headers_autenticacao(chave: str) -> dict[str, str]:
    """Monta cabeçalhos compatíveis com chaves atuais e legadas.

    As chaves ``sb_secret_`` não são JWT e, por isso, não podem ser enviadas
    como Bearer. A ``service_role`` legada é JWT e ainda precisa do cabeçalho
    Authorization para que o Storage reconheça seu papel.
    """

    headers = {"apikey": chave}
    if not chave.startswith("sb_secret_"):
        headers["authorization"] = f"Bearer {chave}"
    return headers


def _enviar_um(
    config: ConfigStorageDocumentos,
    caminho_local: str,
    caminho_remoto: str,
    content_type: str,
) -> None:
    conteudo = Path(caminho_local).read_bytes()
    headers = {
        **_headers_autenticacao(config.chave_secreta),
        "content-type": content_type,
        "cache-control": "no-store",
        "x-upsert": "false",
    }
    status, _ = _requisicao(
        "POST",
        _url_objeto(config, caminho_remoto, autenticado=False),
        headers,
        conteudo,
    )
    if status in {200, 201}:
        return

    # Uma resposta de conflito pode ser a repetição de um upload concluído
    # cuja confirmação se perdeu. Só aceitamos o objeto remoto se os bytes
    # forem exatamente os mesmos; nunca sobrescrevemos documento fiscal.
    if status in {400, 409}:
        status_existente, remoto = _requisicao(
            "GET",
            _url_objeto(config, caminho_remoto, autenticado=True),
            headers,
        )
        if (
            status_existente == 200
            and hashlib.sha256(remoto).digest() == hashlib.sha256(conteudo).digest()
        ):
            return
    raise FalhaStorageDocumentos("O Storage não confirmou o upload do documento.")


async def armazenar_documentos(
    config: ConfigStorageDocumentos,
    tarefa_id: str,
    documentos: Mapping[str, str],
    logger: logging.Logger,
) -> dict[str, str]:
    """Envia XML e DANFE em paralelo e devolve apenas caminhos internos."""

    if set(documentos) != {"xml_path", "pdf_path"}:
        raise FalhaStorageDocumentos("Conjunto de documentos fiscais incompleto.")
    xml_remoto = _caminho_objeto(tarefa_id, "xml", documentos["xml_path"])
    pdf_remoto = _caminho_objeto(tarefa_id, "danfe", documentos["pdf_path"])

    logger.info("[%s] Enviando XML e DANFE ao Storage privado", tarefa_id)
    await asyncio.gather(
        asyncio.to_thread(
            _enviar_um,
            config,
            documentos["xml_path"],
            xml_remoto,
            "application/xml",
        ),
        asyncio.to_thread(
            _enviar_um,
            config,
            documentos["pdf_path"],
            pdf_remoto,
            "application/pdf",
        ),
    )
    logger.info("[%s] XML e DANFE confirmados no Storage privado", tarefa_id)
    return {"xml_path": xml_remoto, "pdf_path": pdf_remoto}


def caminho_storage_valido(caminho: str, tarefa_id: str, tipo: str) -> bool:
    """Valida caminhos persistidos antes de gravá-los no banco."""

    extensao = "xml" if tipo == "xml" else "pdf"
    nome = "xml" if tipo == "xml" else "danfe"
    try:
        tarefa = str(UUID(tarefa_id))
    except (TypeError, ValueError):
        return False
    return bool(
        re.fullmatch(
            rf"notas/{re.escape(tarefa)}/{nome}-[0-9a-f]{{64}}\.{extensao}",
            caminho,
        )
    )
