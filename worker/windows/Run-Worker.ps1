param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
try {
    $pointer = Get-Content -LiteralPath (Join-Path $Root 'current.json') -Raw | ConvertFrom-Json
    if ($pointer.version -notmatch '^[a-f0-9]{40}$') { throw 'Versao instalada invalida.' }
    $release = Join-Path $Root ('releases\' + $pointer.version)
    $python = Join-Path $release '.venv\Scripts\python.exe'
    $env:PYTHONDONTWRITEBYTECODE = '1'
    & $python (Join-Path $release 'windows\launch.py') --root $Root
    exit $LASTEXITCODE
} catch {
    # Nao imprimir caminhos, configuracao nem excecoes possivelmente sensiveis.
    exit 1
}
