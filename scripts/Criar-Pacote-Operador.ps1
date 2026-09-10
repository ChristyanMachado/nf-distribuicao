$ErrorActionPreference = "Stop"
$raizProjeto = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$origemWorker = Join-Path $raizProjeto "worker"
$diretorioDist = Join-Path $raizProjeto "dist"
$diretorioPacote = Join-Path $diretorioDist "graalyst-worker-local"
$arquivoZip = Join-Path $diretorioDist "graalyst-worker-local.zip"

if (-not $diretorioPacote.StartsWith($diretorioDist, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Destino de pacote inválido."
}
New-Item -ItemType Directory -Path $diretorioDist -Force | Out-Null
if (Test-Path -LiteralPath $diretorioPacote) { Remove-Item -LiteralPath $diretorioPacote -Recurse -Force }
if (Test-Path -LiteralPath $arquivoZip) { Remove-Item -LiteralPath $arquivoZip -Force }
New-Item -ItemType Directory -Path $diretorioPacote | Out-Null

@("main.py", "requirements-prod.txt", ".env.operador.example", "INSTALAR.cmd", "ABRIR-WORKER.cmd", "Instalar-Worker-Local.ps1") |
    ForEach-Object { Copy-Item -LiteralPath (Join-Path $origemWorker $_) -Destination $diretorioPacote }
Copy-Item -LiteralPath (Join-Path $origemWorker "src") -Destination $diretorioPacote -Recurse
Copy-Item -LiteralPath (Join-Path $origemWorker "operador") -Destination $diretorioPacote -Recurse
New-Item -ItemType Directory -Path (Join-Path $diretorioPacote "scripts") | Out-Null
Copy-Item -LiteralPath (Join-Path $origemWorker "scripts\__init__.py") -Destination (Join-Path $diretorioPacote "scripts")
Copy-Item -LiteralPath (Join-Path $origemWorker "scripts\executar_lote_local.py") -Destination (Join-Path $diretorioPacote "scripts")

Compress-Archive -LiteralPath $diretorioPacote -DestinationPath $arquivoZip -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $arquivoZip -Algorithm SHA256).Hash
Write-Host "Pacote criado: $arquivoZip"
Write-Host "SHA-256: $hash"
