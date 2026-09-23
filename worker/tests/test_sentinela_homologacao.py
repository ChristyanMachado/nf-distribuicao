import json
import re
import sys
from argparse import Namespace
from pathlib import Path
from subprocess import CompletedProcess

import pytest

from scripts import executar_sentinela_homologacao as sentinela
from src.config import carregar_config
from scripts.executar_sentinela_homologacao import (
    montar_ambiente_seguro,
    validar_documentos,
)


def test_ambiente_sentinela_anula_producao_e_filas(tmp_path, monkeypatch):
    monkeypatch.setenv("HABILITAR_PRODUCAO_FISCAL", "true")
    monkeypatch.setenv("AMBIENTE_EMISSAO", "normal")
    monkeypatch.setenv("PROCESSAR_FILA_BANCO", "true")
    monkeypatch.setenv("TESTAR_NAVEGACAO_CONSULTA", "true")
    monkeypatch.setenv("CONSULTAR_ULTIMO_XML", "true")
    monkeypatch.setenv("BAIXAR_DOCUMENTOS_CONSULTA", "true")
    monkeypatch.setenv("WORKER_DATABASE_URL", "url-de-producao-invalida")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "segredo-producao")
    env_file = tmp_path / "sentinela.env"
    env_file.write_text(
        "CLIENTE_A_LOGIN=login\nCLIENTE_A_SENHA=senha\nCLIENTE_A_EMITENTE=123\n",
        encoding="utf-8",
    )

    ambiente = montar_ambiente_seguro(
        cliente_id="CLIENTE_A",
        env_file=env_file,
        downloads=tmp_path / "downloads",
        logs=tmp_path / "logs",
    )

    assert ambiente["AMBIENTE_EMISSAO"] == "teste"
    assert ambiente["HABILITAR_PRODUCAO_FISCAL"] == "false"
    assert ambiente["FONTE_TAREFAS"] == "arquivo"
    assert ambiente["PROCESSAR_FILA_BANCO"] == "false"
    assert ambiente["MAX_CONCORRENCIA"] == "1"
    assert ambiente["ARMAZENAR_DOCUMENTOS"] == "false"
    assert ambiente["PROCESSAR_CANCELAMENTOS_FISCAIS"] == "false"
    assert ambiente["SUPABASE_SECRET_KEY"] == ""
    for nome, valor in ambiente.items():
        monkeypatch.setenv(nome, valor)
    config = carregar_config()
    assert config.worker_database_url is None
    assert config.testar_navegacao_consulta is False
    assert config.testar_emissao_homologacao is True


def test_sem_confirmacao_nao_inicia_processo(monkeypatch):
    def proibido(*args, **kwargs):
        pytest.fail("Não deve iniciar um processo sem confirmação.")
    monkeypatch.setattr(sentinela.subprocess, "run", proibido)
    with pytest.raises(RuntimeError, match="Emissão não iniciada"):
        sentinela.executar(Namespace(confirmar_emissao_de_teste=False))


