from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path
from unittest.mock import patch

import pytest

from src.storage_documentos import (
    ConfigStorageDocumentos,
    FalhaStorageDocumentos,
    _headers_autenticacao,
    armazenar_documentos,
    caminho_storage_valido,
)


TAREFA_ID = "11111111-1111-4111-8111-111111111111"


def _config() -> ConfigStorageDocumentos:
    return ConfigStorageDocumentos(
        base_url="https://projeto.supabase.co",
        chave_secreta="segredo-de-teste",
        bucket="documentos-fiscais",
        retencao_dias=365,
    )


def _documentos(tmp_path: Path) -> dict[str, str]:
    xml = tmp_path / "nota.xml"
    pdf = tmp_path / "danfe.pdf"
    xml.write_bytes(b"<nfeProc />")
    pdf.write_bytes(b"%PDF-1.7\n")
    return {"xml_path": str(xml), "pdf_path": str(pdf)}


def test_upload_usa_caminhos_sem_dados_pessoais(tmp_path: Path) -> None:
    chamadas: list[tuple[str, str]] = []

    def requisicao(metodo, url, _headers, _corpo=None):
        chamadas.append((metodo, url))
        return 200, b""

    with patch("src.storage_documentos._requisicao", side_effect=requisicao):
        caminhos = asyncio.run(
            armazenar_documentos(
                _config(),
                TAREFA_ID,
                _documentos(tmp_path),
                logging.getLogger("teste-storage"),
            )
        )

    assert len(chamadas) == 2
    assert all("documentos-fiscais/notas/" in url for _, url in chamadas)
    assert caminho_storage_valido(caminhos["xml_path"], TAREFA_ID, "xml")
    assert caminho_storage_valido(caminhos["pdf_path"], TAREFA_ID, "danfe")


def test_chave_secreta_nova_nao_e_enviada_como_bearer() -> None:
    chave = "sb_secret_" + ("x" * 32)

    assert _headers_autenticacao(chave) == {"apikey": chave}


def test_service_role_legada_ainda_e_enviada_como_bearer() -> None:
    chave = "eyJ" + ("x" * 32)

    assert _headers_autenticacao(chave) == {
        "apikey": chave,
        "authorization": f"Bearer {chave}",
    }


def test_conflito_so_e_idempotente_com_conteudo_identico(tmp_path: Path) -> None:
    documentos = _documentos(tmp_path)
    conteudos = {
        "xml": Path(documentos["xml_path"]).read_bytes(),
        "danfe": Path(documentos["pdf_path"]).read_bytes(),
    }

    def requisicao(metodo, url, _headers, _corpo=None):
        if metodo == "POST":
            return 400, b"duplicado"
        return 200, conteudos["xml" if "/xml-" in url else "danfe"]

    with patch("src.storage_documentos._requisicao", side_effect=requisicao):
        resultado = asyncio.run(
            armazenar_documentos(
                _config(), TAREFA_ID, documentos, logging.getLogger("teste-storage")
            )
        )

    assert hashlib.sha256(conteudos["xml"]).hexdigest() in resultado["xml_path"]


def test_conflito_com_conteudo_divergente_e_recusado(tmp_path: Path) -> None:
    def requisicao(metodo, _url, _headers, _corpo=None):
        return (400, b"duplicado") if metodo == "POST" else (200, b"outro")

    with patch("src.storage_documentos._requisicao", side_effect=requisicao):
        with pytest.raises(FalhaStorageDocumentos, match="não confirmou"):
            asyncio.run(
                armazenar_documentos(
                    _config(),
                    TAREFA_ID,
                    _documentos(tmp_path),
                    logging.getLogger("teste-storage"),
                )
            )
