# Guia operacional — Worker Windows

Atualizado em 12/09/2026. Nunca colocar senhas, URLs de banco preenchidas ou
credenciais fiscais neste guia, no Git ou em chat.

## A. Contingência local — computador de desenvolvimento

Use o pacote manual já preparado. Ele não instala serviço, não agenda execução
e processa uma nota por vez.

### Preparação única

```powershell
cd 'G:\Downloads\nf-distribuicao\dist\graalyst-worker-local'
.\INSTALAR.cmd
```

O comando exige Python 3.11, 3.12 ou 3.13, cria `.venv`, instala dependências
e Chromium, e gera `.env.operador`. Preencher esse arquivo somente com a
conexão do papel `nf_worker_local`, Storage e credenciais fiscais já usadas na
contingência. Não usar a conexão de proprietário do Web nem o papel de VM.

### Uso em uma noite de contingência

1. Confirmar que nenhum servidor/VM está processando tarefas. A própria janela
   bloqueia se a VM estiver com login/sessão ou houver tarefa em andamento.
2. Abrir o atalho **Graalyst Worker Local** ou executar:

```powershell
cd 'G:\Downloads\nf-distribuicao\dist\graalyst-worker-local'
.\ABRIR-WORKER.cmd
```

3. Usar **Atualizar fila**, conferir produtos, quantidades e valores no Web,
   então usar **Executar lote** e confirmar uma única vez.
4. Conferir as notas e documentos no Web ao terminar. A janela impede
   fechamento normal enquanto o lote está em execução.

Consulta sem abrir a janela:

```powershell
cd 'G:\Downloads\nf-distribuicao\dist\graalyst-worker-local'
.\.venv\Scripts\python.exe -m scripts.executar_lote_local --env-file .\.env.operador --listar
```

Logs: `G:\Downloads\nf-distribuicao\dist\graalyst-worker-local\logs\contingencia-local\`.
O processo encerra sozinho ao fim do lote. Em falha, não tentar de novo antes
de conferir tarefa e nota; não encerrar Python pelo Gerenciador de Tarefas
durante emissão, salvo emergência física.

## B. Instalação reproduzível no PC servidor

Pacote atual:

```text
G:\Downloads\nf-distribuicao\dist\worker-servidor-f76fc9f.zip
SHA-256: 74545923400275B8F65AB2D9AA2925F5B5DD5A68F086DE0638414EBA669AD457
```

Pré-requisitos: Windows 10/11 x64, administrador, internet, Python 3.13.7 x64
para todos os usuários em `C:\Program Files\Python313\python.exe`, energia sem
suspensão/hibernação e `worker.env` privado entregue por canal seguro.

Cada máquina precisa de papel e ID exclusivos. Sugestão:

| Campo | Temporário | Definitivo |
| --- | --- | --- |
| Papel PostgreSQL | `nf_executor_pc_temporario` | `nf_executor_pc_definitivo` |
| `WORKER_ID` | `pc-servidor-temporario` | `pc-servidor-definitivo` |
| Capacidade inicial | `1` | `1` |
| `MAX_CONCORRENCIA` inicial | `1` | `1` |

O técnico cria cada papel com `web/scripts/provisionar-executor.sql.template`.
A base coordenada já existe, mas o gate está desligado. Não executar
`ativar-workers-coordenados.sql` antes do ensaio físico e do heartbeat.

O `worker.env` deve partir de `worker/windows/worker.env.example`. No primeiro
ensaio manter `WORKER_COORDENADO=true`, `WORKER_PERSISTENTE=true`,
`HEADLESS=true`, `INSPECIONAR=false`, `FONTE_TAREFAS=banco`,
`TESTAR_INTEGRACAO_BANCO=true`, `PROCESSAR_FILA_BANCO=true`,
`MODO_OPERACAO=automatico`, `MAX_CONCORRENCIA=1`,
`AMBIENTE_EMISSAO=teste`, `TESTAR_EMISSAO_HOMOLOGACAO=true` e
`HABILITAR_PRODUCAO_FISCAL=false`. Preencher os segredos somente no arquivo
privado; não habilitar impressão, limpeza, recuperação ou cancelamento no
primeiro ensaio.

Copiar o ZIP para `C:\Pacotes\` e a configuração para
`C:\ConfiguracaoPrivada\worker.env`. No PowerShell como administrador:

```powershell
Get-FileHash 'C:\Pacotes\worker-servidor-f76fc9f.zip' -Algorithm SHA256
```

O resultado deve ser o hash deste guia. Então, na pasta extraída do pacote:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Install `
  -PythonExe 'C:\Program Files\Python313\python.exe' `
  -Package 'C:\Pacotes\worker-servidor-f76fc9f.zip' `
  -Sha256 '74545923400275B8F65AB2D9AA2925F5B5DD5A68F086DE0638414EBA669AD457' `
  -ConfigFile 'C:\ConfiguracaoPrivada\worker.env'
```

O primeiro início fica em manutenção: roda no boot, sem terminal/Chrome visível
e sem reservar tarefas. Verificar e depois reiniciar o PC sem login:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Status
.\windows\Gerenciar-Worker.ps1 -Action Logs
```

Somente depois do corte coordenado autorizado, `Resume` libera o trabalho:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Resume
```

Suporte diário: `Status`, `Logs`, `Stop` e `Start` no mesmo script. `Stop`
drena o ciclo atual; não terminar o processo à força durante emissão.

## C. Teste de duas tarefas simultâneas

A estrutura é segura para **preparar** esse teste: uma instância de Chromium
cria um `BrowserContext` exclusivo por tarefa; cookies, storage e downloads não
são compartilhados. O banco usa `FOR UPDATE SKIP LOCKED`, token e lease para
impedir reserva duplicada. No modo coordenado, tarefas da mesma credencial
fiscal ainda recebem trava de sessão e não fazem login simultâneo.

Ainda assim, duas emissões reais paralelas não estão aprovadas. Em 05/09, duas
tarefas na VM Micro falharam nos menus da Receita; uma execução sequencial
posterior funcionou. O problema não exige refatoração estrutural agora, mas
exige evidência no novo PC e no portal. A regra vigente é ensaiar 2 primeiro em
homologação e manter produção em 1 até aprovação específica.

Roteiro do ensaio:

1. Instalar e reiniciar em manutenção.
2. Com concorrência 1, concluir uma nota de homologação e conferir logs,
   documento, status e execução em background.
3. Criar duas tarefas de homologação de emitentes/credenciais diferentes.
4. Parar o serviço; elevar a capacidade cadastrada do PC para 2 e também
   `MAX_CONCORRENCIA=2`; iniciar novamente.
5. Observar painel Web, logs, CPU, memória, estabilidade e os dois documentos.

O teste passa somente se ambas concluírem sem retry, sem timeout/resultado
incerto, com contexto e documento corretos, e o serviço continuar saudável.
Qualquer interferência, falha de menu, instabilidade ou consumo inadequado
reverte a configuração para 1. Não procurar o limite máximo nesta fase.

## Referências verificadas

- Contingência: `worker/scripts/executar_lote_local.py` e `worker/operador/app.py`.
- Serviço Windows: `worker/windows/Gerenciar-Worker.ps1` e `worker/windows/launch.py`.
- Isolamento: `worker/src/orquestrador.py`.
- Reserva/token/lease: `worker/src/fonte_tarefas.py`.
- Coordenação: `worker/src/servico_coordenado.py`.
