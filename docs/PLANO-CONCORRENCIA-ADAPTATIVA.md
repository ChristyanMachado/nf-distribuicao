# Plano de concorrência adaptativa do Worker

Estado: planejamento aprovado tecnicamente; **não implementado**.

Este documento define a fronteira entre investigação e implementação. Nenhuma
emissão fiscal foi criada para produzir estas conclusões.

## 1. Fatos confirmados

- PC servidor: Intel Core i5-3470, 4 núcleos/4 threads, 15,89 GB de RAM e
  Windows 10 Pro.
- Amostra pontual em repouso, com Valheim aberto: CPU global 9%, 9,21 GB de RAM
  disponível e 43% de memória comprometida. O Valheim usava aproximadamente
  364 MB de working set e os processos Python, 52 MB sem Chromium ativo.
- Essa amostra é apenas baseline; não prova capacidade sob carga.
- Concorrência 1 já possui histórico operacional. Concorrência 2 está ativa no
  PC, mas ainda aguarda uma execução legítima paralela. Concorrência 3 não foi
  validada neste hardware.
- O Worker usa um Chromium e um `BrowserContext` independente por tarefa.
  Reservas são atômicas, com token, lease e dono. Tarefas da mesma credencial
  fiscal são serializadas. Um resultado externo incerto não recebe retry
  automático.
- Hoje cada ciclo reserva até `MAX_CONCORRENCIA` tarefas de uma vez e espera
  todas terminarem. O limite é fixo durante o ciclo.

Conclusão vigente: 1 é o nível comprovado; 2 está liberado como ensaio
operacional monitorado; 3 é apenas teto de projeto e benchmark. Não expor 4 ou
5 nesta etapa.

## 2. Decisão de controle

Usar uma máquina de estados conservadora, inspirada em controle de congestionamento
por aumento aditivo e redução rápida, combinada com guardrails de recursos do
Windows. Não copiar integralmente Vegas/Gradient: há poucas tarefas, durações
curtas e a latência da Receita varia por fatores externos, o que torna um
estimador de minRTT instável.

### Versão 1

- Decide o limite **antes de cada ciclo**.
- O limite fica estável enquanto as tarefas daquele ciclo terminam.
- Uma redução impede novas admissões no ciclo seguinte; nunca interrompe nota
  iniciada.
- Sobe no máximo um nível por decisão: 1 → 2 → 3.
- Desce um nível por pressão sustentada; falha crítica força 1.
- Começa em 1 após instalação, reinício sem histórico confiável ou falha de
  leitura das métricas.

Essa escolha preserva o orquestrador atual. Como as emissões observadas são
curtas, uma janela segura de observação frequentemente seria maior que a própria
nota; admitir trabalho no meio do ciclo adicionaria complexidade sem ganho
demonstrado.

### Versão 2, somente se benchmarks justificarem

Uma bomba de admissão manteria até N slots ocupados e poderia acrescentar uma
tarefa enquanto outras continuam. Isso exige substituir a reserva em lote e o
`asyncio.gather` fechado por um conjunto dinâmico de tarefas, renovar leases e
reconciliar falhas parciais. Não implementar antes de medir que a versão 1 deixa
capacidade relevante ociosa.

## 3. Limites efetivos

O limite usado em cada ciclo é:

```text
min(
  teto local instalado,
  capacity_limit administrativo do executor,
  máximo configurado pelo usuário,
  decisão do controlador,
  quantidade de tarefas elegíveis
)
```

Em modo Manual, `decisão do controlador` é igual ao valor manual: métricas
normais não alteram a escolha. Somente as travas universais já existentes
(lease/admissão inválidos, resultado fiscal incerto, OOM ou memória crítica)
podem impedir novas reservas. Em modo Automático, o controlador determina esse
termo. `MAX_CONCORRENCIA` é o teto local instalado e `capacity_limit` é o teto
administrativo liberado para aquele executor. Ele só pode ser elevado depois
da validação do nível correspondente e é, portanto, o próprio registro de nível
liberado; nenhum estado paralelo de “teto validado” será criado. Definir
`capacity_limit=3` é uma ação administrativa deliberada posterior ao benchmark,
não um efeito automático de a interface conhecer a opção 3.

