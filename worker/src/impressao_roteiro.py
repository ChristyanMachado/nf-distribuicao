"""Impressão segura do roteiro após autorização integral do lote.

Não há retry automático depois do spool: código zero do Sumatra só confirma o
envio à fila local, não que o papel saiu da impressora.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
import json
import logging
import os
from pathlib import Path
import subprocess
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


class FalhaImpressaoRoteiro(RuntimeError):
    pass


@dataclass(frozen=True)
class ConfigImpressaoRoteiro:
    web_url: str
    impressora_nome: str
    sumatra_pdf_exe: Path = field(repr=False)
    desde: datetime


def carregar_config_impressao() -> ConfigImpressaoRoteiro | None:
    if os.getenv("IMPRIMIR_ROTEIROS", "false").lower() != "true":
        return None
    base = (os.getenv("IMPRESSAO_WEB_URL") or "").strip().rstrip("/")
    partes = urlsplit(base)
    if partes.scheme != "https" or not partes.netloc or partes.path or partes.query or partes.fragment:
        raise RuntimeError("IMPRESSAO_WEB_URL precisa ser uma origem HTTPS, sem caminho.")
    nome = (os.getenv("IMPRESSORA_NOME") or "").strip()
    if not nome or len(nome) > 240 or any(ord(c) < 32 for c in nome):
        raise RuntimeError("IMPRESSORA_NOME é obrigatório e inválido.")
    executavel = Path((os.getenv("SUMATRA_PDF_EXE") or "").strip())
    if not executavel.is_absolute() or not executavel.is_file():
        raise RuntimeError("SUMATRA_PDF_EXE precisa apontar para um arquivo absoluto existente.")
    bruto = (os.getenv("IMPRIMIR_ROTEIROS_DESDE") or "").strip()
    try:
        desde = datetime.fromisoformat(bruto.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RuntimeError("IMPRIMIR_ROTEIROS_DESDE precisa ser ISO-8601 com fuso horário.") from exc
    if desde.tzinfo is None:
        raise RuntimeError("IMPRIMIR_ROTEIROS_DESDE precisa informar fuso horário.")
    return ConfigImpressaoRoteiro(base, nome, executavel, desde)


class _SemRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
        return None


def _baixar_html(url: str, token: str) -> str:
    opener = build_opener(_SemRedirect)
    try:
        with opener.open(Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "text/html"}), timeout=20) as resposta:
            if resposta.status != 200 or "text/html" not in resposta.headers.get("Content-Type", ""):
                raise FalhaImpressaoRoteiro("Resposta de roteiro inválida.")
            conteudo = resposta.read(2_000_001)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise FalhaImpressaoRoteiro("Não foi possível obter o roteiro para impressão.") from exc
    if len(conteudo) > 2_000_000:
        raise FalhaImpressaoRoteiro("Roteiro excede o tamanho permitido.")
    return conteudo.decode("utf-8", "strict")


async def _renderizar_pdf(html: str, destino: Path) -> None:
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            context = await browser.new_context(java_script_enabled=False)
            await context.route("**/*", lambda rota: rota.abort())
            page = await context.new_page()
            await page.set_content(html, wait_until="domcontentloaded")
            await page.pdf(path=str(destino), prefer_css_page_size=True, print_background=True)
            await context.close()
        finally:
            await browser.close()


async def _chamar(fonte, sql: str, *args):  # type: ignore[no-untyped-def]
    async with fonte._conexao() as conexao:
        return await conexao.fetchval(sql, *args)


async def processar_uma_impressao(fonte, config: ConfigImpressaoRoteiro, download_dir: str, logger: logging.Logger) -> bool:  # type: ignore[no-untyped-def]
    """Processa no máximo um pedido; retorna se algum pedido foi reservado."""
    bruto = await _chamar(fonte, "SELECT fiscal.reservar_impressao_roteiro($1,$2::timestamptz)", fonte.worker_id, config.desde)
    if not bruto:
        return False
    pedido = json.loads(bruto) if isinstance(bruto, str) else bruto
    try:
        ident = str(UUID(str(pedido["id"]))); token = str(UUID(str(pedido["token"])))
    except (KeyError, ValueError, TypeError) as exc:
        raise FalhaImpressaoRoteiro("Reserva de impressão inválida.") from exc
    diretorio = Path(download_dir).resolve() / ".roteiros-impressos"
    diretorio.mkdir(parents=True, exist_ok=True)
    pdf = diretorio / f"{ident}.pdf"
    iniciou = False
    try:
        html = await asyncio.to_thread(_baixar_html, f"{config.web_url}/api/worker/roteiros/{ident}", token)
        await _renderizar_pdf(html, pdf)
        iniciou = bool(await _chamar(fonte, "SELECT fiscal.iniciar_envio_roteiro($1::uuid,$2::uuid)", ident, token))
        if not iniciou:
            raise FalhaImpressaoRoteiro("Autorização fiscal do roteiro não pôde ser revalidada.")
        criacao = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        resultado = await asyncio.to_thread(subprocess.run, [str(config.sumatra_pdf_exe), "-print-to", config.impressora_nome, "-print-settings", "fit", "-silent", str(pdf)], shell=False, timeout=60, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=criacao)
        if resultado.returncode != 0:
            raise FalhaImpressaoRoteiro("A fila da impressora recusou o roteiro.")
        await _chamar(fonte, "SELECT fiscal.finalizar_impressao_roteiro($1::uuid,$2::uuid,$3,$4)", ident, token, "ENVIADA", None)
        logger.info("Roteiro do lote enviado à fila da impressora.")
    except Exception as exc:  # efeito externo incerto somente após iniciar_envio
        estado = "CONFERIR" if iniciou else "ERRO"
        await _chamar(fonte, "SELECT fiscal.finalizar_impressao_roteiro($1::uuid,$2::uuid,$3,$4)", ident, token, estado, type(exc).__name__)
        logger.error("Impressão do roteiro terminou em %s (%s).", estado, type(exc).__name__)
    finally:
        pdf.unlink(missing_ok=True)
    return True
