import json
import sys

import pytest

from scripts import verificar_preflight_homologacao as preflight


def test_preflight_usa_arquivo_e_nao_exibe_segredos(tmp_path, monkeypatch, capsys):
    env = tmp_path / "qa.env"
    env.write_text(
        "\n".join([
            "APP_ENVIRONMENT=homologacao",
            "SISTEMA_FISCAL_URL=https://receita.pr.gov.br/login",
            "AMBIENTE_EMISSAO=teste",
            "HABILITAR_PRODUCAO_FISCAL=false",
            "FONTE_TAREFAS=banco",
            "WORKER_DATABASE_URL=postgresql://nf_homologacao_worker.szakgftippcqtuqwxsox:senha-ultra-privada@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
            "WORKER_ID=qa-worker",
            "TESTAR_INTEGRACAO_BANCO=true",
        ]), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["preflight", "--env-file", str(env)])

    assert preflight.main() == 0
    resultado = capsys.readouterr().out
    assert json.loads(resultado)["preflightHomologacao"] == "ok"
    assert "senha-ultra-privada" not in resultado


def test_preflight_recusa_arquivo_simbolico_ou_ausente(tmp_path, monkeypatch):
    arquivo = tmp_path / "inexistente.env"
    monkeypatch.setattr(sys, "argv", ["preflight", "--env-file", str(arquivo)])

    with pytest.raises(RuntimeError, match="não está disponível"):
        preflight.main()