`admitir_novas=false` é uma trava ortogonal à fórmula numérica: reserva zero
trabalho novo, ainda que o limite calculado seja maior que zero. Ela prevalece
sobre os modos Manual e Automático e não cancela o que já estiver em andamento.

Credenciais iguais continuam serializadas, mesmo se o limite numérico for maior.
O teto local permanece uma trava fora do banco. O banco continua sendo a
autoridade para capacidade e posse.

## 4. Sinais da primeira versão

### Usados na decisão

1. CPU global do host: média e maior valor da janela, não leitura instantânea.
2. Memória física disponível e percentual de commit.
3. CPU e memória privada/working set da árvore Worker + Chromium, para medir o
   custo incremental sem ignorar os outros serviços.
4. Tarefas ativas e pendentes, distinguindo credenciais fiscais diferentes.
5. Resultado dos ciclos recentes: sucesso, timeout pré-emissão, crash do
   navegador, perda de lease e resultado fiscal incerto.
6. Duração recente por tarefa como diagnóstico e comparação com o próprio
   baseline; não como sinal isolado, pois a Receita pode estar lenta.

### Contrato do coletor

Usar `psutil`, fixado nas dependências do pacote após confirmar a versão no
momento da implementação. A cada amostra, produzir:

```text
HostSample(
  monotonic_at,
  cpu_total_percent,
  cpu_per_core_percent[],
  memory_available_bytes,
  memory_percent,
  swap_used_bytes,
  worker_tree_rss_bytes,
  valid
)
```

`cpu_percent` precisa de aquecimento antes de ser considerado válido. A árvore
é o processo Python atual mais filhos recursivos (Chromium). Commit do Windows
pode ser coletado adicionalmente por Performance Counter/GetPerformanceInfo,
mas será diagnóstico opcional na versão 1; a ausência dele não invalida uma
amostra que tenha CPU e memória física confiáveis.

### Contrato do controlador

Módulo puro `concorrencia_adaptativa.py`:

```text
decidir_concorrencia(
  politica,
  estado,
  amostras,
  fila,
  ultimo_ciclo,
  agora_monotonico
) -> DecisaoConcorrencia
```

`EstadoControlador` mantém em memória: limite atual, duas contagens de janelas
saudáveis/pressionadas, cooldown, última mudança e deque das 12 amostras. Não é
persistido; restart deliberadamente volta ao nível 1. `DecisaoConcorrencia`
contém `limite`, `admitir_novas`, `motivo` e `confiavel`.

Motivos fechados e sanitizados: `MANUAL`, `BOOTSTRAP`, `METRICAS_INDISPONIVEIS`,
`SEM_FILA`, `CREDENCIAL_SERIALIZADA`, `MARGEM_SAUDAVEL`, `RETENCAO`,
`COOLDOWN`, `CPU_ALTA`, `MEMORIA_BAIXA`, `FALHA_TECNICA_RECENTE`,
`RESULTADO_FISCAL_INCERTO`, `TETO_LOCAL`, `TETO_ADMINISTRATIVO` e
`NIVEL_NAO_LIBERADO`.

Precedência: bloqueio de admissão → segurança crítica/limite 1 → redução →
cooldown/retenção → promoção. Um ciclo limpo é aquele com ao menos uma tarefa
reservada, todas concluídas sem falha de preparação, navegador, banco, Storage,
lease ou efeito fiscal. Rejeição fiscal/cadastral determinística não é tratada
como pressão de hardware, mas continua falha operacional do lote.

### Somente diagnóstico inicialmente

- Disco, rede, handles, threads e page faults. Registrar nos benchmarks; só
  promover a sinal de controle se aparecerem como gargalo material.
