import json
import subprocess
import zipfile

import pytest

from scripts.empacotar_worker_servidor import empacotar


def git_limpo(*args, **kwargs):
    command = args[0]
    return "a" * 40 if command[1:3] == ["rev-parse", "HEAD"] else ""


def test_pacote_pode_declarar_python_alvo_do_servidor(tmp_path, monkeypatch):
    monkeypatch.setattr(subprocess, "check_output", git_limpo)
    destino = tmp_path / "worker.zip"

    resultado = empacotar(destino, target_python="3.13.7")

    with zipfile.ZipFile(destino) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    assert resultado["deployable"] is True
    assert manifest["python"] == "3.13.7"


@pytest.mark.parametrize("versao", ["3.13", "v3.13.7", "3.13.7.1", ""])
def test_python_alvo_invalido_e_recusado(tmp_path, monkeypatch, versao):
    monkeypatch.setattr(subprocess, "check_output", git_limpo)
    with pytest.raises(ValueError, match="X.Y.Z"):
        empacotar(tmp_path / "worker.zip", target_python=versao)
