"""
Testa a validação de carregar_config() para TESTAR_PREENCHIMENTO_COMPLETO,
sem depender de navegador. Usa monkeypatch pra isolar do .env local da
máquina de quem estiver rodando o teste.
"""
import pytest

from src.config import carregar_config, carregar_credencial


def _preparar_env_minimo(monkeypatch):
    """As variáveis obrigatórias mínimas pra carregar_config() não falhar
    por outro motivo que não seja o que o teste quer verificar."""
    monkeypatch.setenv("SISTEMA_FISCAL_URL", "https://receita.pr.gov.br/login")
    monkeypatch.delenv("TESTAR_NAVEGACAO_EMISSAO", raising=False)
    monkeypatch.delenv("TESTAR_PREENCHIMENTO_COMPLETO", raising=False)
    monkeypatch.delenv("MAX_CONCORRENCIA", raising=False)
    monkeypatch.delenv("AMBIENTE_EMISSAO", raising=False)


def test_preenchimento_completo_sem_navegacao_emissao_falha_claro(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("TESTAR_PREENCHIMENTO_COMPLETO", "true")
    # TESTAR_NAVEGACAO_EMISSAO fica ausente/false de propósito.

    with pytest.raises(RuntimeError, match="TESTAR_NAVEGACAO_EMISSAO"):
        carregar_config()


def test_preenchimento_completo_com_navegacao_emissao_carrega_normalmente(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("TESTAR_NAVEGACAO_EMISSAO", "true")
    monkeypatch.setenv("TESTAR_PREENCHIMENTO_COMPLETO", "true")

    config = carregar_config()

    assert config.testar_navegacao_emissao is True
    assert config.testar_preenchimento_completo is True


def test_sem_nenhuma_flag_continua_desabilitado_por_padrao(monkeypatch):
    _preparar_env_minimo(monkeypatch)

    config = carregar_config()

    assert config.testar_navegacao_emissao is False
    assert config.testar_preenchimento_completo is False


def test_max_concorrencia_ausente_e_none_por_padrao(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.delenv("MAX_CONCORRENCIA", raising=False)

    config = carregar_config()

    assert config.max_concorrencia is None


def test_max_concorrencia_valida_e_convertida_para_int(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("MAX_CONCORRENCIA", "5")

    config = carregar_config()

    assert config.max_concorrencia == 5


def test_max_concorrencia_invalida_falha_com_mensagem_clara(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("MAX_CONCORRENCIA", "abc")

    with pytest.raises(RuntimeError, match="MAX_CONCORRENCIA"):
        carregar_config()


def test_max_concorrencia_zero_ou_negativa_falha(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("MAX_CONCORRENCIA", "0")

    with pytest.raises(RuntimeError, match="MAX_CONCORRENCIA"):
        carregar_config()


def test_max_concorrencia_excessiva_falha(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("MAX_CONCORRENCIA", "21")

    with pytest.raises(RuntimeError, match="MAX_CONCORRENCIA"):
        carregar_config()


@pytest.mark.parametrize(
    "url",
    [
        "http://receita.pr.gov.br/login",
        "https://receita.pr.gov.br.evil.example/login",
        "https://receita.pr.gov.br/login?destino=malicioso",
        "https://usuario:senha@receita.pr.gov.br/login",
        "https://receita.pr.gov.br:porta/login",
    ],
)
def test_url_fiscal_adulterada_e_rejeitada(monkeypatch, url):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("SISTEMA_FISCAL_URL", url)

    with pytest.raises(RuntimeError, match="Receita/PR"):
        carregar_config()


def test_clientes_ativos_rejeita_injecao_e_duplicidade(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_A\nFORJADO")

    with pytest.raises(RuntimeError, match="CLIENTES_ATIVOS"):
        carregar_config()


def test_ambiente_emissao_padrao_e_teste(monkeypatch):
    """
    21/08: o padrão precisa ser 'teste' (homologação) — trocar pro sistema
    fiscal de produção tem que ser uma decisão explícita, não o default.
    """
    _preparar_env_minimo(monkeypatch)

    config = carregar_config()

    assert config.ambiente_emissao == "teste"


def test_ambiente_emissao_pode_ser_normal_explicitamente(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("AMBIENTE_EMISSAO", "normal")

    config = carregar_config()

    assert config.ambiente_emissao == "normal"


def test_ambiente_emissao_aceita_maiusculas_e_espacos(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("AMBIENTE_EMISSAO", " NORMAL ")

    config = carregar_config()

    assert config.ambiente_emissao == "normal"


def test_ambiente_emissao_invalido_falha_com_mensagem_clara(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("AMBIENTE_EMISSAO", "producao")

    with pytest.raises(RuntimeError, match="AMBIENTE_EMISSAO"):
        carregar_config()


def test_emitente_e_opcional_para_login_e_navegacao(monkeypatch):
    monkeypatch.setenv("CLIENTE_TESTE_LOGIN", "login-de-teste")
    monkeypatch.setenv("CLIENTE_TESTE_SENHA", "senha-de-teste")
    monkeypatch.delenv("CLIENTE_TESTE_EMITENTE", raising=False)

    credencial = carregar_credencial("CLIENTE_TESTE")

    assert credencial.emitente is None


def test_emitente_e_carregado_quando_configurado(monkeypatch):
    monkeypatch.setenv("CLIENTE_TESTE_LOGIN", "login-de-teste")
    monkeypatch.setenv("CLIENTE_TESTE_SENHA", "senha-de-teste")
    monkeypatch.setenv("CLIENTE_TESTE_EMITENTE", "  opcao-emitente  ")

    credencial = carregar_credencial("CLIENTE_TESTE")

    assert credencial.emitente == "opcao-emitente"
