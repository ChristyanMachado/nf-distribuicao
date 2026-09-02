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
    monkeypatch.delenv("TESTAR_NAVEGACAO_CONSULTA", raising=False)
    monkeypatch.delenv("TESTAR_PREENCHIMENTO_COMPLETO", raising=False)
    monkeypatch.delenv("TESTAR_EMISSAO_HOMOLOGACAO", raising=False)
    monkeypatch.delenv("CONSULTAR_ULTIMO_XML", raising=False)
    monkeypatch.delenv("BAIXAR_DOCUMENTOS_CONSULTA", raising=False)
    monkeypatch.delenv("PAUSAR_APOS_DOWNLOADS", raising=False)
    monkeypatch.delenv("PAUSAR_APOS_CONSULTA", raising=False)
    monkeypatch.delenv("PAUSAR_ANTES_EMITIR", raising=False)
    monkeypatch.delenv("MAX_CONCORRENCIA", raising=False)
    monkeypatch.delenv("AMBIENTE_EMISSAO", raising=False)
    monkeypatch.delenv("PROCESSAR_FILA_BANCO", raising=False)
    monkeypatch.delenv("FONTE_TAREFAS", raising=False)
    monkeypatch.delenv("WORKER_DATABASE_URL", raising=False)
    monkeypatch.delenv("WORKER_ID", raising=False)
    monkeypatch.delenv("TESTAR_INTEGRACAO_BANCO", raising=False)
    monkeypatch.delenv("ARMAZENAR_DOCUMENTOS", raising=False)
    monkeypatch.delenv("WORKER_PERSISTENTE", raising=False)
    monkeypatch.delenv("PAUSAR_ANTES_TRANSPORTE", raising=False)
    monkeypatch.delenv("INSPECIONAR", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_STORAGE_BUCKET", raising=False)
    monkeypatch.delenv("DOCUMENTOS_RETENCAO_DIAS", raising=False)
    monkeypatch.delenv("LIMPAR_DOCUMENTOS_EXPIRADOS", raising=False)
    monkeypatch.setenv("CLIENTES_ATIVOS", "CLIENTE_A")
    monkeypatch.setenv("HEADLESS", "false")


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
    assert config.testar_navegacao_consulta is False
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


def _habilitar_emissao_homologacao(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("TESTAR_NAVEGACAO_EMISSAO", "true")
    monkeypatch.setenv("TESTAR_PREENCHIMENTO_COMPLETO", "true")
    monkeypatch.setenv("TESTAR_EMISSAO_HOMOLOGACAO", "true")


def test_emissao_homologacao_controlada_carrega_com_todas_as_travas(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)

    config = carregar_config()

    assert config.testar_emissao_homologacao is True
    assert config.ambiente_emissao == "teste"
    assert config.headless is False
    assert config.clientes_ativos == ("CLIENTE_A",)


def test_emissao_homologacao_sem_preenchimento_e_bloqueada(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("TESTAR_PREENCHIMENTO_COMPLETO", "false")

    with pytest.raises(RuntimeError, match="TESTAR_PREENCHIMENTO_COMPLETO"):
        carregar_config()


def test_emissao_homologacao_no_ambiente_normal_e_bloqueada(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("AMBIENTE_EMISSAO", "normal")

    with pytest.raises(RuntimeError, match="AMBIENTE_EMISSAO=teste"):
        carregar_config()


def test_emissao_homologacao_headless_ou_acima_do_limite_e_bloqueada(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("HEADLESS", "true")
    with pytest.raises(RuntimeError, match="HEADLESS=false"):
        carregar_config()

    monkeypatch.setenv("HEADLESS", "false")
    monkeypatch.setenv(
        "CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_B,CLIENTE_C,CLIENTE_D"
    )
    with pytest.raises(RuntimeError, match="no máximo 3 clientes"):
        carregar_config()

    monkeypatch.setenv("CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_B,CLIENTE_C")
    monkeypatch.setenv("MAX_CONCORRENCIA", "4")
    with pytest.raises(RuntimeError, match="MAX_CONCORRENCIA de até 3"):
        carregar_config()


def test_emissao_homologacao_ate_tres_clientes_em_paralelo_e_permitida(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_B,CLIENTE_C")
    monkeypatch.setenv("MAX_CONCORRENCIA", "3")

    config = carregar_config()

    assert config.clientes_ativos == ("CLIENTE_A", "CLIENTE_B", "CLIENTE_C")
    assert config.max_concorrencia == 3


def test_worker_persistente_exige_conjunto_fechado_de_travas(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("WORKER_PERSISTENTE", "true")
    monkeypatch.setenv("HEADLESS", "true")

    with pytest.raises(RuntimeError, match="fila do banco"):
        carregar_config()


def test_worker_persistente_headless_com_storage_e_fila_e_permitido(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("WORKER_PERSISTENTE", "true")
    monkeypatch.setenv("HEADLESS", "true")
    monkeypatch.setenv("INSPECIONAR", "false")
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv("WORKER_DATABASE_URL", "postgresql://usuario@localhost/teste")
    monkeypatch.setenv("WORKER_ID", "worker-vm-teste")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")
    monkeypatch.setenv("PROCESSAR_FILA_BANCO", "true")
    monkeypatch.setenv("MAX_CONCORRENCIA", "1")
    monkeypatch.setenv("ARMAZENAR_DOCUMENTOS", "true")
    monkeypatch.setenv("SUPABASE_URL", "https://projeto.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_" + "x" * 32)

    config = carregar_config()

    assert config.worker_persistente is True
    assert config.headless is True


def test_worker_persistente_recusa_inspector_ou_pausa_residual(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("WORKER_PERSISTENTE", "true")
    monkeypatch.setenv("HEADLESS", "true")
    monkeypatch.setenv("INSPECIONAR", "true")

    with pytest.raises(RuntimeError, match="pausas de inspeção"):
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
    monkeypatch.setenv("CLIENTE_TESTE_NOME_EMITENTE", "  Emissor de teste  ")

    credencial = carregar_credencial("CLIENTE_TESTE")

    assert credencial.emitente == "opcao-emitente"
    assert credencial.nome_emitente == "Emissor de teste"


def test_consulta_e_emissao_nao_podem_rodar_no_mesmo_smoke_test(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("TESTAR_NAVEGACAO_CONSULTA", "true")
    monkeypatch.setenv("TESTAR_NAVEGACAO_EMISSAO", "true")

    with pytest.raises(RuntimeError, match="fluxos separados"):
        carregar_config()


def test_smoke_test_de_consulta_e_habilitado_isoladamente(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("TESTAR_NAVEGACAO_CONSULTA", "true")

    config = carregar_config()

    assert config.testar_navegacao_consulta is True
    assert config.testar_navegacao_emissao is False


def test_consulta_do_ultimo_xml_exige_fluxo_de_consulta(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("CONSULTAR_ULTIMO_XML", "true")

    with pytest.raises(RuntimeError, match="TESTAR_NAVEGACAO_CONSULTA"):
        carregar_config()


def test_download_da_consulta_exige_xml_local_validado(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("BAIXAR_DOCUMENTOS_CONSULTA", "true")

    with pytest.raises(RuntimeError, match="CONSULTAR_ULTIMO_XML"):
        carregar_config()


def test_pausa_apos_consulta_exige_inspector_visivel(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("TESTAR_NAVEGACAO_CONSULTA", "true")
    monkeypatch.setenv("CONSULTAR_ULTIMO_XML", "true")
    monkeypatch.setenv("PAUSAR_APOS_CONSULTA", "true")

    with pytest.raises(RuntimeError, match="INSPECIONAR=true"):
        carregar_config()

    monkeypatch.setenv("INSPECIONAR", "true")
    config = carregar_config()
    assert config.consultar_ultimo_xml is True
    assert config.pausar_apos_consulta is True


def test_pausa_apos_downloads_exige_emissao_e_inspector(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("PAUSAR_APOS_DOWNLOADS", "true")

    with pytest.raises(RuntimeError, match="TESTAR_EMISSAO_HOMOLOGACAO"):
        carregar_config()

    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("PAUSAR_APOS_DOWNLOADS", "true")
    with pytest.raises(RuntimeError, match="INSPECIONAR=true"):
        carregar_config()

    monkeypatch.setenv("INSPECIONAR", "true")
    config = carregar_config()
    assert config.pausar_apos_downloads is True


def test_pausa_antes_emitir_exige_emissao_e_inspector(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("PAUSAR_ANTES_EMITIR", "true")

    with pytest.raises(RuntimeError, match="TESTAR_EMISSAO_HOMOLOGACAO"):
        carregar_config()

    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("PAUSAR_ANTES_EMITIR", "true")
    monkeypatch.setenv("INSPECIONAR", "true")
    assert carregar_config().pausar_antes_emitir is True


def test_fonte_banco_exige_trava_e_configuracao(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    with pytest.raises(RuntimeError, match="WORKER_DATABASE_URL"):
        carregar_config()

    monkeypatch.setenv("WORKER_DATABASE_URL", "postgresql://usuario@localhost/teste")
    monkeypatch.setenv("WORKER_ID", "worker-teste")
    with pytest.raises(RuntimeError, match="TESTAR_INTEGRACAO_BANCO"):
        carregar_config()

    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")
    config = carregar_config()
    assert config.fonte_tarefas == "banco"


def test_processar_fila_banco_exige_fonte_e_travas_de_homologacao(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("PROCESSAR_FILA_BANCO", "true")
    with pytest.raises(RuntimeError, match="FONTE_TAREFAS=banco"):
        carregar_config()

    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv("WORKER_DATABASE_URL", "postgresql://usuario@localhost/teste")
    monkeypatch.setenv("WORKER_ID", "worker-teste")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")
    with pytest.raises(RuntimeError, match="TESTAR_EMISSAO_HOMOLOGACAO"):
        carregar_config()


def test_processar_fila_banco_e_permitido_so_com_homologacao_completa(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv("WORKER_DATABASE_URL", "postgresql://usuario@localhost/teste")
    monkeypatch.setenv("WORKER_ID", "worker-teste")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")
    monkeypatch.setenv("PROCESSAR_FILA_BANCO", "true")

    config = carregar_config()

    assert config.processar_fila_banco is True
    assert config.ambiente_emissao == "teste"


def test_repr_da_configuracao_nao_expoe_url_do_banco(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    segredo = "postgresql://worker:senha-super-secreta@db.example/teste"
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv("WORKER_DATABASE_URL", segredo)
    monkeypatch.setenv("WORKER_ID", "worker-teste")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")

    config = carregar_config()
    texto = repr(config)

    assert config.worker_database_url == segredo
    assert segredo not in texto
    assert "senha-super-secreta" not in texto


@pytest.mark.parametrize(
    "url",
    [
        "https://usuario:senha@db.example/teste",
        "postgresql:///sem-host",
        "postgresql://db.example/teste",
        "postgresql://usuario@db.example/teste#fragmento",
        "postgresql://usuario@db.example:99999/teste",
    ],
)
def test_url_do_banco_worker_invalida_falha_sem_expor_valor(monkeypatch, url):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv("WORKER_DATABASE_URL", url)
    monkeypatch.setenv("WORKER_ID", "worker-teste")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")

    with pytest.raises(RuntimeError, match="WORKER_DATABASE_URL") as erro:
        carregar_config()

    assert url not in str(erro.value)


def test_worker_id_rejeita_caracteres_de_controle(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv(
        "WORKER_DATABASE_URL",
        "postgresql://usuario@localhost/teste",
    )
    monkeypatch.setenv("WORKER_ID", "worker\nforjado")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")

    with pytest.raises(RuntimeError, match="WORKER_ID"):
        carregar_config()


def test_storage_desligado_por_padrao(monkeypatch):
    _preparar_env_minimo(monkeypatch)

    assert carregar_config().storage_documentos is None


def test_limpeza_de_documentos_exige_fila_e_storage_controlados(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("LIMPAR_DOCUMENTOS_EXPIRADOS", "true")

    with pytest.raises(RuntimeError, match="LIMPAR_DOCUMENTOS_EXPIRADOS"):
        carregar_config()


def test_storage_exige_fonte_banco_e_configuracao_segura(monkeypatch):
    _preparar_env_minimo(monkeypatch)
    monkeypatch.setenv("ARMAZENAR_DOCUMENTOS", "true")
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        carregar_config()

    monkeypatch.setenv("SUPABASE_URL", "https://projeto.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "s" * 32)
    with pytest.raises(RuntimeError, match="FONTE_TAREFAS=banco"):
        carregar_config()


def test_storage_configurado_nao_expoe_chave_no_repr(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv("WORKER_DATABASE_URL", "postgresql://usuario@localhost/teste")
    monkeypatch.setenv("WORKER_ID", "worker-teste")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")
    monkeypatch.setenv("PROCESSAR_FILA_BANCO", "true")
    monkeypatch.setenv("ARMAZENAR_DOCUMENTOS", "true")
    monkeypatch.setenv("SUPABASE_URL", "https://projeto.supabase.co")
    segredo = "segredo-super-privado-123456789"
    monkeypatch.setenv("SUPABASE_SECRET_KEY", segredo)

    config = carregar_config()

    assert config.storage_documentos is not None
    assert segredo not in repr(config)
    assert config.storage_documentos.bucket == "documentos-fiscais"


def test_limpeza_de_documentos_configurada_permanece_opt_in(monkeypatch):
    _habilitar_emissao_homologacao(monkeypatch)
    monkeypatch.setenv("FONTE_TAREFAS", "banco")
    monkeypatch.setenv("WORKER_DATABASE_URL", "postgresql://usuario@localhost/teste")
    monkeypatch.setenv("WORKER_ID", "worker-teste")
    monkeypatch.setenv("TESTAR_INTEGRACAO_BANCO", "true")
    monkeypatch.setenv("PROCESSAR_FILA_BANCO", "true")
    monkeypatch.setenv("ARMAZENAR_DOCUMENTOS", "true")
    monkeypatch.setenv("SUPABASE_URL", "https://projeto.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "s" * 32)
    monkeypatch.setenv("LIMPAR_DOCUMENTOS_EXPIRADOS", "true")

    assert carregar_config().limpar_documentos_expirados is True
