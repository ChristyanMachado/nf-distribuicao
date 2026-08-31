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
import json
import logging
import os
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


@dataclass(frozen=True)
class ManifestoUploadPendente:
    """Referência privada para retomar um upload sem reabrir a Receita."""

    tarefa_id: str
    reserva_token: str
    documentos: dict[str, str]
    hashes: dict[str, str]
    caminho: Path = field(repr=False)


_NOME_DIRETORIO_PENDENTES = ".uploads-pendentes"
_VERSAO_MANIFESTO = 1


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


def _diretorio_pendentes(download_dir: str) -> Path:
    raiz = Path(download_dir)
    raiz.mkdir(parents=True, exist_ok=True)
    if raiz.is_symlink() or not raiz.is_dir():
        raise FalhaStorageDocumentos("Diretório de documentos locais é inválido.")
    diretorio = raiz / _NOME_DIRETORIO_PENDENTES
    diretorio.mkdir(mode=0o700, exist_ok=True)
    if diretorio.is_symlink() or not diretorio.is_dir():
        raise FalhaStorageDocumentos("Diretório de recuperação de documentos é inválido.")
    try:
        os.chmod(diretorio, 0o700)
    except OSError:
        # Windows não possui a mesma semântica de permissões POSIX; o diretório
        # continua protegido pela pasta local privada do Worker.
        pass
    return diretorio


def _documentos_para_manifesto(
    download_dir: str,
    documentos: Mapping[str, str],
) -> tuple[dict[str, str], dict[str, str]]:
    if set(documentos) != {"xml_path", "pdf_path"}:
        raise FalhaStorageDocumentos("Conjunto de documentos fiscais incompleto.")
    raiz = Path(download_dir).resolve(strict=True)
    if raiz.is_symlink() or not raiz.is_dir():
        raise FalhaStorageDocumentos("Diretório de documentos locais é inválido.")

    caminhos: dict[str, str] = {}
    hashes: dict[str, str] = {}
    for chave, extensao in (("xml_path", ".xml"), ("pdf_path", ".pdf")):
        arquivo_original = Path(documentos[chave])
        if arquivo_original.is_symlink():
            raise FalhaStorageDocumentos("Documento local não pode ser link simbólico.")
        try:
            arquivo = arquivo_original.resolve(strict=True)
        except OSError as exc:
            raise FalhaStorageDocumentos("Documento local não está disponível.") from exc
        if (
            not arquivo.is_relative_to(raiz)
            or not arquivo.is_file()
            or arquivo.suffix.lower() != extensao
        ):
            raise FalhaStorageDocumentos("Documento local não pertence ao diretório seguro.")
        conteudo = arquivo.read_bytes()
        caminhos[chave] = str(arquivo)
        hashes[chave] = hashlib.sha256(conteudo).hexdigest()
    return caminhos, hashes


def criar_manifesto_upload_pendente(
    download_dir: str,
    tarefa_id: str,
    reserva_token: str,
    documentos: Mapping[str, str],
) -> ManifestoUploadPendente:
    """Persiste os documentos baixados antes do upload.

    O manifesto fica no volume privado do Worker e não entra no banco nem em
    logs. Assim, uma queda entre a autorização e o Storage pode ser retomada
    posteriormente sem tocar novamente no portal fiscal.
    """

    try:
        tarefa = str(UUID(tarefa_id))
        token = str(UUID(reserva_token))
    except (TypeError, ValueError) as exc:
        raise FalhaStorageDocumentos("Identificador de recuperação inválido.") from exc
    caminhos, hashes = _documentos_para_manifesto(download_dir, documentos)
    diretorio = _diretorio_pendentes(download_dir)
    caminho = diretorio / f"{tarefa}.json"
    corpo = {
        "versao": _VERSAO_MANIFESTO,
        "tarefa_id": tarefa,
        "reserva_token": token,
        "documentos": caminhos,
        "hashes": hashes,
    }
    serializado = json.dumps(corpo, sort_keys=True, separators=(",", ":"))
    if caminho.exists():
        existente = carregar_manifesto_upload_pendente(download_dir, caminho)
        if (
            existente.reserva_token == token
            and existente.documentos == caminhos
            and existente.hashes == hashes
        ):
            return existente
        raise FalhaStorageDocumentos("Já existe recuperação pendente diferente para a tarefa.")

    temporario = caminho.with_suffix(".json.tmp")
    try:
        temporario.write_text(serializado, encoding="utf-8")
        os.chmod(temporario, 0o600)
        os.replace(temporario, caminho)
    finally:
        if temporario.exists():
            temporario.unlink(missing_ok=True)
    return ManifestoUploadPendente(tarefa, token, caminhos, hashes, caminho)


