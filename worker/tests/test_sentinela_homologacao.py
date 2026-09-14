import json
from argparse import Namespace
from subprocess import CompletedProcess

import pytest

from scripts import executar_sentinela_homologacao as sentinela
from scripts.executar_sentinela_homologacao import (
    montar_ambiente_seguro,
    validar_documentos,
)


def test_ambiente_sentinela_anula_producao_e_filas(tmp_path, monkeypatch):
    monkeypatch.setenv("HABILITAR_PRODUCAO_FISCAL", "true")
    monkeypatch.setenv("AMBIENTE_EMISSAO", "normal")
    monkeypatch.setenv("PROCESSAR_FILA_BANCO", "true")
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
        "</infProt></protNFe><NFe><infNFe><ide><nNF>42</nNF></ide></infNFe></NFe></nfeProc>",
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
