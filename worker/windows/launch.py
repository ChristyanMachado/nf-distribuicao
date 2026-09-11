"""Entrada não interativa da tarefa Windows; reutiliza src.servico no processo."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import uuid


def prepare_environment(root: Path, release: Path) -> str:
    from dotenv import dotenv_values

    raw = dotenv_values(root / "shared" / "config" / "worker.env", interpolate=False)
    if any(value is None for value in raw.values()):
        raise ValueError("Configuração contém entrada sem valor.")
    for name, value in raw.items():
        if not name.isascii() or not name.replace("_", "").isalnum() or not name.isupper():
            raise ValueError("Nome de configuração inválido.")
        os.environ[name] = value or ""
    manifest = json.loads((release / "manifest.json").read_text(encoding="utf-8"))
    if os.environ.get("WORKER_COORDENADO", "").lower() != "true":
        raise ValueError("O servidor exige coordenação autenticada habilitada.")
    boot_id = str(uuid.uuid4())
    os.environ.update({
        "WORKER_VERSION": manifest["version"],
        "WORKER_BOOT_ID": boot_id,
        "WORKER_PERSISTENTE": "true",
        "HEADLESS": "true",
        "INSPECIONAR": "false",
        "PAUSAR_ANTES_EMITIR": "false",
        "PAUSAR_ANTES_TRANSPORTE": "false",
        "PAUSAR_APOS_DOWNLOADS": "false",
        "PAUSAR_APOS_CONSULTA": "false",
        "WORKER_CONTROL_PATH": str(root / "shared" / "control" / "drain.request"),
        "WORKER_STARTUP_HOLD_PATH": str(root / "shared" / "control" / "hold.request"),
        "WORKER_HEALTHCHECK_PATH": str(root / "shared" / "state" / "health.json"),
        "PLAYWRIGHT_BROWSERS_PATH": str(release / "browsers"),
        "LOG_DIR": str(root / "shared" / "logs"),
        "DOWNLOAD_DIR": str(root / "shared" / "downloads"),
        "TEMP": str(root / "shared" / "temp"),
        "TMP": str(root / "shared" / "temp"),
        "PYTHONUNBUFFERED": "1",
    })
    return boot_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    release = Path(__file__).resolve().parents[1]
    root = args.root.resolve(strict=True)
    if release.parent != root / "releases":
        raise ValueError("Release fora do diretório instalado.")
    import msvcrt

    # A trava permanece neste mesmo processo até src.servico terminar. Inclusive
    # invocações manuais acidentais são barradas antes da conexão ao banco.
    with (root / "shared" / "state" / "instance.lock").open("a+b") as lock:
        lock.seek(0)
        if not lock.read(1):
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return 1
        prepare_environment(root, release)
        sys.path.insert(0, str(release))
        os.chdir(release)
        from src.servico import main as service_main
        return service_main()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # nunca imprimir exceção/configuração secreta
        print(f"Inicialização recusada ({type(exc).__name__}); consultar saúde e configuração.", file=sys.stderr)
        raise SystemExit(1) from None
