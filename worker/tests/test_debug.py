"""
Testa rodar_etapa() sem precisar de um navegador real — usa um objeto
"page" falso que só sabe fazer screenshot e pausar, pra checar a lógica de
logging/screenshot/pause sem depender do Playwright de verdade.
"""
import logging
import os
import tempfile

import pytest

from src.utils.debug import rodar_etapa


class PageFalsa:
    def __init__(self):
        self.screenshots = []
        self.pausado = False

    def screenshot(self, path, full_page=True):
        self.screenshots.append(path)

    def pause(self):
        self.pausado = True


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste-debug")
    logger.addHandler(logging.NullHandler())
    return logger


def test_etapa_bem_sucedida_nao_tira_screenshot_nem_pausa():
    page = PageFalsa()
    with tempfile.TemporaryDirectory() as tmp:
        resultado = rodar_etapa("etapa ok", page, _logger_silencioso(), tmp, lambda: 42)

    assert resultado == 42
    assert page.screenshots == []
    assert page.pausado is False


def test_etapa_com_falha_tira_screenshot_e_repropaga_excecao(monkeypatch):
    # O comportamento esperado deste teste independe do .env local.
    monkeypatch.delenv("INSPECIONAR", raising=False)
    page = PageFalsa()

    def falha():
        raise RuntimeError("seletor não encontrado")

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(RuntimeError, match="seletor não encontrado"):
            rodar_etapa("etapa com falha", page, _logger_silencioso(), tmp, falha)

        assert len(page.screenshots) == 1
        assert os.path.dirname(page.screenshots[0]) == tmp
        assert "etapa-com-falha" in page.screenshots[0]

    assert page.pausado is False  # INSPECIONAR não estava setado


def test_etapa_com_falha_e_inspecionar_true_chama_pause(monkeypatch):
    monkeypatch.setenv("INSPECIONAR", "true")
    page = PageFalsa()

    def falha():
        raise RuntimeError("boom")

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(RuntimeError):
            rodar_etapa("etapa", page, _logger_silencioso(), tmp, falha)

    assert page.pausado is True


def test_screenshot_falho_nao_impede_excecao_original_de_propagar():
    class PageQuebrada(PageFalsa):
        def screenshot(self, path, full_page=True):
            raise OSError("disco cheio")

    page = PageQuebrada()

    def falha():
        raise ValueError("erro real da etapa")

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(ValueError, match="erro real da etapa"):
            rodar_etapa("etapa", page, _logger_silencioso(), tmp, falha)
