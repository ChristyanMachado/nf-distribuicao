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
somente leitura, volumes para logs/downloads, healthcheck sanitizado e rotação
dos logs do próprio Docker (5 arquivos de até 10 MB).

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

O processo permanece ativo 24 horas para limpeza, retomada de upload e
recuperação histórica. A janela de novas emissões é configurada no Web,
persistida em `fiscal.configuracoes_operacionais` e lida a cada ciclo, com
padrão `00:00–06:00` em `America/Sao_Paulo`. Fora dela, tarefas de emissão
ficam pendentes e não são reservadas. Uma tarefa reservada antes do limite
continua normalmente até terminar; o horário nunca encerra Chromium nem o
serviço. A dependência `tzdata` fixa a mesma base de fuso no Windows, Linux e
container.

`LIMPAR_DOCUMENTOS_EXPIRADOS` começa como `false`. Quando habilitada após a
migration `0011` e a auditoria do papel, remove XML/DANFE vencidos pelo Storage
e preserva o histórico da nota. Não habilite a flag antes de validar o ciclo em
homologação com um documento de teste vencido.

`PROCESSAR_RECUPERACOES_DOCUMENTOS` também começa como `false`. Com limpeza,
Storage e fila banco habilitados, processa a fila exclusiva criada pelo botão
**Recuperar PDF e XML**. A consulta usa a chave permanente, não emite outra nota
e publica os documentos recuperados por exatamente 7 dias. Ative somente após
aplicar `0011`/`0012` e reprovisionar/auditar o papel do Worker.

## Limites atuais

- execução persistente continua exclusiva de homologação;
- janela noturna interna está implementada; alertas e métricas externas ainda
  não foram implementados;
- recuperação automática de upload interrompido deve ocorrer sem reemitir;
- primeiro piloto na VM começa com `MAX_CONCORRENCIA=1`; subir para 3 somente
  após medir CPU/RAM e isolamento.