- Processo específico Valheim/Minecraft. O controlador reage à pressão global,
  independentemente de qual programa a causou.

### Não usar

- Um único pico de CPU.
- Número de jogadores.
- Nome de processos como regra de negócio.
- Média de duração misturando tarefas com quantidades diferentes sem contexto.
- Erro de validação cadastral como prova de falta de capacidade.

## 5. Amostragem e histerese provisórias

Valores abaixo são guardrails iniciais para benchmark, não limites definitivos:

- amostra de host a cada 5 segundos;
- janela móvel de 60 segundos;
- 12 amostras por janela; menos de 10 válidas torna a janela inválida;
- promoção exige duas janelas saudáveis consecutivas e ao menos um ciclo limpo
  no nível atual;
- cooldown após promoção: 2 minutos;
- cooldown após redução: 5 minutos;
- nunca subir mais de um nível por ciclo.

Condição provisória saudável para admitir mais uma tarefa:

- CPU média ≤ 55% e máximo da janela < 80%;
- memória disponível ≥ 4 GB;
- commit ≤ 70%, quando o contador opcional estiver disponível;
- nenhuma falha de capacidade, navegador, lease ou portal nos últimos 15
  minutos;
- fila contém trabalho para outra credencial elegível;
- nível solicitado já foi liberado por benchmark.

Condição de retenção: qualquer indicador entre os limites de subida e descida.
Não sobe nem desce.

Reduz um nível para novas admissões quando, por duas janelas:

- CPU média ≥ 75%; ou
- memória disponível < 3 GB; ou
- commit ≥ 80%, quando disponível; ou
- ocorrer timeout de navegação, crash de Chromium ou falha técnica pré-emissão
  quando o nível atual for maior que 1. Não tentar inferir causalidade; reduzir
  conservadoramente e registrar o motivo.

Força limite 1 imediatamente quando:

- memória disponível < 1,5 GB;
- commit ≥ 90%, quando o contador opcional estiver disponível;
- Chromium ou Worker sofrer OOM/crash;
- lease expirar ou surgir reserva abandonada;
- houver resultado fiscal incerto — neste caso `admitir_novas=false` até a
  conferência, em vez de continuar com uma vaga;
- no modo Automático, duas coletas consecutivas obrigatórias ficarem inválidas.
  Uma coleta é inválida quando CPU total ou memória física não puderem ser
  obtidas, forem não finitas ou estiverem fora do intervalo físico esperado. Uma
  janela com menos de 10 das 12 coletas válidas também é inválida e mantém o
  limite em 1.

No modo Manual, perda de métricas não altera o valor escolhido. Memória crítica,
OOM, lease inválido e resultado fiscal incerto continuam travas universais. A
recuperação do modo Automático após métricas inválidas exige uma janela inteira
válida; depois permanece em 1 durante o cooldown de redução.

Uma tarefa em andamento nunca é cancelada por essas regras. Resultado fiscal
incerto mantém as travas atuais e exige reconciliação humana antes de retry.

## 6. Benchmark

### Camada A — recursos, sem portal

Criar uma carga Playwright local que reproduza BrowserContexts, páginas,
downloads e tempos de espera, mas não acessa a Receita. Executar níveis fixos 1,
2 e 3:

1. PC ocioso, sem servidor de jogo;
2. Valheim aberto e sem jogadores;
3. carga controlada adicional representando jogo ativo;
4. futuramente Minecraft, repetindo a matriz.

Para cada célula: aquecimento, no mínimo cinco repetições e mesma carga. Coletar
Performance Monitor a cada 5 ou 15 segundos: CPU total/por núcleo, memória
disponível, commit, paginação, disco e processos. Guardar também métricas da
árvore Worker/Chromium, throughput, p50/p95, erros e processos órfãos.

Essa camada prova envelope do PC e vazamentos, mas não prova que o portal aceita
sessões simultâneas.

