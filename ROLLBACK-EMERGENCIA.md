# Recuperação de emergência — NF Distribuição

Documento operacional curto. Não contém credenciais.

## Estado publicado

- Repositório: `https://github.com/ChristyanMachado/nf-distribuicao.git`
- Branch do checkpoint: `codex/christyan-incidente-web-timeout`
- Checkpoint atual: `9be33f2` (`docs(worker): planejar concorrencia adaptativa`)
- Estado estável anterior conhecido: `1815811` (`fix(worker): tolerar lentidao na transicao para ICMS`)
- O commit `1815811` é a última versão do Worker validada antes da ativação da
  concorrência 2. A concorrência 2 foi uma configuração operacional, não uma
  prova de que o nível 2 está validado.

## Verificar versão no PC servidor

Abra PowerShell como administrador:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& 'C:\Pacotes\worker-servidor-489033e\windows\Gerenciar-Worker.ps1' -Action Status
Get-Content 'C:\ProgramData\GraalystWorker\shared\state\health.json' -Raw
```

Confira `versao`, `estado`, `tarefas_ativas` e `codigo_saida`. O estado normal
é `ok` ou `espera`; `manutencao` significa que o marcador de manutenção ainda
está ativo.

## Contingência rápida: concorrência 2 → 1

Esta é a primeira medida. Ela não altera o histórico Git e não interrompe uma
tarefa já iniciada; aguarde o ciclo atual terminar ou faça a parada drenada.

```powershell
$root = 'C:\ProgramData\GraalystWorker'
$envFile = Join-Path $root 'shared\config\worker.env'
$pkg = 'C:\Pacotes\worker-servidor-489033e'

& (Join-Path $pkg 'windows\Gerenciar-Worker.ps1') -Action Stop

$linhas = Get-Content -LiteralPath $envFile
$linhas = $linhas -replace '^MAX_CONCORRENCIA=.*$', 'MAX_CONCORRENCIA=1'
$linhas | Set-Content -LiteralPath $envFile -Encoding UTF8

& (Join-Path $pkg 'windows\Gerenciar-Worker.ps1') -Action Start
Start-Sleep -Seconds 20
& (Join-Path $pkg 'windows\Gerenciar-Worker.ps1') -Action Status
Get-Content (Join-Path $root 'shared\state\health.json') -Raw
```

O limite local 1 já impede duas reservas mesmo que o teto administrativo do
executor ainda esteja em 2. Se quiser que o banco também mostre o teto 1,
execute no SQL Editor administrativo do Supabase, depois de conferir o nome:

```sql
UPDATE fiscal.workers
SET capacity_limit = 1
WHERE worker_id = 'pc-servidor-01';
```

Não execute esse SQL com `anon`, `authenticated` ou com o papel do Worker.

## Rollback sem reescrever histórico (preferido)

No clone de desenvolvimento, não no diretório operacional do PC:

```powershell
git fetch origin
git switch codex/christyan-incidente-web-timeout
git pull --ff-only origin codex/christyan-incidente-web-timeout
git revert --no-edit 1815811..9be33f2
git push origin codex/christyan-incidente-web-timeout
```

Isso cria novos commits que desfazem o intervalo publicado. Revise o diff e o
deploy antes de instalar qualquer pacote resultante.

## Emergência: executar exatamente o Worker estável

Prefira o pacote verificado do commit estável, se ele estiver disponível:

```powershell
$pkg = 'C:\Pacotes\worker-servidor-1815811-py3137.zip'
$sha = (Get-FileHash $pkg -Algorithm SHA256).Hash
$sha
```

O hash registrado para esse pacote é:
`A4468EFF62A69B0E4F67E55DBC3A9CF91AE85082E23019D650CC7F1D08F85BBA`.
Se o hash exibido for diferente, pare e não instale o arquivo.

Com o pacote confirmado:

```powershell
$env:__WorkerPackage = 'C:\Pacotes\worker-servidor-1815811-py3137.zip'
& 'C:\Pacotes\worker-servidor-489033e\windows\Gerenciar-Worker.ps1' `
  -Action Update `
  -PythonExe 'C:\Program Files\Python313\python.exe' `
  -Package $env:__WorkerPackage `
  -Sha256 'A4468EFF62A69B0E4F67E55DBC3A9CF91AE85082E23019D650CC7F1D08F85BBA'
```

O instalador drena antes de trocar a versão, confirma health em manutenção e
restaura a versão anterior automaticamente se a nova não ficar saudável.
Depois de revisar a configuração, retome o processamento:

```powershell
& 'C:\Pacotes\worker-servidor-489033e\windows\Gerenciar-Worker.ps1' -Action Resume
Start-Sleep -Seconds 20
& 'C:\Pacotes\worker-servidor-489033e\windows\Gerenciar-Worker.ps1' -Action Status
& 'C:\Pacotes\worker-servidor-489033e\windows\Gerenciar-Worker.ps1' -Action Logs
```

Não use `git reset --hard` no branch publicado nem no diretório operacional.
Ele pode descartar trabalho local e não é necessário para executar o pacote
estável.

## Retornar ao checkpoint atual

Depois de resolver o incidente, publique/prepare um pacote baseado em
`9be33f2`, confirme o SHA do ZIP e use `-Action Update` com esse pacote. Não
aponte o PC diretamente para um clone de desenvolvimento: a instalação deve
passar pelo verificador de release e pela confirmação de health.
