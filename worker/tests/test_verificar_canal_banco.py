import json
from unittest.mock import patch

from scripts import verificar_canal_banco


def test_canal_sem_url_retorna_diagnostico_sem_traceback(capsys):
    with (
        patch("scripts.verificar_canal_banco._argumentos") as argumentos,
        patch.dict("os.environ", {}, clear=True),
    ):
        argumentos.return_value.env_file = None
        argumentos.return_value.database_key = "WORKER_DATABASE_URL"
        assert verificar_canal_banco.main() == 2

    assert json.loads(capsys.readouterr().out) == {
        "canalBancoWorker": "nao_configurado",
        "variavelAusente": "WORKER_DATABASE_URL",
    }


def test_canal_sanitiza_erro_de_conexao(capsys):
    async def falhar(_url: str) -> int:
        raise RuntimeError("postgresql://usuario:senha@host/banco")

    with (
        patch("scripts.verificar_canal_banco._argumentos") as argumentos,
        patch("scripts.verificar_canal_banco._verificar", side_effect=falhar),
        patch.dict("os.environ", {"WORKER_DATABASE_URL": "postgresql://segredo"}, clear=True),
    ):
        argumentos.return_value.env_file = None
        argumentos.return_value.database_key = "WORKER_DATABASE_URL"
        assert verificar_canal_banco.main() == 1

    saida = json.loads(capsys.readouterr().out)
    assert saida == {"canalBancoWorker": "erro", "tipoErro": "RuntimeError"}
    assert "senha" not in json.dumps(saida)