### Camada B — portal de homologação

Somente com autorização operacional e dados de teste. Rodar 1, depois 2 e por
fim 3 tarefas de credenciais diferentes. Exigir:

- cinco rodadas por nível ou quantidade equivalente acordada;
- zero mistura de contexto/documento;
- zero duplicidade;
- XML/DANFE corretos para cada tarefa;
- nenhuma falha de menu, timeout ou retry atribuível ao paralelismo;
- Worker saudável e sem processo Chromium órfão ao terminar.

### Camada C — observação passiva de produção

Não criar operação artificial. Em distribuições legítimas, registrar recursos e
resultado. Só promover o teto validado para 3 depois de homologação aprovada e
evidência passiva compatível em produção.

### Aprovação

- Nível 2: throughput materialmente melhor que 1, sem regressão fiscal e com
  margem de CPU/memória em pelo menos 4 de 5 rodadas. A validação do portal
  exige ainda cinco pares paralelos em homologação sem falha atribuível ao
  paralelismo.
- Nível 3: benefício adicional real sobre 2, mesmas garantias e nenhuma pressão
  sustentada nos limiares de redução, além de cinco trios em homologação e três
  lotes legítimos observados passivamente em produção.
- Se 3 não melhorar throughput por serialização/portal, manter teto 2 mesmo que
  o hardware suporte.

## 7. Persistência e Web

Adicionar à linha única `fiscal.configuracoes_operacionais`:

- `modo_concorrencia text not null default 'MANUAL'`, check `MANUAL/AUTOMATICO`;
- `concorrencia_manual smallint not null default 1`, check 1..3;
- `concorrencia_automatica_min smallint not null default 1`, check 1..3;
- `concorrencia_automatica_max smallint not null default 1`, check 1..3;
- check `min <= max`.

Migração deve preservar o comportamento atual: depois de criar as colunas com
defaults conservadores em 1, atualizar explicitamente a única linha do projeto
vigente para `MANUAL`, manual 2, automático mínimo 1 e máximo 2.

Permissões:

- Web administrativo atualiza somente essas colunas e a auditoria existente;
- Worker recebe somente `SELECT` da configuração;
- `anon` e `authenticated` continuam sem acesso direto;
- Web continua sem acesso à tabela privada `fiscal.workers` e lê apenas a view
  sanitizada.

O Worker lê a configuração antes de cada ciclo. Falha de leitura usa 1, não o
último teto maior. A alteração não exige restart.

Na tabela privada `fiscal.workers`, manter `reported_capacity` como capacidade
efetiva aplicada e acrescentar:

- `concurrency_mode text`, check `MANUAL/AUTOMATICO`;
- `suggested_capacity smallint`, check 1..3;
- `decision_reason text`, restrita ao enum de motivos;
- `decision_at timestamptz`;
- `config_applied_at timestamptz`.

Criar função privada `fiscal.worker_report_capacity(...)`, autenticada por
`session_user`, `worker_id`, `run_id` e lease vigente. Ela aceita capacidade
efetiva somente entre 1 e `capacity_limit`, atualiza os campos acima e não toca
em tarefa/token. Revogar `PUBLIC` e conceder EXECUTE apenas aos papéis de
executor. A view `worker_status` expõe somente modo, sugerida, efetiva, motivo e
instantes, além dos campos sanitizados existentes.

Não expor token, credencial, payload ou identificador fiscal nos logs/status.

## 8. UX

Na tela de Configurações, abaixo do horário:

- **Manual** — “Você escolhe quantas notas podem ser processadas ao mesmo
  tempo.” Opções 1, 2 e 3.
- **Automático** — “O sistema ajusta entre o mínimo e o máximo conforme o
  computador e a fila.” Seletores simples de mínimo e máximo.
- Texto permanente: “Reduzir não interrompe notas em andamento; apenas novas
  notas aguardam.”
