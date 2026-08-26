"""Downloads da tela final, testados sem abrir Chromium real."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import pytest

from src.flows.emissao import (
    Destinatario,
    Emitente,
    FalhaDownloadDocumento,
    Tarefa,
    baixar_documentos,
    extrair_metadados_xml,
)


class DownloadFalso:
    def __init__(self, falha: str | None = None, conteudo: bytes | None = None) -> None:
        self.falha = falha
        self.conteudo = conteudo
        self.destino: str | None = None

    async def failure(self) -> str | None:
        return self.falha

    async def save_as(self, destino: str) -> None:
        self.destino = destino
        conteudo = self.conteudo or (
            b"%PDF-1.7\nconteudo"
            if destino.endswith(".pdf")
            else b"<?xml version='1.0'?><nfe/>"
        )
        Path(destino).write_bytes(conteudo)


def test_extrai_prova_fiscal_do_xml_autorizado(tmp_path):
    caminho = tmp_path / "autorizada.xml"
    caminho.write_text("""<nfeProc><NFe><infNFe Id="NFe12345678901234567890123456789012345678901234"><ide><nNF>321</nNF></ide></infNFe></NFe><protNFe><infProt><cStat>100</cStat><chNFe>12345678901234567890123456789012345678901234</chNFe><nProt>141260000000001</nProt></infProt></protNFe></nfeProc>""", encoding="utf-8")
    dados = extrair_metadados_xml(str(caminho))
    assert dados.numero == "321"
    assert dados.codigo_status == "100"


def test_xml_sem_status_autorizado_e_recusado(tmp_path):
    caminho = tmp_path / "rejeitada.xml"
    caminho.write_text("""<nfeProc><NFe><infNFe Id="NFe12345678901234567890123456789012345678901234"><ide><nNF>1</nNF></ide></infNFe></NFe><protNFe><infProt><cStat>999</cStat><nProt>1</nProt></infProt></protNFe></nfeProc>""", encoding="utf-8")
    with pytest.raises(FalhaDownloadDocumento, match="autorização"):
        extrair_metadados_xml(str(caminho))


class EsperaDownloadFalsa:
    def __init__(self, download: DownloadFalso) -> None:
        self.value = self._valor(download)

    async def _valor(self, download: DownloadFalso) -> DownloadFalso:
        return download

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None


class BotaoFalso:
    def __init__(self, nome: str, cliques: list[str]) -> None:
        self.nome = nome
        self.cliques = cliques

    async def click(self, *, timeout: int) -> None:
        assert timeout == 60_000
        self.cliques.append(self.nome)


class PaginaFalsa:
    def __init__(self, downloads: list[DownloadFalso]) -> None:
        self.downloads = downloads
        self.cliques: list[str] = []

    def expect_download(self, *, timeout: int):
        assert timeout == 60_000
        return EsperaDownloadFalsa(self.downloads.pop(0))

    def get_by_role(self, papel: str, *, name: str, exact: bool) -> BotaoFalso:
        assert papel == "button"
        assert exact is True
        assert name in {"Baixar XML", "Visualizar DANFE"}
        return BotaoFalso(name, self.cliques)


def _tarefa() -> Tarefa:
    return Tarefa(
        tarefa_id="TAREFA/TESTE",
        cliente_id="CLIENTE",
        emitente=Emitente(valor_select="1"),
        destinatario=Destinatario(
            cnpj="00000000000100",
            indicador_ie="CONTRIBUINTE",
            razao_social="Cliente",
            cep="80000000",
            numero_endereco="1",
        ),
        nome_cliente="Mercado do Bairro",
        nome_emitente="Graalys",
        numero_distribuicao=42,
    )


def _logger() -> logging.Logger:
    logger = logging.getLogger("teste-download-documentos")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    return logger


def test_baixa_xml_e_danfe_com_nomes_proprios(tmp_path: Path) -> None:
    pagina = PaginaFalsa([DownloadFalso(), DownloadFalso()])

    resultado = asyncio.run(baixar_documentos(pagina, _tarefa(), str(tmp_path), _logger()))

    assert pagina.cliques == ["Baixar XML", "Visualizar DANFE"]
    assert Path(resultado["xml_path"]).is_file()
    assert Path(resultado["pdf_path"]).is_file()
    assert Path(resultado["xml_path"]).suffix == ".xml"
    assert Path(resultado["pdf_path"]).suffix == ".pdf"
    assert "Mercado-do-Bairro" in resultado["pdf_path"]
    assert "Graalys" in resultado["pdf_path"]
    assert "Distribuicao-000042" in resultado["pdf_path"]


def test_falha_de_download_para_sem_expor_resposta_fiscal(tmp_path: Path) -> None:
    pagina = PaginaFalsa([DownloadFalso("resposta interna da Receita")])

    with pytest.raises(FalhaDownloadDocumento, match="falha no download"):
        asyncio.run(baixar_documentos(pagina, _tarefa(), str(tmp_path), _logger()))

    assert pagina.cliques == ["Baixar XML"]


def test_resposta_html_disfarcada_de_xml_e_removida(tmp_path: Path) -> None:
    pagina = PaginaFalsa(
        [DownloadFalso(conteudo=b"<!doctype html><html><body>erro</body></html>")]
    )

    with pytest.raises(FalhaDownloadDocumento, match="formato esperado"):
        asyncio.run(baixar_documentos(pagina, _tarefa(), str(tmp_path), _logger()))

    assert list(tmp_path.iterdir()) == []


def test_xml_malformado_e_removido(tmp_path: Path) -> None:
    pagina = PaginaFalsa([DownloadFalso(conteudo=b"<nfeProc><NFe></nfeProc>")])

    with pytest.raises(FalhaDownloadDocumento, match="formato esperado"):
        asyncio.run(baixar_documentos(pagina, _tarefa(), str(tmp_path), _logger()))

    assert list(tmp_path.iterdir()) == []
