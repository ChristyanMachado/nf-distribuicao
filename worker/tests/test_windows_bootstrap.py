from pathlib import Path


def test_bootstrap_supervisiona_falha_sem_impedir_parada_drenada() -> None:
    bootstrap = (
        Path(__file__).resolve().parents[1] / "windows" / "Run-Worker.ps1"
    ).read_text(encoding="utf-8")

    assert "while ($true)" in bootstrap
    assert "shared\\control\\drain.request" in bootstrap
    assert "if (Test-Path -LiteralPath $drain) { exit 0 }" in bootstrap
    assert "if ($exitCode -eq 0) { exit 0 }" in bootstrap
    assert "Start-Sleep -Seconds $RestartDelaySeconds" in bootstrap
