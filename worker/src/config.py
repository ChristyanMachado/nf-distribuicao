"""
Carregamento de configuração e credenciais.

RF05 / RNF02: credenciais nunca ficam hardcoded no código-fonte. Nesta fase
local elas vêm de variáveis de ambiente (.env, fora do controle de versão).
Quando o worker migrar para a VM (Fase 6), avaliar Supabase Vault ou um
secrets manager em vez de variáveis de ambiente puras.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class CredencialCliente:
    cliente_id: str
    login: str
    senha: str
    identidade_esperada: str | None = None
    emitente: str | None = None
    nome_emitente: str | None = None
    
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
    # Libera emissão controlada somente em homologação. Além desta flag, o
    # código exige AMBIENTE_EMISSAO=teste, HEADLESS=false e confere o domínio
    # da Page no instante do clique. O teste fiscal permite até 3 contextos.
    testar_emissao_homologacao: bool
    # Limite opcional de contextos/abas simultâneos. None = sem limite (hoje
    # equivalente a len(clientes_ativos), já que só 3 foram testados). Existe
    # pra quando o worker crescer de 3 pra N tarefas num servidor com CPU/RAM
    # limitados — configurar explicitamente via MAX_CONCORRENCIA no .env.
    max_concorrencia: int | None
    # "teste" usa o ambiente NFP-e TESTES (homologação, sem valor fiscal) da
    # Receita PR — RECOMENDADO durante desenvolvimento pra não poluir o
    # histórico fiscal real com tentativas. "normal" usa produção.
    ambiente_emissao: str
    # Fonte local preserva o fluxo atual. "banco" é ativada apenas por flag
    # explícita e continua limitada ao ambiente de homologação.
    fonte_tarefas: str
    # A URL contém usuário/senha do banco. ``repr=False`` impede que a
    # representação automática da configuração vaze esse segredo em logs,
    # tracebacks de depuração ou consoles interativos.
    worker_database_url: str | None = field(repr=False)
    worker_id: str | None
    testar_integracao_banco: bool
    # False executa apenas um ensaio reserva -> validação -> devolução à fila.
    # True permite abrir o portal e emitir somente quando todas as travas de
    # homologação acima também estiverem ativas.
    processar_fila_banco: bool


def carregar_config() -> Config:
    clientes_raw = os.getenv("CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_B,CLIENTE_C")
    clientes_ativos = tuple(c.strip() for c in clientes_raw.split(",") if c.strip())
    if not clientes_ativos or len(clientes_ativos) > 20:
        raise RuntimeError("CLIENTES_ATIVOS deve conter entre 1 e 20 identificadores.")
    if len(set(clientes_ativos)) != len(clientes_ativos):
        raise RuntimeError("CLIENTES_ATIVOS não pode conter identificadores repetidos.")
    if any(not re.fullmatch(r"[A-Z][A-Z0-9_]{2,63}", item) for item in clientes_ativos):
        raise RuntimeError(
            "CLIENTES_ATIVOS aceita somente letras maiúsculas, números e _."
        )

    testar_navegacao_emissao = os.getenv("TESTAR_NAVEGACAO_EMISSAO", "false").lower() == "true"
    testar_preenchimento_completo = (
        os.getenv("TESTAR_PREENCHIMENTO_COMPLETO", "false").lower() == "true"
    )
    testar_emissao_homologacao = (
        os.getenv("TESTAR_EMISSAO_HOMOLOGACAO", "false").lower() == "true"
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
        if not 1 <= max_concorrencia <= 20:
            raise RuntimeError(
                f"MAX_CONCORRENCIA precisa estar entre 1 e 20, recebeu: {max_concorrencia}"
            )

    # Padrão "teste" de propósito (21/08): durante desenvolvimento, o
    # ambiente de homologação evita poluir o histórico fiscal real. Trocar
    # pra "normal" precisa ser uma decisão explícita, não o padrão.
    ambiente_emissao = os.getenv("AMBIENTE_EMISSAO", "teste").strip().lower()
    if ambiente_emissao not in {"normal", "teste"}:
        raise RuntimeError(
            f"AMBIENTE_EMISSAO precisa ser 'normal' ou 'teste', recebeu: {ambiente_emissao!r}"
        )

    headless = os.getenv("HEADLESS", "false").lower() == "true"
    if testar_emissao_homologacao:
        if not testar_preenchimento_completo:
            raise RuntimeError(
                "TESTAR_EMISSAO_HOMOLOGACAO=true exige "
                "TESTAR_PREENCHIMENTO_COMPLETO=true."
            )
        if ambiente_emissao != "teste":
            raise RuntimeError(
                "TESTAR_EMISSAO_HOMOLOGACAO só é permitido com "
                "AMBIENTE_EMISSAO=teste."
            )
        if headless:
            raise RuntimeError(
                "O primeiro teste de emissão exige HEADLESS=false para conferência visual."
            )
        if len(clientes_ativos) > 3:
            raise RuntimeError(
                "Emissão de homologação permite no máximo 3 clientes por execução."
            )
        if max_concorrencia is not None and max_concorrencia > 3:
            raise RuntimeError(
                "Emissão de homologação permite MAX_CONCORRENCIA de até 3."
            )

    modo_operacao = os.getenv("MODO_OPERACAO", "conferencia").strip().lower()
    if modo_operacao not in {"simulacao", "conferencia", "automatico"}:
        raise RuntimeError("MODO_OPERACAO deve ser simulacao, conferencia ou automatico.")

    fonte_tarefas = os.getenv("FONTE_TAREFAS", "arquivo").strip().lower()
    if fonte_tarefas not in {"arquivo", "banco"}:
        raise RuntimeError("FONTE_TAREFAS deve ser arquivo ou banco.")
    worker_database_url_raw = os.getenv("WORKER_DATABASE_URL")
    worker_database_url = (
        _url_banco_worker(worker_database_url_raw)
        if worker_database_url_raw
        else None
    )
    worker_id = (os.getenv("WORKER_ID") or "").strip() or None
    if worker_id and (
        len(worker_id) > 120
        or any(ord(caractere) < 32 or ord(caractere) == 127 for caractere in worker_id)
    ):
        raise RuntimeError("WORKER_ID deve ter até 120 caracteres visíveis.")
    testar_integracao_banco = os.getenv("TESTAR_INTEGRACAO_BANCO", "false").lower() == "true"
    processar_fila_banco = os.getenv("PROCESSAR_FILA_BANCO", "false").lower() == "true"
    if fonte_tarefas == "banco" and (not worker_database_url or not worker_id):
        raise RuntimeError("FONTE_TAREFAS=banco exige WORKER_DATABASE_URL e WORKER_ID.")
    if fonte_tarefas == "banco" and not testar_integracao_banco:
        raise RuntimeError(
            "FONTE_TAREFAS=banco exige TESTAR_INTEGRACAO_BANCO=true nesta fase controlada."
        )
    if processar_fila_banco and fonte_tarefas != "banco":
        raise RuntimeError("PROCESSAR_FILA_BANCO=true exige FONTE_TAREFAS=banco.")
    if processar_fila_banco and not testar_emissao_homologacao:
        raise RuntimeError(
            "PROCESSAR_FILA_BANCO=true exige todas as travas de "
            "TESTAR_EMISSAO_HOMOLOGACAO=true."
        )

    return Config(
        sistema_fiscal_url=_url_sistema_fiscal(_obrigatorio("SISTEMA_FISCAL_URL")),
        headless=headless,
        modo_operacao=modo_operacao,
        download_dir=os.getenv("DOWNLOAD_DIR", "./downloads"),
        log_dir=os.getenv("LOG_DIR", "./logs"),
        clientes_ativos=clientes_ativos,
        inspecionar=os.getenv("INSPECIONAR", "false").lower() == "true",
        testar_navegacao_emissao=testar_navegacao_emissao,
        testar_preenchimento_completo=testar_preenchimento_completo,
        testar_emissao_homologacao=testar_emissao_homologacao,
        max_concorrencia=max_concorrencia,
        ambiente_emissao=ambiente_emissao,
        fonte_tarefas=fonte_tarefas,
        worker_database_url=worker_database_url,
        worker_id=worker_id,
        testar_integracao_banco=testar_integracao_banco,
        processar_fila_banco=processar_fila_banco,
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
        # Rótulo operacional sem segredo usado nos nomes de XML/DANFE.
        nome_emitente=(os.getenv(f"{prefixo_cliente}_NOME_EMITENTE") or "").strip()
        or None,
    )


def _obrigatorio(nome: str) -> str:
    valor = os.getenv(nome)
    if not valor:
        raise RuntimeError(
            f"Variável de ambiente obrigatória não definida: {nome}. "
            "Copie .env.example para .env e preencha."
        )
    return valor


def _url_sistema_fiscal(valor: str) -> str:
    """Evita enviar credenciais a um host adulterado por erro de configuração."""

    url = urlsplit(valor.strip())
    try:
        porta = url.port
    except ValueError as exc:
        raise RuntimeError(
            "SISTEMA_FISCAL_URL deve ser exatamente o login HTTPS oficial da Receita/PR."
        ) from exc
    if (
        url.scheme != "https"
        or url.hostname != "receita.pr.gov.br"
        or porta not in {None, 443}
        or url.path.rstrip("/") != "/login"
        or url.username is not None
        or url.password is not None
        or url.query
        or url.fragment
    ):
        raise RuntimeError(
            "SISTEMA_FISCAL_URL deve ser exatamente o login HTTPS oficial da Receita/PR."
        )
    return "https://receita.pr.gov.br/login"


def _url_banco_worker(valor: str) -> str:
    """Valida a forma da URL sem revelar usuário, senha ou host nos erros."""

    url = urlsplit(valor.strip())
    try:
        porta = url.port
    except ValueError as exc:
        raise RuntimeError("WORKER_DATABASE_URL possui formato inválido.") from exc
    if (
        url.scheme not in {"postgres", "postgresql"}
        or not url.hostname
        or not url.username
        or porta is not None and not 1 <= porta <= 65535
        or url.fragment
    ):
        raise RuntimeError("WORKER_DATABASE_URL possui formato inválido.")
    return valor.strip()
