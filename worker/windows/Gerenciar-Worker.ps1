# Executar como administrador apenas na maquina que recebera o Worker.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Install','Start','Stop','Status','Logs','Update','Rollback','Resume')][string]$Action,
    [string]$Root = 'C:\ProgramData\GraalystWorker',
    [string]$PythonExe,
    [string]$Package,
    [string]$Sha256,
    [string]$ConfigFile,
    [int]$TimeoutSeconds = 1500
)
$ErrorActionPreference = 'Stop'
$TaskName = 'GraalystWorker'
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
if ($Root -eq [IO.Path]::GetPathRoot($Root).TrimEnd('\') -or $TimeoutSeconds -lt 30) { throw 'Destino ou prazo invalido.' }
$control = Join-Path $Root 'shared\control'
$health = Join-Path $Root 'shared\state\health.json'

function Get-Health {
    if (Test-Path -LiteralPath $health) {
        try { return Get-Content -LiteralPath $health -Raw | ConvertFrom-Json } catch { return $null }
    }
    return $null
}
function Set-Control([string]$Name) {
    New-Item -ItemType File -Path (Join-Path $control $Name) -Force | Out-Null
}
function Remove-Control([string]$Name) {
    $target = Join-Path $control $Name
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
}
function Wait-Stopped {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $task = Get-ScheduledTask -TaskName $TaskName
        if ($task.State -ne 'Running') { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw 'Parada nao concluida. O processo foi preservado; confira a tarefa fiscal e os logs.'
}
function Wait-Healthy([string]$Version, [string]$PreviousBoot) {
    $deadline = (Get-Date).AddSeconds(180)
    do {
        $h = Get-Health
        if ($h -and $h.versao -eq $Version -and $h.boot_id -ne $PreviousBoot -and
            $h.estado -eq 'manutencao' -and $h.codigo_saida -eq 0 -and
            ((Get-Date).ToUniversalTime() - [datetime]::Parse($h.atualizado_em).ToUniversalTime()).TotalSeconds -lt 45) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw 'A nova versao nao comprovou saude em manutencao.'
}
function Set-Pointer([string]$Version) {
    $tempPointer = Join-Path $Root 'current.pending.json'
    @{version=$Version} | ConvertTo-Json -Compress | Set-Content -LiteralPath $tempPointer -Encoding UTF8
    Move-Item -LiteralPath $tempPointer -Destination (Join-Path $Root 'current.json') -Force
}
function Prepare-Release {
    if (-not $PythonExe -or -not $Package -or $Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Informe PythonExe, Package e Sha256.' }
    $verifier = Join-Path $PSScriptRoot 'release.py'
    $raw = & $PythonExe $verifier $Package $Sha256
    if ($LASTEXITCODE -ne 0) { throw 'Validacao do pacote falhou.' }
    $manifest = $raw | ConvertFrom-Json
    $release = Join-Path $Root ('releases\' + $manifest.version)
    & $PythonExe $verifier $Package $Sha256 --destination $release | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Extracao recusada.' }
    & $PythonExe -m venv (Join-Path $release '.venv') | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Preparacao do Python falhou.' }
    $runtime = Join-Path $release '.venv\Scripts\python.exe'
    $wheels = Join-Path $release 'wheels'
    if (Test-Path -LiteralPath $wheels) {
        & $runtime -m pip install --no-index --find-links $wheels -r (Join-Path $release 'windows\requirements-windows.lock') | Out-Host
    } else {
        & $runtime -m pip install --disable-pip-version-check --only-binary=:all: -r (Join-Path $release 'windows\requirements-windows.lock') | Out-Host
    }
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao das dependencias falhou. A versao anterior permanece selecionada.' }
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $release 'browsers'
    & $runtime -m playwright install chromium | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao do Chromium falhou.' }
    Push-Location $release
    try { & $runtime -m scripts.verificar_runtime_playwright | Out-Host } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'Chromium nao passou na verificacao local.' }
    return $manifest.version
}

if ($Action -eq 'Status') {
    Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName,State
    Get-Health | Select-Object estado,versao,worker_id,boot_id,pid,tarefas_ativas,atualizado_em,codigo_saida
    exit
}
if ($Action -eq 'Logs') {
    Get-Content -LiteralPath (Join-Path $Root 'shared\logs\worker.log') -Tail 80
    exit
}
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Abra PowerShell como administrador para alterar o servico.' }
$managementMutex = New-Object Threading.Mutex($false,'Global\GraalystWorkerManagement')
if (-not $managementMutex.WaitOne(0)) { $managementMutex.Dispose(); throw 'Outra operacao de manutencao esta em andamento.' }
try {

if ($Action -eq 'Install') {
    if (Test-Path -LiteralPath $Root) { throw 'Destino ja existe. Use Update; nao sobrescrever instalacao.' }
    if (-not $ConfigFile -or -not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) { throw 'Informe o arquivo privado de configuracao.' }
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw 'A tarefa ja existe.' }
    $account = 'GraalystWorker'
    if (Get-LocalUser -Name $account -ErrorAction SilentlyContinue) { throw 'A conta dedicada ja existe; revise a instalacao anterior.' }
    $bytes = New-Object byte[] 36
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $password = [Convert]::ToBase64String($bytes) + 'aA1!'
    $secure = ConvertTo-SecureString $password -AsPlainText -Force
    $user = New-LocalUser -Name $account -Password $secure -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword
    New-Item -ItemType Directory -Path $Root | Out-Null
    & icacls.exe $Root /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' ('*' + $user.SID.Value + ':(OI)(CI)RX') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel restringir permissoes.' }
    foreach ($folder in @('releases','bootstrap','shared\config','shared\control','shared\state','shared\logs','shared\downloads','shared\temp')) {
        New-Item -ItemType Directory -Path (Join-Path $Root $folder) | Out-Null
    }
    foreach ($folder in @('state','logs','downloads','temp')) {
        & icacls.exe (Join-Path $Root ('shared\'+$folder)) /grant:r ('*' + $user.SID.Value + ':(OI)(CI)M') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'ACL da pasta operacional falhou.' }
    }
    Copy-Item -LiteralPath $ConfigFile -Destination (Join-Path $Root 'shared\config\worker.env')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Run-Worker.ps1') -Destination (Join-Path $Root 'bootstrap\Run-Worker.ps1')
    Set-Control 'hold.request'
    $version = Prepare-Release
    Set-Pointer $version
    $command = '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "' + (Join-Path $Root 'bootstrap\Run-Worker.ps1') + '" -Root "' + $Root + '"'
    $actionTask = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $command -WorkingDirectory $Root
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([timespan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Priority 7
    Register-ScheduledTask -TaskName $TaskName -Action $actionTask -Trigger $trigger -Settings $settings -User ($env:COMPUTERNAME+'\'+$account) -Password $password -RunLevel Limited | Out-Null
    $password = $null
    Start-ScheduledTask -TaskName $TaskName
    Wait-Healthy $version ''
    Write-Output 'Instalado e saudavel em manutencao. Execute Resume apos concluir o cadastro e o corte coordenado no banco.'
    exit
}
if ($Action -eq 'Stop') {
    Set-Control 'drain.request'
    Wait-Stopped
    Write-Output 'Executor parado. Tarefa do Windows preservada; marcador impede processamento apos reboot.'
    exit
}
if ($Action -eq 'Start' -or $Action -eq 'Resume') {
    Remove-Control 'drain.request'
    if ($Action -eq 'Resume') { Remove-Control 'hold.request' }
    Start-ScheduledTask -TaskName $TaskName
    Write-Output 'Inicio solicitado. Confira Status e o painel de tarefas.'
    exit
}

# Preparacao termina antes de pedir parada: nenhum download ocorre durante o corte.
$previous = (Get-Content -LiteralPath (Join-Path $Root 'current.json') -Raw | ConvertFrom-Json).version
if ($Action -eq 'Rollback') {
    $version = (Get-Content -LiteralPath (Join-Path $Root 'previous.json') -Raw | ConvertFrom-Json).version
    if ($version -notmatch '^[a-f0-9]{40}$' -or -not (Test-Path -LiteralPath (Join-Path $Root ('releases\'+$version+'\.venv\Scripts\python.exe')))) { throw 'Versao anterior indisponivel.' }
} else { $version = Prepare-Release }
$oldHealth = Get-Health
Set-Control 'hold.request'
Set-Control 'drain.request'
Wait-Stopped
$stopped = Get-Health
if (-not $stopped -or $stopped.estado -ne 'parado' -or $stopped.tarefas_ativas -ne 0) {
    throw 'Parada sem prova de drenagem. Revise as reservas antes de atualizar; nada foi trocado.'
}
try {
    @{version=$previous} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $Root 'previous.json') -Encoding UTF8
    Set-Pointer $version
    Remove-Control 'drain.request'
    Start-ScheduledTask -TaskName $TaskName
    Wait-Healthy $version $oldHealth.boot_id
    Remove-Control 'hold.request'
    Write-Output 'Atualizacao concluida e saude confirmada.'
} catch {
    Set-Control 'drain.request'
    Wait-Stopped
    Set-Pointer $previous
    Remove-Control 'drain.request'
    Start-ScheduledTask -TaskName $TaskName
    Wait-Healthy $previous $oldHealth.boot_id
    Write-Output 'Versao anterior restaurada em manutencao. Confira Status; use Resume apos revisar a falha.'
    throw 'Atualizacao recusada; rollback aplicado.'
}
} finally {
    $managementMutex.ReleaseMutex()
    $managementMutex.Dispose()
}
