import asyncio
from datetime import datetime, timezone
import logging
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from src.impressao_roteiro import ConfigImpressaoRoteiro, carregar_config_impressao, processar_uma_impressao


def test_impressao_desligada_por_padrao(monkeypatch):
    monkeypatch.delenv("IMPRIMIR_ROTEIROS", raising=False)
    assert carregar_config_impressao() is None


def test_impressao_recusa_origem_insegura(monkeypatch, tmp_path):
    monkeypatch.setenv("IMPRIMIR_ROTEIROS", "true")
    monkeypatch.setenv("IMPRESSAO_WEB_URL", "http://localhost")
    monkeypatch.setenv("IMPRESSORA_NOME", "Teste")
    monkeypatch.setenv("SUMATRA_PDF_EXE", str(tmp_path / "SumatraPDF.exe"))
    monkeypatch.setenv("IMPRIMIR_ROTEIROS_DESDE", "2026-09-12T00:00:00-03:00")
    with pytest.raises(RuntimeError, match="HTTPS"):
        carregar_config_impressao()


def test_falha_antes_do_spool_marca_erro(tmp_path):
    configuracao = ConfigImpressaoRoteiro("https://app.exemplo", "Impressora", tmp_path / "sumatra.exe", datetime.now(timezone.utc))
    fonte = type("Fonte", (), {"worker_id": "worker", "_conexao": None})()
    chamadas = []
    async def chamar(_fonte, sql, *args):
        chamadas.append((sql, args))
        if "reservar" in sql:
            return {"id": "00000000-0000-0000-0000-000000000001", "token": "00000000-0000-0000-0000-000000000002"}
        return True
    with patch("src.impressao_roteiro._chamar", side_effect=chamar), patch("src.impressao_roteiro._baixar_html", side_effect=RuntimeError("rede")):
        assert asyncio.run(processar_uma_impressao(fonte, configuracao, str(tmp_path), logging.getLogger("teste")))
    assert any(args[2] == "ERRO" for sql, args in chamadas if "finalizar" in sql)
