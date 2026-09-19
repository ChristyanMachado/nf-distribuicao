"""Empacota código revisado. Não inclui credenciais, dados fiscais nem ambiente Python."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import platform
import re
import subprocess
import sys
import zipfile

from windows.release import inspect_package


PYTHON_VERSION = re.compile(r"\d+\.\d+\.\d+")


def empacotar(destino: Path, *, preview=False, target_python: str | None = None) -> dict:
    worker = Path(__file__).resolve().parents[1]
    repo = worker.parent
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    dirty = bool(subprocess.check_output(
        ["git", "status", "--porcelain", "--", "worker"], cwd=repo, text=True
    ).strip())
    if dirty and not preview:
        raise ValueError("Registre e revise a versão no Git antes de criar pacote instalável.")
    python_version = platform.python_version() if target_python is None else target_python
    if not PYTHON_VERSION.fullmatch(python_version):
        raise ValueError("A versão Python-alvo deve usar o formato X.Y.Z.")
    files = {}
    for folder in ("src", "scripts", "windows"):
        for path in sorted((worker / folder).rglob("*")):
            if path.is_symlink() or not path.is_file() or "__pycache__" in path.parts:
                continue
            if path.suffix not in {".py", ".ps1", ".lock", ".example"}:
                continue
            files[path.relative_to(worker).as_posix()] = path.read_bytes()
    for name in ("main.py", "requirements-prod.txt"):
        files[name] = (worker / name).read_bytes()
    manifest = {
        "schema": 1, "version": commit + ("-dirty" if dirty else ""),
        "python": python_version, "platform": "win-amd64",
        "runtime_mode": "online-locked", "deployable": not dirty and not preview,
        "files": {name: hashlib.sha256(content).hexdigest() for name, content in files.items()},
    }
    destino.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destino, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items(): archive.writestr(name, content)
        archive.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
    sha = hashlib.sha256(destino.read_bytes()).hexdigest()
    # Quando o pacote é preparado para outra máquina, a validação local ainda
    # comprova estrutura e hashes. A igualdade do runtime é verificada novamente
    # pelo release.py no próprio servidor antes de qualquer troca de versão.
    deploy_local = manifest["deployable"] and python_version == platform.python_version()
    inspect_package(destino, sha, deploy=deploy_local)
    return {"version": manifest["version"], "deployable": manifest["deployable"], "sha256": sha,
            "files": len(files), "runtime": "Dependências fixadas baixadas na preparação, antes da parada."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--target-python", help="Versão exata do Python instalado no servidor (X.Y.Z).")
    args = parser.parse_args()
    print(json.dumps(empacotar(
        args.output, preview=args.preview, target_python=args.target_python
    )))


if __name__ == "__main__": main()
