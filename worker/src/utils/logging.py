"""Logging em arquivo + console (RNF07 — observabilidade).

O arquivo ativo usa rotação por tamanho e retenção por quantidade. Assim uma
VM que executa o Worker continuamente não acumula logs sem limite. Arquivos
históricos no formato antigo (com timestamp no nome) são preservados: a
política passa a valer para ``worker.log`` e seus backups, sem apagar uma
evidência anterior de forma automática.
"""
from __future__ import annotations

import logging
import os
import re
from logging.handlers import RotatingFileHandler


LOG_MAX_BYTES_PADRAO = 5 * 1024 * 1024
LOG_BACKUP_COUNT_PADRAO = 7
_LOG_MAX_BYTES_LIMITE = 100 * 1024 * 1024
_LOG_BACKUP_COUNT_LIMITE = 30


class SanitizarLogFilter(logging.Filter):
    """Impede que dados externos fabriquem linhas ou campos falsos no log."""

    def filter(self, record: logging.LogRecord) -> bool:
        mensagem = record.getMessage()
        record.msg = (
            mensagem.replace("\r", "\\r")
            .replace("\n", "\\n")
            .replace("\t", "\\t")
        )
        record.args = ()
        return True


def _restringir_permissoes(caminho: str, *, diretorio: bool = False) -> None:
    """Restringe o caminho ao usuário do processo quando o SO permitir."""

    try:
        # Diretórios precisam do bit de execução para continuarem acessíveis.
        os.chmod(caminho, 0o700 if diretorio else 0o600)
    except OSError:
        # O Windows pode ignorar os bits POSIX; ACLs da VM devem complementar.
        pass


class _RotatingFileHandlerSeguro(RotatingFileHandler):
    """Mantém permissão restrita também depois de cada rotação."""

    def doRollover(self) -> None:  # noqa: N802 - nome definido por logging
        super().doRollover()
        _restringir_permissoes(self.baseFilename)
        for indice in range(1, self.backupCount + 1):
            backup = f"{self.baseFilename}.{indice}"
            if os.path.isfile(backup):
                _restringir_permissoes(backup)


def _inteiro_configuravel(
    nome: str,
    padrao: int,
    *,
    minimo: int,
    maximo: int,
) -> int:
    valor = os.getenv(nome)
    if valor is None or not valor.strip():
        return padrao
    try:
        inteiro = int(valor)
    except ValueError as exc:
        raise RuntimeError(f"{nome} deve ser um número inteiro.") from exc
    if not minimo <= inteiro <= maximo:
        raise RuntimeError(f"{nome} deve estar entre {minimo} e {maximo}.")
    return inteiro


def configurar_logger(
    log_dir: str,
    nome: str = "worker",
    *,
    max_bytes: int | None = None,
    backup_count: int | None = None,
) -> logging.Logger:
    """Cria logger com retenção limitada e sem expor caminhos arbitrários.

    ``LOG_MAX_BYTES`` (padrão 5 MiB) e ``LOG_BACKUP_COUNT`` (padrão 7)
    permitem ajustar a retenção sem alterar código. Os argumentos opcionais
    existem para testes e integração explícita; a chamada atual permanece
    compatível. Pelo menos um backup é obrigatório para não desativar a
    rotação acidentalmente.
    """

    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", nome):
        raise RuntimeError("O nome do logger contém caracteres inválidos.")

    if max_bytes is None:
        max_bytes = _inteiro_configuravel(
            "LOG_MAX_BYTES",
            LOG_MAX_BYTES_PADRAO,
            minimo=1024,
            maximo=_LOG_MAX_BYTES_LIMITE,
        )
    elif not 1024 <= max_bytes <= _LOG_MAX_BYTES_LIMITE:
        raise RuntimeError(
            f"max_bytes deve estar entre 1024 e {_LOG_MAX_BYTES_LIMITE}."
        )

    if backup_count is None:
        backup_count = _inteiro_configuravel(
            "LOG_BACKUP_COUNT",
            LOG_BACKUP_COUNT_PADRAO,
            minimo=1,
            maximo=_LOG_BACKUP_COUNT_LIMITE,
        )
    elif not 1 <= backup_count <= _LOG_BACKUP_COUNT_LIMITE:
        raise RuntimeError(
            f"backup_count deve estar entre 1 e {_LOG_BACKUP_COUNT_LIMITE}."
        )

    os.makedirs(log_dir, exist_ok=True)
    _restringir_permissoes(log_dir, diretorio=True)

    caminho_log = os.path.join(log_dir, f"{nome}.log")
    if os.path.lexists(caminho_log) and os.path.islink(caminho_log):
        raise RuntimeError("O arquivo de log não pode ser um link simbólico.")

    logger = logging.getLogger(nome)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    # Fechar os handlers antigos evita descritores vazando e bloqueios de
    # arquivo no Windows quando o logger é reconfigurado no mesmo processo.
    for handler_antigo in list(logger.handlers):
        logger.removeHandler(handler_antigo)
        handler_antigo.close()

    formato = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"
    )

    handler_arquivo = _RotatingFileHandlerSeguro(
        caminho_log,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    handler_arquivo.setFormatter(formato)
    handler_arquivo.addFilter(SanitizarLogFilter())
    logger.addHandler(handler_arquivo)
    _restringir_permissoes(caminho_log)

    handler_console = logging.StreamHandler()
    handler_console.setFormatter(formato)
    handler_console.addFilter(SanitizarLogFilter())
    logger.addHandler(handler_console)

    return logger
