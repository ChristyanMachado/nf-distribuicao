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
    emitente: str | None = None
    
    def __repr__(self) -> str:
        # RNF02: dataclass por padrão gera um __repr__ que expõe TODOS os
        # campos em texto puro — incluindo senha e o CPF de login. Isso é
        # perigoso porque um dev (humano ou IA) pode logar/formatar este
        # objeto inteiro sem perceber (ex: `logger.info(f"Falha: {credencial}")`)
        # e vazar a senha pro arquivo de log. Sobrescrito explicitamente.
        return f"CredencialCliente(cliente_id={self.cliente_id!r}, login='***', senha='***')"


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
    # RF13 passos 4-10 — preenche até Transporte (sem clicar Emitir). Exige
    # testar_navegacao_emissao=true, porque depende de já estar na tela de
    # emissão. Validado em carregar_config() abaixo.
    testar_preenchimento_completo: bool
    # Limite opcional de contextos/abas simultâneos. None = sem limite (hoje
    # equivalente a len(clientes_ativos), já que só 3 foram testados). Existe
    # pra quando o worker crescer de 3 pra N tarefas num servidor com CPU/RAM
    # limitados — configurar explicitamente via MAX_CONCORRENCIA no .env.
    max_concorrencia: int | None
    # "teste" usa o ambiente NFP-e TESTES (homologação, sem valor fiscal) da
    # Receita PR — RECOMENDADO durante desenvolvimento pra não poluir o
    # histórico fiscal real com tentativas. "normal" usa produção.
    ambiente_emissao: str


def carregar_config() -> Config:
    clientes_raw = os.getenv("CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_B,CLIENTE_C")
    clientes_ativos = tuple(c.strip() for c in clientes_raw.split(",") if c.strip())

    testar_navegacao_emissao = os.getenv("TESTAR_NAVEGACAO_EMISSAO", "false").lower() == "true"
    testar_preenchimento_completo = (
        os.getenv("TESTAR_PREENCHIMENTO_COMPLETO", "false").lower() == "true"
    )

    if testar_preenchimento_completo and not testar_navegacao_emissao:
        raise RuntimeError(
            "TESTAR_PREENCHIMENTO_COMPLETO=true exige TESTAR_NAVEGACAO_EMISSAO=true "
            "(o preenchimento parte da tela de emissão, que só é alcançada por esse "
            "outro teste)."
        )

    max_concorrencia_raw = os.getenv("MAX_CONCORRENCIA")
    max_concorrencia: int | None = None
    if max_concorrencia_raw:
        try:
            max_concorrencia = int(max_concorrencia_raw)
        except ValueError as exc:
            raise RuntimeError(
                f"MAX_CONCORRENCIA precisa ser um número inteiro, recebeu: {max_concorrencia_raw!r}"
            ) from exc
        if max_concorrencia < 1:
            raise RuntimeError(f"MAX_CONCORRENCIA precisa ser >= 1, recebeu: {max_concorrencia}")

    # Padrão "teste" de propósito (21/08): durante desenvolvimento, o
    # ambiente de homologação evita poluir o histórico fiscal real. Trocar
    # pra "normal" precisa ser uma decisão explícita, não o padrão.
    ambiente_emissao = os.getenv("AMBIENTE_EMISSAO", "teste").strip().lower()
    if ambiente_emissao not in {"normal", "teste"}:
        raise RuntimeError(
            f"AMBIENTE_EMISSAO precisa ser 'normal' ou 'teste', recebeu: {ambiente_emissao!r}"
        )

    return Config(
        sistema_fiscal_url=_obrigatorio("SISTEMA_FISCAL_URL"),
        headless=os.getenv("HEADLESS", "false").lower() == "true",
        modo_operacao=os.getenv("MODO_OPERACAO", "conferencia"),
        download_dir=os.getenv("DOWNLOAD_DIR", "./downloads"),
        log_dir=os.getenv("LOG_DIR", "./logs"),
        clientes_ativos=clientes_ativos,
        inspecionar=os.getenv("INSPECIONAR", "false").lower() == "true",
        testar_navegacao_emissao=testar_navegacao_emissao,
        testar_preenchimento_completo=testar_preenchimento_completo,
        max_concorrencia=max_concorrencia,
        ambiente_emissao=ambiente_emissao,
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
        # Necessário apenas quando TESTAR_PREENCHIMENTO_COMPLETO=true. Login
        # e navegação têm de continuar possíveis sem esse dado fiscal.
        emitente=(os.getenv(f"{prefixo_cliente}_EMITENTE") or "").strip() or None,
    )


def _obrigatorio(nome: str) -> str:
    valor = os.getenv(nome)
    if not valor:
        raise RuntimeError(
            f"Variável de ambiente obrigatória não definida: {nome}. "
            "Copie .env.example para .env e preencha."
        )
    return valor
