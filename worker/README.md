# Worker — Automação NFP-e

Worker Python/Playwright que reserva tarefas no PostgreSQL, executa cada nota
em um `BrowserContext` independente, valida a autorização e envia XML/DANFE ao
Supabase Storage privado. O fluxo completo já foi comprovado em homologação;
produção fiscal permanece bloqueada.

## Arquitetura atual

```text
PostgreSQL/Supabase → reserva com token → 1 Chromium + até 3 contextos
                    → Receita PR homologação → XML/DANFE → Storage + status
```

- somente Playwright Async;
- snapshot/hash imutável e token fencing;
- resultado fiscal incerto nunca recebe retry automático;
- credenciais fiscais ficam apenas no ambiente protegido do Worker;
- XML/DANFE são validados antes do upload;
- serviço persistente audita o papel do banco antes do primeiro ciclo.

## Desenvolvimento local

No PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest tests -v
.\.venv\Scripts\python.exe -m compileall main.py src scripts tests
```

Copie `.env.example` para `.env`, preencha localmente e nunca versione esse
arquivo. Os roteiros controlados e todas as travas estão em
`../docs/HANDOFF.md` e `../docs/DEPLOYMENT.md`.

## Serviço persistente em VM/container

O `Dockerfile` usa a imagem oficial Playwright 1.48.0 Noble, fixada na mesma
versão da biblioteca Python. O `compose.yaml` não publica portas, usa raiz
somente leitura, volumes para logs/downloads e healthcheck sanitizado.

O serviço recusa iniciar se `WORKER_PERSISTENTE=true` não estiver acompanhado
por modo headless, Inspector/pausas desligados, banco, Storage, concorrência
explícita e todas as travas de homologação. O comando de runtime é:

```powershell
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 worker
```

Antes do `up`, execute as auditorias e confirme que não existe tarefa
involuntária elegível, pois o polling começa a reservar assim que sobe:

```powershell
docker compose run --rm worker python -m scripts.verificar_privilegios_banco
docker compose run --rm worker python -m scripts.verificar_canal_banco
```

Use `docker compose stop` para dar ao ciclo atual até cinco minutos de
encerramento gracioso. Consulte `../docs/DEPLOYMENT.md` para as variáveis e a
sequência completa. A imagem ainda precisa ser construída e testada na VM;
Docker não está instalado na estação onde esta preparação foi criada.

`LIMPAR_DOCUMENTOS_EXPIRADOS` começa como `false`. Quando habilitada após a
migration `0011` e a auditoria do papel, remove XML/DANFE vencidos pelo Storage
e preserva o histórico da nota. Não habilite a flag antes de validar o ciclo em
homologação com um documento de teste vencido.

## Limites atuais

- execução persistente continua exclusiva de homologação;
- scheduler noturno, alertas e métricas externas ainda não foram implementados;
- recuperação automática de upload interrompido deve ocorrer sem reemitir;
- primeiro piloto na VM começa com `MAX_CONCORRENCIA=1`; subir para 3 somente
  após medir CPU/RAM e isolamento.
