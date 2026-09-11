"""Empacota código revisado. Não inclui credenciais, dados fiscais nem ambiente Python."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

from windows.release import inspect_package


def empacotar(destino: Path, *, preview=False) -> dict:
    worker = Path(__file__).resolve().parents[1]
    repo = worker.parent
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=repo, text=True).strip())
    if dirty and not preview:
        raise ValueError("Registre e revise a versão no Git antes de criar pacote instalável.")
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
        "python": platform.python_version(), "platform": "win-amd64",
        "runtime_mode": "online-locked", "deployable": not dirty and not preview,
        "files": {name: hashlib.sha256(content).hexdigest() for name, content in files.items()},
    }
    destino.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destino, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items(): archive.writestr(name, content)
        archive.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
    sha = hashlib.sha256(destino.read_bytes()).hexdigest()
    inspect_package(destino, sha, deploy=manifest["deployable"])
    return {"version": manifest["version"], "deployable": manifest["deployable"], "sha256": sha,
            "files": len(files), "runtime": "Dependências fixadas baixadas na preparação, antes da parada."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    print(json.dumps(empacotar(args.output, preview=args.preview)))


if __name__ == "__main__": main()