- Estado: “Usando agora: N por vez”, “Limite liberado neste servidor: N” e, no
  automático, motivo curto como “carga alta”, “margem disponível” ou “modo de
  segurança”.

Enquanto `capacity_limit=2`, a opção 3 aparece desabilitada como “aguarda
validação neste servidor”. Não aceitar e depois reduzir silenciosamente. Não
mostrar parâmetros de CPU/RAM ao usuário comum.

## 9. Arquivos/componentes previstos

- nova migration Web para configuração e telemetria sanitizada;
- `web/src/db/schema.ts`;
- `web/src/app/configuracoes/page.tsx` e `actions.ts`;
- `web/src/lib` para validação e apresentação;
- `worker/src/config.py` para diferenciar teto local de limite efetivo;
- novo módulo `worker/src/concorrencia_adaptativa.py` puro e testável;
- `worker/src/fonte_tarefas.py` para ler configuração/estado;
- `worker/src/servico_coordenado.py` para telemetria/heartbeat;
- `worker/main.py` para escolher o limite antes de reservar;
- testes unitários, de grants, de coordenação e E2E da UI.

Não alterar inicialmente `orquestrador.py`; a versão 1 continua passando um
limite fixo por ciclo.

## 10. Critérios de aceitação da implementação

1. Manual 1/2/3 é aplicado no ciclo seguinte sem restart e respeita o teto
   administrativo do executor; opções acima dele ficam desabilitadas.
2. Automático inicia conservador, nunca ultrapassa 3 nem o teto do banco/local.
3. Redução não cancela tarefas ativas.
4. No Automático, métrica obrigatória ausente força 1; no Manual, mantém a
   escolha salvo uma trava universal.
5. Mesma credencial nunca executa em paralelo.
6. Nenhuma reserva duplicada em dois executores.
7. Resultado externo incerto bloqueia retry e força modo seguro.
8. Toda mudança de limite tem razão sanitizada e testável.
9. UI distingue solicitado, permitido e efetivo sem jargão.
10. Benchmarks e testes não criam efeito fiscal real sem autorização.

## 11. Sequência para GPT-5.6 Terra / Média

1. Implementar e testar primeiro o coletor Windows e o módulo puro de decisão,
   sem ligá-los à emissão.
2. Criar a migration e os testes de privilégios; não aplicar remotamente sem
   autorização explícita.
3. Implementar leitura por ciclo e telemetria, mantendo `MANUAL=2` como
   comportamento efetivo inicial.
4. Implementar UI e testes.
5. Executar Camada A e calibrar thresholds.
6. Publicar em modo observação: calcula decisão automática, mas não a aplica.
7. Comparar decisões sugeridas com métricas reais.
8. Com autorização, habilitar Automático inicialmente com teto liberado 2.
9. Executar Camada B antes de validar teto 3.

Modo observação é uma flag privada do pacote
`CONCORRENCIA_ADAPTATIVA_SHADOW=true`, não um terceiro modo na UI. Nele, a
configuração efetiva permanece Manual 2, enquanto `suggested_capacity`, motivo
e amostras sanitizadas são registrados em log e `worker_status`. A saída dessa
fase exige ao menos cinco ciclos com trabalho e nenhuma sugestão que viole os
guardrails; só então a opção Automático pode ser publicada.

## 12. Fontes técnicas

- Microsoft, Performance Monitor e contadores do Windows:
  <https://learn.microsoft.com/en-us/troubleshoot/windows-server/performance/troubleshoot-performance-problems-in-windows>
- Microsoft, informações de memória por sistema/processo:
  <https://learn.microsoft.com/en-us/windows/win32/memory/memory-performance-information>
- Netflix, concurrency-limits (Vegas, Gradient2 e backoff por falha):
  <https://github.com/Netflix/concurrency-limits/blob/main/README.md>
- Envoy, Adaptive Concurrency e amostragem por janelas:
  <https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/adaptive_concurrency_filter.html>
