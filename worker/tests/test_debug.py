"""
Testa rodar_etapa() sem precisar de um navegador real — usa um objeto
"page" falso (Async) que só sabe fazer screenshot e pausar, pra checar a
lógica de logging/screenshot/pause sem depender do Playwright de verdade.
"""
import asyncio
import logging
import os
import tempfile

import pytest

from src.utils.debug import rodar_etapa


class PageFalsa:
    def __init__(self):
        self.screenshots = []
        self.pausado = False

    async def screenshot(self, path, full_page=True):
        self.screenshots.append(path)

    async def pause(self):
        self.pausado = True


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste-debug")
    logger.addHandler(logging.NullHandler())
    return logger


async def _ok():
    return 42


async def _falha(mensagem: str = "seletor não encontrado"):
    raise RuntimeError(mensagem)


def test_etapa_bem_sucedida_nao_tira_screenshot_nem_pausa():
    page = PageFalsa()
    with tempfile.TemporaryDirectory() as tmp:
        resultado = asyncio.run(rodar_etapa("etapa ok", page, _logger_silencioso(), tmp, _ok))

    assert resultado == 42
    assert page.screenshots == []
    assert page.pausado is False


def test_etapa_com_falha_tira_screenshot_e_repropaga_excecao(monkeypatch):
    # O comportamento esperado deste teste independe do .env local.
    monkeypatch.delenv("INSPECIONAR", raising=False)
    monkeypatch.delenv("HEADLESS", raising=False)
    page = PageFalsa()

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(RuntimeError, match="seletor não encontrado"):
            asyncio.run(rodar_etapa("etapa com falha", page, _logger_silencioso(), tmp, _falha))

        assert len(page.screenshots) == 1
        assert os.path.dirname(page.screenshots[0]) == tmp
        assert "etapa-com-falha" in page.screenshots[0]

    assert page.pausado is False  # INSPECIONAR não estava setado


def test_etapa_com_falha_e_inspecionar_true_chama_pause(monkeypatch):
    monkeypatch.setenv("INSPECIONAR", "true")
    monkeypatch.delenv("HEADLESS", raising=False)  # default é "false" (headed)
    page = PageFalsa()

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(RuntimeError):
            asyncio.run(rodar_etapa("etapa", page, _logger_silencioso(), tmp, _falha))

    assert page.pausado is True


def test_inspecionar_true_mas_headless_true_nao_chama_pause(monkeypatch):
    """
    Guard novo (20/08): num servidor/VM headless, page.pause() ficaria
    esperando um humano que nunca aparece — trava a tarefa indefinidamente.
    Com HEADLESS=true, INSPECIONAR deve ser ignorado (só logar um aviso).
    """
    monkeypatch.setenv("INSPECIONAR", "true")
    monkeypatch.setenv("HEADLESS", "true")
    page = PageFalsa()

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(RuntimeError):
            asyncio.run(rodar_etapa("etapa", page, _logger_silencioso(), tmp, _falha))

    assert page.pausado is False
    assert len(page.screenshots) == 1  # screenshot continua acontecendo normalmente


def test_screenshot_falho_nao_impede_excecao_original_de_propagar():
    class PageQuebrada(PageFalsa):
        async def screenshot(self, path, full_page=True):
            raise OSError("disco cheio")

    page = PageQuebrada()

    async def _falha_valor():
        raise ValueError("erro real da etapa")

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(ValueError, match="erro real da etapa"):
            asyncio.run(rodar_etapa("etapa", page, _logger_silencioso(), tmp, _falha_valor))
