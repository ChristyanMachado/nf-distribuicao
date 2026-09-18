param(
    [Parameter(Mandatory=$true)][string]$Root,
    [ValidateRange(1,3600)][int]$RestartDelaySeconds = 60
)
$ErrorActionPreference = 'Stop'
$drain = Join-Path $Root 'shared\control\drain.request'

# O Agendador do Windows pode registrar um processo que retorna codigo 1 como
# acao concluida e nao aplicar RestartOnFailure. O bootstrap supervisiona apenas
# falhas operacionais; parada drenada e saida limpa continuam encerrando a tarefa.
while ($true) {
    try {
        $pointer = Get-Content -LiteralPath (Join-Path $Root 'current.json') -Raw | ConvertFrom-Json
        if ($pointer.version -notmatch '^[a-f0-9]{40}$') { throw 'Versao instalada invalida.' }
        $release = Join-Path $Root ('releases\' + $pointer.version)
        $python = Join-Path $release '.venv\Scripts\python.exe'
        $env:PYTHONDONTWRITEBYTECODE = '1'
        & $python (Join-Path $release 'windows\launch.py') --root $Root
        $exitCode = $LASTEXITCODE
    } catch {
        # Nao imprimir caminhos, configuracao nem excecoes possivelmente sensiveis.
        $exitCode = 1
    }

    if (Test-Path -LiteralPath $drain) { exit 0 }
    if ($exitCode -eq 0) { exit 0 }
    Start-Sleep -Seconds $RestartDelaySeconds
}
