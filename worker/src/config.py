"""
Carregamento de configuração e credenciais.

RF05 / RNF02: credenciais nunca ficam hardcoded no código-fonte. Nesta fase
local elas vêm de variáveis de ambiente (.env, fora do controle de versão).
Quando o worker migrar para a VM (Fase 6), avaliar Supabase Vault ou um
secrets manager em vez de variáveis de ambiente puras.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class CredencialCliente:
    cliente_id: str
    login: str
    senha: str
    identidade_esperada: str | None = None


@dataclass(frozen=True)
class Config:
    sistema_fiscal_url: str
    headless: bool
    modo_operacao: str  # "simulacao" | "conferencia" | "automatico" (ver seção 20 do doc. de visão)
    download_dir: str
    log_dir: str
    clientes_ativos: tuple[str, ...]
    inspecionar: bool
    testar_navegacao_emissao: bool


def carregar_config() -> Config:
    clientes_raw = os.getenv("CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_B,CLIENTE_C")
    clientes_ativos = tuple(c.strip() for c in clientes_raw.split(",") if c.strip())

    return Config(
        sistema_fiscal_url=_obrigatorio("SISTEMA_FISCAL_URL"),
        headless=os.getenv("HEADLESS", "false").lower() == "true",
        modo_operacao=os.getenv("MODO_OPERACAO", "conferencia"),
        download_dir=os.getenv("DOWNLOAD_DIR", "./downloads"),
        log_dir=os.getenv("LOG_DIR", "./logs"),
        clientes_ativos=clientes_ativos,
        inspecionar=os.getenv("INSPECIONAR", "false").lower() == "true",
        testar_navegacao_emissao=(
            os.getenv("TESTAR_NAVEGACAO_EMISSAO", "false").lower() == "true"
        ),
    )


def carregar_credencial(prefixo_cliente: str) -> CredencialCliente:
    """
    Ex: carregar_credencial("CLIENTE_A") lê CLIENTE_A_LOGIN e CLIENTE_A_SENHA
    do .env. Um prefixo por cliente, para manter as 3 sessões independentes
    (RF14) com credenciais isoladas.
    """
    return CredencialCliente(
        cliente_id=prefixo_cliente,
        login=_obrigatorio(f"{prefixo_cliente}_LOGIN"),
        senha=_obrigatorio(f"{prefixo_cliente}_SENHA"),
        identidade_esperada=os.getenv(f"{prefixo_cliente}_IDENTIDADE_ESPERADA") or None,
    )


def _obrigatorio(nome: str) -> str:
    valor = os.getenv(nome)
    if not valor:
        raise RuntimeError(
            f"Variável de ambiente obrigatória não definida: {nome}. "
            "Copie .env.example para .env e preencha."
        )
    return valor
