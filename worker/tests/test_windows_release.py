import hashlib
import json
import zipfile

import pytest

from windows.release import safe_name, inspect_package, extract_package


@pytest.mark.parametrize("name", ["../segredo", "C:/segredo", "a\\b", "a:stream", ".env", "a/.env.vm", "worker.env", "CON", "a/..", "a//b", "a."])
def test_caminhos_inseguros_recusados(name):
    with pytest.raises(ValueError): safe_name(name)


def pacote(tmp_path):
    path = tmp_path / "release.zip"
    names = ["main.py", "src/servico.py", "windows/launch.py", "windows/release.py",
             "windows/requirements-windows.lock", "scripts/verificar_runtime_playwright.py"]
    files = {name: hashlib.sha256(b"fixture").hexdigest() for name in names}
    manifest = {"schema": 1, "version": "a" * 40 + "-dirty", "deployable": False, "files": files}
    with zipfile.ZipFile(path, "w") as archive:
        for name in names: archive.writestr(name, b"fixture")
        archive.writestr("manifest.json", json.dumps(manifest))
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def test_preview_nao_pode_ser_instalado(tmp_path):
    path, sha = pacote(tmp_path)
    with pytest.raises(ValueError, match="desenvolvimento"): inspect_package(path, sha)
    assert inspect_package(path, sha, deploy=False)["deployable"] is False


def test_hash_recebido_e_extracao_sem_sobrescrever(tmp_path):
    path, sha = pacote(tmp_path)
    with pytest.raises(ValueError, match="SHA"): inspect_package(path, "0" * 64, deploy=False)
    target = tmp_path / "release"
    extract_package(path, sha, target, deploy=False)
    assert (target / "main.py").read_bytes() == b"fixture"
    with pytest.raises(ValueError, match="existe"): extract_package(path, sha, target, deploy=False)


def test_launcher_reutiliza_configuracao_e_isola_dados_de_release(tmp_path, monkeypatch):
    from windows.launch import prepare_environment
    root = tmp_path / "servidor"
    config = root / "shared" / "config"
    config.mkdir(parents=True)
    release = root / "releases" / ("a" * 40)
    release.mkdir(parents=True)
    (release / "manifest.json").write_text(json.dumps({"version": "a" * 40}))
    secret = config / "worker.env"
    original = "WORKER_COORDENADO=true\nCLIENTE_A_SENHA=senha-ficticia-${literal}\n"
    secret.write_text(original)
    monkeypatch.setenv("PAUSAR_ANTES_TRANSPORTE", "true")
    # prepare_environment modifica apenas o ambiente do processo. Restaura-o
    # no fim do teste; não carrega nenhum .env real nem inicia o serviço.
    import os
    before = os.environ.copy()
    try:
        boot1 = prepare_environment(root, release)
        boot2 = prepare_environment(root, release)
        assert boot1 != boot2
        assert os.environ["CLIENTE_A_SENHA"] == "senha-ficticia-${literal}"
        assert os.environ["PAUSAR_ANTES_TRANSPORTE"] == "false"
        assert os.environ["DOWNLOAD_DIR"] == str(root / "shared" / "downloads")
        assert os.environ["WORKER_VERSION"] == "a" * 40
        assert secret.read_text() == original
    finally:
        os.environ.clear()
        os.environ.update(before)
