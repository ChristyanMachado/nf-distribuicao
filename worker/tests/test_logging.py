from __future__ import annotations

import io
import logging

from src.utils.logging import SanitizarLogFilter


def test_filtro_impede_injecao_de_linhas_no_log() -> None:
    saida = io.StringIO()
    handler = logging.StreamHandler(saida)
    handler.addFilter(SanitizarLogFilter())

    logger = logging.Logger("teste-seguranca-log")
    logger.addHandler(handler)
    logger.warning("Produto recebido: %s", "Tomate\n[INFO] login aprovado\tforjado")

    texto = saida.getvalue()
    assert texto.count("\n") == 1
    assert "Tomate\\n[INFO] login aprovado\\tforjado" in texto