def listar_manifestos_upload_pendente(download_dir: str) -> tuple[Path, ...]:
    """Lista manifestos, sem interpretar nem registrar seu conteúdo."""

    diretorio = _diretorio_pendentes(download_dir)
    return tuple(sorted(caminho for caminho in diretorio.glob("*.json") if caminho.is_file()))


def carregar_manifesto_upload_pendente(
    download_dir: str,
    caminho: Path,
) -> ManifestoUploadPendente:
    """Lê e valida um manifesto privado e seus hashes originais."""

    diretorio = _diretorio_pendentes(download_dir).resolve(strict=True)
    if caminho.is_symlink() or caminho.parent.resolve(strict=True) != diretorio:
        raise FalhaStorageDocumentos("Manifesto de recuperação fora do diretório seguro.")
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        tarefa = str(UUID(dados["tarefa_id"]))
        token = str(UUID(dados["reserva_token"]))
        documentos = dados["documentos"]
        hashes = dados["hashes"]
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise FalhaStorageDocumentos("Manifesto de recuperação inválido.") from exc
    if (
        dados.get("versao") != _VERSAO_MANIFESTO
        or not isinstance(documentos, dict)
        or not isinstance(hashes, dict)
        or caminho.name != f"{tarefa}.json"
    ):
        raise FalhaStorageDocumentos("Manifesto de recuperação inválido.")
    caminhos, hashes_atuais = _documentos_para_manifesto(download_dir, documentos)
    if hashes != hashes_atuais or set(hashes) != {"xml_path", "pdf_path"}:
        raise FalhaStorageDocumentos("Documento pendente foi alterado ou está incompleto.")
    return ManifestoUploadPendente(tarefa, token, caminhos, dict(hashes), caminho)


def remover_manifesto_upload_pendente(manifesto: ManifestoUploadPendente) -> None:
    """Remove a referência somente após confirmação banco + Storage."""

    if manifesto.caminho.is_symlink() or manifesto.caminho.name != f"{manifesto.tarefa_id}.json":
        raise FalhaStorageDocumentos("Manifesto de recuperação inválido para remoção.")
    manifesto.caminho.unlink(missing_ok=True)


def _url_objeto(config: ConfigStorageDocumentos, caminho: str, *, autenticado: bool) -> str:
    prefixo = "authenticated" if autenticado else ""
    partes = ["storage", "v1", "object"]
    if prefixo:
        partes.append(prefixo)
    partes.extend((config.bucket, *caminho.split("/")))
    return f"{config.base_url}/{'/'.join(quote(parte, safe='') for parte in partes)}"


def _url_remocao(config: ConfigStorageDocumentos) -> str:
    """Endpoint de remoção em lote do Storage, sem caminho controlável."""

    return f"{config.base_url}/storage/v1/object/{quote(config.bucket, safe='')}"


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


def _remover_documentos(
    config: ConfigStorageDocumentos,
    tarefa_id: str,
    *,
    pdf_path: str,
    xml_path: str,
) -> None:
    """Remove exatamente o XML/DANFE validado de uma nota vencida.

    A API do Storage é a única autoridade para exclusão física. Uma falha não
    altera o banco; assim a próxima tentativa continua sabendo quais objetos
    precisam ser eliminados.
    """

    if not (
        caminho_storage_valido(pdf_path, tarefa_id, "danfe")
        and caminho_storage_valido(xml_path, tarefa_id, "xml")
    ):
        raise FalhaStorageDocumentos("Caminho de documento vencido é inválido.")
    corpo = json.dumps(
        {"prefixes": [xml_path, pdf_path]},
        separators=(",", ":"),
    ).encode("utf-8")
    status, _ = _requisicao(
        "DELETE",
        _url_remocao(config),
        {
            **_headers_autenticacao(config.chave_secreta),
            "content-type": "application/json",
        },
        corpo,
    )
    if status not in {200, 204}:
        raise FalhaStorageDocumentos("O Storage não confirmou a remoção dos documentos.")


async def remover_documentos_expirados(
    config: ConfigStorageDocumentos,
    tarefa_id: str,
    *,
    pdf_path: str,
    xml_path: str,
) -> None:
    """Executa a remoção em thread, sem bloquear o laço assíncrono."""

    await asyncio.to_thread(
        _remover_documentos,
        config,
        tarefa_id,
        pdf_path=pdf_path,
        xml_path=xml_path,
    )


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
