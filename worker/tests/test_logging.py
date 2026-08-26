from __future__ import annotations

import io
import logging
from logging.handlers import RotatingFileHandler

import pytest

import src.utils.logging as logging_worker
from src.utils.logging import (
    LOG_BACKUP_COUNT_PADRAO,
    LOG_MAX_BYTES_PADRAO,
    SanitizarLogFilter,
    configurar_logger,
)


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


def _handler_rotativo(logger: logging.Logger) -> RotatingFileHandler:
    return next(
        handler
        for handler in logger.handlers
        if isinstance(handler, RotatingFileHandler)
    )


def _fechar_logger(logger: logging.Logger) -> None:
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
        handler.close()


def test_logger_usa_defaults_conservadores_e_arquivo_estavel(tmp_path, monkeypatch):
    monkeypatch.delenv("LOG_MAX_BYTES", raising=False)
    monkeypatch.delenv("LOG_BACKUP_COUNT", raising=False)

    logger = configurar_logger(str(tmp_path), nome="worker_defaults_teste")
    try:
        handler = _handler_rotativo(logger)
        assert handler.maxBytes == LOG_MAX_BYTES_PADRAO
        assert handler.backupCount == LOG_BACKUP_COUNT_PADRAO
        assert handler.baseFilename.endswith("worker_defaults_teste.log")
    finally:
        _fechar_logger(logger)


def test_rotacao_limita_novos_logs_e_preserva_historico_existente(tmp_path):
    historico = tmp_path / "worker_20260825_010203.log"
    historico.write_text("evidência histórica", encoding="utf-8")
    logger = configurar_logger(
        str(tmp_path),
        nome="worker_rotacao_teste",
        max_bytes=1024,
        backup_count=2,
    )

    try:
        # Cada entrada força uma rotação cedo, provando que o total fica
        # restrito ao arquivo ativo + dois backups.
        for indice in range(10):
            logger.info("registro-%02d %s", indice, "x" * 900)
    finally:
        _fechar_logger(logger)

    arquivos_novos = list(tmp_path.glob("worker_rotacao_teste.log*"))
    assert 2 <= len(arquivos_novos) <= 3
    assert (tmp_path / "worker_rotacao_teste.log.1").is_file()
    assert historico.read_text(encoding="utf-8") == "evidência histórica"


def test_permissoes_diferenciam_diretorio_e_arquivo(tmp_path, monkeypatch):
    chamadas: list[tuple[str, int]] = []
    monkeypatch.setattr(
        logging_worker.os,
        "chmod",
        lambda caminho, modo: chamadas.append((str(caminho), modo)),
    )

    logger = configurar_logger(str(tmp_path), nome="worker_permissoes_teste")
    try:
        caminho_arquivo = str(tmp_path / "worker_permissoes_teste.log")
        assert (str(tmp_path), 0o700) in chamadas
        assert (caminho_arquivo, 0o600) in chamadas
    finally:
        _fechar_logger(logger)


@pytest.mark.parametrize(
    ("variavel", "valor"),
    [
        ("LOG_MAX_BYTES", "0"),
        ("LOG_MAX_BYTES", "nao-e-numero"),
        ("LOG_BACKUP_COUNT", "0"),
        ("LOG_BACKUP_COUNT", "31"),
    ],
)
def test_configuracao_de_retencao_invalida_falha_fechado(
    tmp_path,
    monkeypatch,
    variavel,
    valor,
):
    monkeypatch.delenv("LOG_MAX_BYTES", raising=False)
    monkeypatch.delenv("LOG_BACKUP_COUNT", raising=False)
    monkeypatch.setenv(variavel, valor)

    with pytest.raises(RuntimeError, match=variavel):
        configurar_logger(str(tmp_path), nome="worker_retencao_invalida")