def test_ambiente_sentinela_exige_credenciais_do_cliente(tmp_path):
    env_file = tmp_path / "sentinela.env"
    env_file.write_text("CLIENTE_A_LOGIN=login\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="CLIENTE_A_SENHA"):
        montar_ambiente_seguro(
            cliente_id="CLIENTE_A",
            env_file=env_file,
            downloads=tmp_path / "downloads",
            logs=tmp_path / "logs",
        )


def test_valida_exatamente_um_xml_autorizado_e_um_pdf(tmp_path):
    chave = "4" * 44
    (tmp_path / "sentinela.xml").write_text(
        "<?xml version='1.0'?><nfeProc><protNFe><infProt>"
        f"<chNFe>{chave}</chNFe><nProt>123456</nProt><cStat>100</cStat>"
        "</infProt></protNFe><NFe><infNFe><ide><nNF>42</nNF>"
        "<dhEmi>2026-09-15T20:18:09-03:00</dhEmi>"
        "</ide></infNFe></NFe></nfeProc>",
        encoding="utf-8",
    )
    (tmp_path / "sentinela.pdf").write_bytes(b"%PDF-1.7\nconteudo")

    resultado = validar_documentos(tmp_path)

    assert resultado["numero_homologacao"] == "42"
    assert resultado["codigo_status"] == "100"
    assert resultado["chave_validada"] is True


def test_documentos_antigos_ou_duplicados_nao_geram_falso_positivo(tmp_path):
    (tmp_path / "antigo.pdf").write_bytes(b"%PDF-1.7")

    with pytest.raises(RuntimeError, match="exatamente um XML e um DANFE novos"):
        validar_documentos(tmp_path)


def test_falha_de_validacao_gera_relatorio_sanitizado(tmp_path, monkeypatch):
    tarefa = tmp_path / "tarefa.json"
    tarefa.write_text('{"cliente_id":"CLIENTE_A"}', encoding="utf-8")
    env_file = tmp_path / "sentinela.env"
    env_file.write_text(
        "CLIENTE_A_LOGIN=login\nCLIENTE_A_SENHA=segredo\nCLIENTE_A_EMITENTE=123\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(sentinela, "RAIZ_WORKER", tmp_path)
    monkeypatch.setattr(
        sentinela.subprocess,
        "run",
        lambda *args, **kwargs: CompletedProcess(args[0], returncode=0),
    )

    codigo = sentinela.executar(
        Namespace(
            tarefa=str(tarefa),
            env_file=str(env_file),
            confirmar_emissao_de_teste=True,
        )
    )

    assert codigo == 1
    relatorios = list((tmp_path / "logs").glob("sentinela-*.json"))
    assert len(relatorios) == 1
    conteudo = relatorios[0].read_text(encoding="utf-8")
    relatorio = json.loads(conteudo)
    assert relatorio["sucesso"] is False
    assert relatorio["erro_codigo"] == "RuntimeError"
    assert "segredo" not in conteudo


def _xml_homologacao_valido() -> str:
    chave = "4" * 44
    return (
        "<?xml version='1.0'?><nfeProc><protNFe><infProt>"
        f"<chNFe>{chave}</chNFe><nProt>123456</nProt><cStat>100</cStat>"
        "</infProt></protNFe><NFe><infNFe><ide><nNF>42</nNF>"
        "<dhEmi>2026-09-15T20:18:09-03:00</dhEmi>"
        "</ide></infNFe></NFe></nfeProc>"
    )


def test_execucao_bem_sucedida_orquestra_processo_e_validacao(tmp_path, monkeypatch):
    tarefa = tmp_path / "tarefa.json"
    tarefa.write_text('{"cliente_id":"CLIENTE_A"}', encoding="utf-8")
    env_file = tmp_path / "sentinela.env"
    env_file.write_text(
        "CLIENTE_A_LOGIN=login\nCLIENTE_A_SENHA=segredo\nCLIENTE_A_EMITENTE=123\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(sentinela, "RAIZ_WORKER", tmp_path)
    capturado: dict[str, object] = {}

    def falso_run(cmd, cwd=None, env=None, check=None):
        capturado.update(cmd=cmd, cwd=cwd, env=env, check=check)
        baixados = Path(env["DOWNLOAD_DIR"])
        (baixados / "sentinela.xml").write_text(
            _xml_homologacao_valido(), encoding="utf-8"
        )
        (baixados / "sentinela.pdf").write_bytes(b"%PDF-1.7\nconteudo")
        return CompletedProcess(cmd, returncode=0)

    monkeypatch.setattr(sentinela.subprocess, "run", falso_run)

    codigo = sentinela.executar(
        Namespace(
            tarefa=str(tarefa),
            env_file=str(env_file),
            confirmar_emissao_de_teste=True,
        )
    )

    assert codigo == 0
    assert capturado["cmd"] == [
        sys.executable,
        str(tmp_path / "main.py"),
        str(tarefa.resolve()),
    ]
    assert capturado["cwd"] == tmp_path
    assert capturado["check"] is False
    ambiente = capturado["env"]
    assert str(ambiente["DOWNLOAD_DIR"]).startswith(
        str(tmp_path / "downloads" / "sentinela")
    )
    assert Path(ambiente["DOWNLOAD_DIR"]).is_dir()
    assert ambiente["HABILITAR_PRODUCAO_FISCAL"] == "false"
    assert ambiente["AMBIENTE_EMISSAO"] == "teste"
    assert ambiente["PROCESSAR_FILA_BANCO"] == "false"
    assert ambiente["WORKER_DATABASE_URL"] == ""
    assert ambiente["CLIENTE_A_LOGIN"] == "login"
    assert ambiente["CLIENTES_ATIVOS"] == "CLIENTE_A"

    relatorios = list((tmp_path / "logs").glob("sentinela-*.json"))
    assert len(relatorios) == 1
    conteudo = relatorios[0].read_text(encoding="utf-8")
    relatorio = json.loads(conteudo)
    assert relatorio["sucesso"] is True
    assert relatorio["codigo_processo"] == 0
    assert relatorio["numero_homologacao"] == "42"
    assert relatorio["codigo_status"] == "100"
    assert relatorio["ambiente"] == "homologacao"
    assert re.fullmatch(r"\d{8}T\d{6}Z-[0-9a-f]{8}", relatorio["execucao_id"])
    assert "segredo" not in conteudo


def test_retorno_nao_zero_preserva_codigo_e_nao_valida_documentos(
    tmp_path, monkeypatch
):
    tarefa = tmp_path / "tarefa.json"
    tarefa.write_text('{"cliente_id":"CLIENTE_A"}', encoding="utf-8")
    env_file = tmp_path / "sentinela.env"
    env_file.write_text(
        "CLIENTE_A_LOGIN=login\nCLIENTE_A_SENHA=segredo\nCLIENTE_A_EMITENTE=123\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(sentinela, "RAIZ_WORKER", tmp_path)
    monkeypatch.setattr(
        sentinela.subprocess,
        "run",
        lambda *args, **kwargs: CompletedProcess(args[0], returncode=7),
    )

    codigo = sentinela.executar(
        Namespace(
            tarefa=str(tarefa),
            env_file=str(env_file),
            confirmar_emissao_de_teste=True,
        )
    )

    assert codigo == 7
    relatorios = list((tmp_path / "logs").glob("sentinela-*.json"))
    assert len(relatorios) == 1
    conteudo = relatorios[0].read_text(encoding="utf-8")
    relatorio = json.loads(conteudo)
    assert relatorio["sucesso"] is False
    assert relatorio["codigo_processo"] == 7
    assert "erro_codigo" not in relatorio
    assert "numero_homologacao" not in relatorio
    assert "segredo" not in conteudo


def test_ambiente_limpa_credenciais_de_outro_cliente(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIENTE_B_LOGIN", "login-b")
    monkeypatch.setenv("CLIENTE_B_SENHA", "senha-b")
    monkeypatch.setenv("CLIENTE_B_EMITENTE", "999")
    env_file = tmp_path / "sentinela.env"
    env_file.write_text(
        "CLIENTE_A_LOGIN=login-a\nCLIENTE_A_SENHA=senha-a\nCLIENTE_A_EMITENTE=111\n",
        encoding="utf-8",
    )

    ambiente = montar_ambiente_seguro(
        cliente_id="CLIENTE_A",
        env_file=env_file,
        downloads=tmp_path / "downloads",
        logs=tmp_path / "logs",
    )

    assert ambiente["CLIENTE_A_LOGIN"] == "login-a"
    assert ambiente["CLIENTE_A_SENHA"] == "senha-a"
    assert ambiente["CLIENTE_A_EMITENTE"] == "111"
    assert ambiente["CLIENTE_B_LOGIN"] == ""
    assert ambiente["CLIENTE_B_SENHA"] == ""
    assert ambiente["CLIENTE_B_EMITENTE"] == ""
    assert ambiente["CLIENTES_ATIVOS"] == "CLIENTE_A"


def test_cliente_invalido_nao_inicia_processo(tmp_path, monkeypatch):
    tarefa = tmp_path / "tarefa.json"
    tarefa.write_text('{"cliente_id":"invalido-minusculo"}', encoding="utf-8")
    env_file = tmp_path / "sentinela.env"
    env_file.write_text(
        "CLIENTE_A_LOGIN=login\nCLIENTE_A_SENHA=senha\nCLIENTE_A_EMITENTE=123\n",
        encoding="utf-8",
    )

    def proibido(*args, **kwargs):
        pytest.fail("Não deve iniciar subprocesso com cliente_id inválido.")

    monkeypatch.setattr(sentinela.subprocess, "run", proibido)

    with pytest.raises(RuntimeError, match="cliente_id da tarefa sentinela é inválido"):
        sentinela.executar(
            Namespace(
                tarefa=str(tarefa),
                env_file=str(env_file),
                confirmar_emissao_de_teste=True,
            )
        )
