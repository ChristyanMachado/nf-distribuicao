$ErrorActionPreference = "Stop"
$raizWorker = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $raizWorker

$pythonExe = $null
$pythonArgumento = $null
if (Get-Command py.exe -ErrorAction SilentlyContinue) {
    foreach ($versao in @("3.13", "3.12", "3.11")) {
        & py.exe "-$versao" -c "import sys; raise SystemExit(0)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $pythonExe = "py.exe"
            $pythonArgumento = "-$versao"
            break
        }
    }
}
if (-not $pythonExe -and (Get-Command python.exe -ErrorAction SilentlyContinue)) {
    & python.exe -c "import sys; raise SystemExit(0 if (3,11) <= sys.version_info < (3,14) else 1)"
    if ($LASTEXITCODE -eq 0) { $pythonExe = "python.exe" }
}
if (-not $pythonExe) {
    throw "Python 3.11, 3.12 ou 3.13 não foi encontrado. Instale pelo site python.org e execute INSTALAR.cmd novamente."
}

if ($pythonExe -eq "py.exe") { & py.exe $pythonArgumento -m venv .venv } else { & python.exe -m venv .venv }
if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar o ambiente Python." }

& .\.venv\Scripts\python.exe -m pip install --disable-pip-version-check -r requirements-prod.txt
if ($LASTEXITCODE -ne 0) { throw "Não foi possível instalar os componentes do Worker." }
& .\.venv\Scripts\python.exe -m playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Não foi possível instalar o navegador protegido." }

if (-not (Test-Path -LiteralPath .env.operador)) {
    Copy-Item -LiteralPath .env.operador.example -Destination .env.operador
    try {
        $identidade = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $acl = Get-Acl -LiteralPath .env.operador
        $acl.SetAccessRuleProtection($true, $false)
        $regra = New-Object System.Security.AccessControl.FileSystemAccessRule($identidade, "Read,Write", "Allow")
        $acl.SetAccessRule($regra)
        Set-Acl -LiteralPath .env.operador -AclObject $acl
    } catch {
        Write-Warning "Não foi possível restringir automaticamente o arquivo. Use uma conta Windows exclusiva neste computador."
    }
    Write-Host "O arquivo de configuração foi criado e será aberto para preenchimento." -ForegroundColor Yellow
    Start-Process notepad.exe -ArgumentList (Join-Path $raizWorker ".env.operador")
}

$atalho = Join-Path ([Environment]::GetFolderPath("Desktop")) "Graalyst Worker Local.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($atalho)
$shortcut.TargetPath = Join-Path $raizWorker "ABRIR-WORKER.cmd"
$shortcut.WorkingDirectory = $raizWorker
$shortcut.Save()

Write-Host "Instalação concluída. Preencha .env.operador e abra o atalho Graalyst Worker Local." -ForegroundColor Green
