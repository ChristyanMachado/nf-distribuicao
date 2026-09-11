"""Verificação offline do pacote Windows; não carrega configuração fiscal."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

SCHEMA = 1
MAX_BYTES = 2_000_000_000
MAX_ENTRIES = 12000
VERSION = re.compile(r"[a-f0-9]{40}(?:-dirty)?")


def safe_name(name: str) -> str:
    """Recusa traversal, ADS, links, nomes especiais e colisões do Windows."""
    if not isinstance(name, str) or not name or len(name) > 220:
        raise ValueError("Nome inválido no pacote.")
    path = PurePosixPath(name)
    if path.is_absolute() or "\\" in name or ":" in name:
        raise ValueError("Caminho absoluto/ADS no pacote.")
    for part in name.split("/"):
        if (not part or part in {".", ".."} or part.endswith((" ", "."))
                or any(ord(c) < 32 for c in part)
                or re.fullmatch(r"(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", part)):
            raise ValueError("Caminho inseguro no pacote.")
        if part.lower().startswith(".env") or part.lower() in {"worker.env", ".git"}:
            raise ValueError("Configuração privada não pode entrar no pacote.")
    return path.as_posix()


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inspect_package(package: Path, expected_hash: str, *, deploy: bool = True) -> dict:
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_hash) or digest(package) != expected_hash.lower():
        raise ValueError("SHA-256 do pacote diverge do valor recebido pelo canal confiável.")
    with zipfile.ZipFile(package) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES or sum(item.file_size for item in infos) > MAX_BYTES:
            raise ValueError("Pacote excede o limite de tamanho.")
        seen: set[str] = set()
        for item in infos:
            safe_name(item.filename)
            if item.is_dir() or stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError("Diretórios/links não são aceitos como entradas.")
            if item.filename.casefold() in seen:
                raise ValueError("Caminhos duplicados no pacote.")
            seen.add(item.filename.casefold())
        raw = archive.read("manifest.json")
        if len(raw) > 4_000_000:
            raise ValueError("Manifesto excessivo.")
        manifest = json.loads(raw)
        if (manifest.get("schema") != SCHEMA
                or not VERSION.fullmatch(str(manifest.get("version", "")))
                or not isinstance(manifest.get("files"), dict)):
            raise ValueError("Manifesto incompatível.")
        if deploy and (manifest.get("deployable") is not True or manifest["version"].endswith("-dirty")):
            raise ValueError("Pacote de desenvolvimento não pode ser instalado no servidor.")
        files = manifest["files"]
        if set(files) != set(archive.namelist()) - {"manifest.json"}:
            raise ValueError("Conteúdo não corresponde ao manifesto.")
        for name, expected in files.items():
            if not re.fullmatch(r"[a-f0-9]{64}", str(expected)):
                raise ValueError("Hash inválido no manifesto.")
            with archive.open(name) as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if actual != expected:
                raise ValueError("Arquivo corrompido no pacote.")
        required = {"main.py", "src/servico.py", "windows/launch.py", "windows/release.py",
                    "windows/requirements-windows.lock", "scripts/verificar_runtime_playwright.py"}
        if not required <= set(files):
            raise ValueError("Pacote incompleto.")
        if deploy:
            if manifest.get("runtime_mode") not in {"offline", "online-locked"}:
                raise ValueError("Modo de instalação inválido.")
        if deploy and manifest.get("runtime_mode") == "offline":
            if not any(name.startswith("wheels/") and name.endswith(".whl") for name in files):
                raise ValueError("Pacote não contém dependências offline.")
            if not any(name.startswith("browsers/") and name.endswith("/chrome.exe") for name in files):
                raise ValueError("Pacote não contém Chromium Windows.")
        if deploy:
            if manifest.get("python") != ".".join(map(str, sys.version_info[:3])):
                raise ValueError("Python instalado difere da versão validada no pacote.")
            if manifest.get("platform") != "win-amd64" or sys.platform != "win32":
                raise ValueError("Pacote exige Windows x64.")
        return manifest


def extract_package(package: Path, expected_hash: str, destination: Path, *, deploy: bool = True) -> dict:
    manifest = inspect_package(package, expected_hash, deploy=deploy)
    if destination.exists():
        raise ValueError("A versão já existe; não sobrescrever release instalada.")
    destination.mkdir(parents=False)
    with zipfile.ZipFile(package) as archive:
        for name in archive.namelist():
            target = destination / safe_name(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(name) as source, target.open("xb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
    return manifest


def atomic_json(path: Path, data: dict) -> None:
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(data, stream, separators=(",", ":"))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("sha256")
    parser.add_argument("--destination", type=Path)
    args = parser.parse_args()
    try:
        if args.destination:
            manifest = extract_package(args.package, args.sha256, args.destination)
        else:
            manifest = inspect_package(args.package, args.sha256)
        print(json.dumps({"version": manifest["version"], "python": manifest["python"]}))
        return 0
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as exc:
        print(f"Pacote recusado ({type(exc).__name__}).", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
