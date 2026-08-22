warning: in the working copy of '.gitignore', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/AI-CONTEXT.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/HANDOFF.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/.env.example', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/RECON.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/main.py', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/src/auth.py', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/src/config.py', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/src/orquestrador.py', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/src/utils/debug.py', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/tests/test_auth.py', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/tests/test_debug.py', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'worker/tests/test_orquestrador.py', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/.gitignore b/.gitignore[m
[1mindex 94eb7de..9d92da2 100644[m
[1m--- a/.gitignore[m
[1m+++ b/.gitignore[m
[36m@@ -8,6 +8,7 @@[m [mnode_modules/[m
 .venv/[m
 __pycache__/[m
 *.pyc[m
[32m+[m[32m.pytest_cache/[m
 [m
 # Worker runtime[m
 worker/downloads/*[m
[1mdiff --git a/docs/AI-CONTEXT.md b/docs/AI-CONTEXT.md[m
[1mindex 2329a49..aaff9d4 100644[m
[1m--- a/docs/AI-CONTEXT.md[m
[1m+++ b/docs/AI-CONTEXT.md[m
[36m@@ -217,20 +217,28 @@[m [mCredenciais não devem ser hardcoded.[m
 [m
 ## src/flows/emissao.py[m
 [m
[31m-Ainda contém grande parte do fluxo fiscal original baseado na API[m
[31m-síncrona.[m
[32m+[m[32mMigrado para Async em 20/08 (junto com o reconhecimento ao vivo que[m
[32m+[m[32mconfirmou os seletores até o fim de Transporte). Todas as funções que[m
[32m+[m[32mtocam o Playwright são `async def`. Exceção: `validar_antes_de_emitir()`[m
[32m+[m[32mcontinua síncrona de propósito (só faz `input()`, não usa Playwright).[m
 [m
[31m-Ainda NÃO foi completamente migrado para Async.[m
[32m+[m[32mTambém ganhou `carregar_tarefa_de_json()`, que monta o dataclass `Tarefa` a[m
[32m+[m[32mpartir de `tarefa_real.json`.[m
 [m
[31m-Não misturar `Page` síncrona com `Page` assíncrona.[m
[32m+[m[32mNão misturar `Page` síncrona com `Page` assíncrona (não há mais nenhum[m
[32m+[m[32mmódulo do projeto em Sync, mas o princípio continua valendo pra qualquer[m
[32m+[m[32mcódigo novo).[m
 [m
 ---[m
 [m
 # 6. Próximo passo imediato[m
 [m
[31m-Migrar gradualmente o fluxo fiscal para Async. Enquanto isso, o Worker só[m
[31m-permite o smoke test de autenticação quando `SMOKE_TEST=true`; o fluxo fiscal[m
[31m-completo permanece intencionalmente desabilitado.[m
[32m+[m[32mO fluxo fiscal já está todo em Async e ligado ao `main.py` via a flag[m
[32m+[m[32m`TESTAR_PREENCHIMENTO_COMPLETO` (preenche até Transporte, nunca clica em[m
[32m+[m[32m"Emitir"). O que falta agora não é mais migração — é validação ao vivo e a[m
[32m+[m[32metapa de emissão/resumo em si. Enquanto isso, o Worker só permite emissão de[m
[32m+[m[32mverdade quando essa etapa for explicitamente implementada e testada; hoje[m
[32m+[m[32mmesmo com todas as flags ligadas o fluxo para antes de `emitir()`.[m
 [m
 Ordem:[m
 [m
[36m@@ -352,6 +360,15 @@[m [mgratuita.[m
 - Documentar decisões arquiteturais.[m
 - Manter o Worker desacoplado da aplicação web.[m
 - A unidade de execução é a tarefa, não o cliente.[m
[32m+[m[32m- Nenhum dataclass com dado sensível (senha, CPF) deve confiar no `__repr__`[m
[32m+[m[32m  automático — sobrescrever explicitamente pra nunca vazar em log.[m
[32m+[m[32m- `INSPECIONAR`/`page.pause()` só fazem sentido com `HEADLESS=false`; em[m
[32m+[m[32m  servidor (`HEADLESS=true`) isso precisa ser automaticamente ignorado, não[m
[32m+[m[32m  travar a tarefa esperando um humano.[m
[32m+[m[32m- Concorrência (`asyncio.gather`) deve ter um limite configurável[m
[32m+[m[32m  (`MAX_CONCORRENCIA`) disponível antes do Worker crescer de 3 pra N[m
[32m+[m[32m  tarefas — mesmo que hoje, sem configurar nada, o comportamento continue[m
[32m+[m[32m  sem limite (idêntico ao já validado).[m
 [m
 ---[m
 [m
[36m@@ -377,11 +394,17 @@[m [mgratuita.[m
 [m
 ✅ Navegação Async — testes unitários aprovados; teste ao vivo pendente[m
 [m
[31m-🔄 Fluxo fiscal Async[m
[32m+[m[32m✅ Fluxo fiscal Async — todas as etapas até Transporte implementadas e[m
[32m+[m[32mligadas ao `main.py` (`TESTAR_PREENCHIMENTO_COMPLETO`); teste ao vivo[m
[32m+[m[32mpendente[m
 [m
[31m-⏳ Preenchimento completo[m
[32m+[m[32m✅ Revisão de segurança/robustez/desempenho (20/08) — ver[m
[32m+[m[32m`docs/HANDOFF.md` pro detalhe: repr seguro de credenciais, guard de[m
[32m+[m[32mheadless no Inspector, `debug.py` migrado pra Async, limite de[m
[32m+[m[32mconcorrência configurável (`MAX_CONCORRENCIA`)[m
 [m
[31m-⏳ Validação[m
[32m+[m[32m⏳ Validação (etapa de resumo/revisão antes de emitir — não alcançada no[m
[32m+[m[32mreconhecimento ao vivo ainda)[m
 [m
 ⏳ Emissão[m
 [m
[1mdiff --git a/docs/HANDOFF.md b/docs/HANDOFF.md[m
[1mindex 0d0d9aa..98e93b2 100644[m
[1m--- a/docs/HANDOFF.md[m
[1m+++ b/docs/HANDOFF.md[m
[36m@@ -1,6 +1,201 @@[m
 # Handoff — Estado Atual[m
 [m
[31m-## Última alteração[m
[32m+[m[32m## Última alteração — Revisão geral (segurança, robustez, desempenho)[m
[32m+[m
[32m+[m[32mRevisão completa do repositório antes de continuar o desenvolvimento[m
[32m+[m[32m(código + docs lidos primeiro, arquitetura preservada). Nenhuma mudança[m
[32m+[m[32mestética/UI. Resumo do que foi encontrado e corrigido:[m
[32m+[m
[32m+[m[32m**Segurança (achados reais, corrigidos):**[m
[32m+[m
[32m+[m[32m1. `CredencialCliente` (dataclass) tinha `__repr__` automático expondo[m
[32m+[m[32m   `login` (CPF) e `senha` em texto puro — qualquer `logger.info(credencial)`[m
[32m+[m[32m   ou exceção que formatasse o objeto inteiro vazaria a senha pro arquivo[m
[32m+[m[32m   de log. Sobrescrito pra sempre mostrar `'***'`. Testado[m
[32m+[m[32m   (`test_repr_da_credencial_nunca_expoe_login_nem_senha`).[m
[32m+[m[32m2. `realizar_login()`: os dois `.fill()` de usuário/senha agora capturam[m
[32m+[m[32m   qualquer exceção do Playwright e levantam uma mensagem própria, sem[m
[32m+[m[32m   encadear a exceção original (`from None`) — defesa contra a mensagem de[m
[32m+[m[32m   erro do Playwright ecoar o valor digitado no log/traceback.[m
[32m+[m[32m3. `.env`, `worker/tarefa_real.json`, `worker/downloads/*` e[m
[32m+[m[32m   `worker/logs/*` já estavam corretamente fora do Git — confirmado, sem[m
[32m+[m[32m   mudança necessária.[m
[32m+[m[32m4. Nenhuma credencial hardcoded, nenhum `subprocess`/`os.system`/`eval` no[m
[32m+[m[32m   código — confirmado.[m
[32m+[m
[32m+[m[32m**Robustez pro cenário de servidor/VM (novo problema real encontrado):**[m
[32m+[m
[32m+[m[32m5. `INSPECIONAR=true` chamava `page.pause()` sem checar se o navegador[m
[32m+[m[32m   está headless. Numa VM sem tela, isso travaria a tarefa indefinidamente[m
[32m+[m[32m   esperando um humano que nunca aparece. Corrigido: `INSPECIONAR` agora só[m
[32m+[m[32m   abre o Inspector quando `HEADLESS=false`; em headless só loga um aviso e[m
[32m+[m[32m   segue o fluxo de erro normal.[m
[32m+[m[32m6. `src/utils/debug.py` (`rodar_etapa`) ainda estava em Playwright Sync —[m
[32m+[m[32m   sobra de antes da migração. Como o resto do projeto já é 100% Async,[m
[32m+[m[32m   isso era uma armadilha: se alguém plugasse essa função no fluxo real, as[m
[32m+[m[32m   chamadas a `page.screenshot()`/`page.pause()` teriam sido coroutines[m
[32m+[m[32m   nunca aguardadas, falhando silenciosamente. Convertido para Async[m
[32m+[m[32m   (ainda não está plugado em nenhum lugar — fica pronto pra quando for).[m
[32m+[m
[32m+[m[32m**Desempenho / escala (3 → N tarefas num servidor):**[m
[32m+[m
[32m+[m[32m7. `asyncio.gather()` não tinha limite de concorrência — hoje isso é seguro[m
[32m+[m[32m   porque só 3 clientes foram testados, mas cresceria sem controle se[m
[32m+[m[32m   `CLIENTES_ATIVOS` virasse uma lista grande, abrindo um Chromium com N[m
[32m+[m[32m   abas simultâneas sem limite de CPU/RAM. Adicionado `MAX_CONCORRENCIA`[m
[32m+[m[32m   (opcional, `.env`) usando `asyncio.Semaphore` em[m
[32m+[m[32m   `_processar_uma_tarefa()`. Sem configurar nada, o comportamento é[m
[32m+[m[32m   idêntico ao de antes (sem limite) — não muda nada do que já foi[m
[32m+[m[32m   validado com CLIENTE_A/B/C. Testado com um semáforo real limitando a 1[m
[32m+[m[32m   contexto simultâneo entre 3 tarefas concorrentes[m
[32m+[m[32m   (`test_com_semaphore_limita_contextos_simultaneos`), confirmando que[m
[32m+[m[32m   nenhuma tarefa é cancelada — só espera a vez.[m
[32m+[m
[32m+[m[32m**Isolamento do Playwright (revisado, já estava correto — sem mudança):**[m
[32m+[m[32mBrowserContext por tarefa, sem `storage_state` persistido entre execuções,[m
[32m+[m[32m`context.close()` em `finally` mesmo com falha, `Browser`/Playwright[m
[32m+[m[32mfechados em `finally` no nível do orquestrador, falha de uma tarefa não[m
[32m+[m[32mderruba as demais (`asyncio.gather` sem `return_exceptions` mas cada[m
[32m+[m[32m`_processar_uma_tarefa` já captura sua própria exceção e retorna um[m
[32m+[m[32m`ResultadoProcessamento`, nunca propaga pra fora do gather).[m
[32m+[m
[32m+[m[32m**Processo (documentado, não implementado):** risco de poluir o histórico[m
[32m+[m[32mfiscal em testes repetidos de `TESTAR_PREENCHIMENTO_COMPLETO` — não existe[m
[32m+[m[32mconfirmação ao vivo de que dá pra retomar uma operação em rascunho, então[m
[32m+[m[32mnão inventei esse fluxo. Alerta registrado no `RECON.md` como cuidado[m
[32m+[m[32moperacional pro próximo teste ao vivo.[m
[32m+[m
[32m+[m[32m**Arquivos alterados:** `src/config.py`, `src/auth.py`, `src/utils/debug.py`,[m
[32m+[m[32m`src/orquestrador.py`, `main.py`, `.env.example`, `.gitignore` (raiz),[m
[32m+[m[32m`worker/RECON.md`, `tests/test_auth.py`, `tests/test_debug.py`,[m
[32m+[m[32m`tests/test_orquestrador.py`, `tests/test_config.py`.[m
[32m+[m
[32m+[m[32m**Teste executado:**[m
[32m+[m
[32m+[m[32m    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider[m
[32m+[m
[32m+[m[32m**Resultado:** 28 testes aprovados (19 anteriores + 9 novos: repr seguro,[m
[32m+[m[32mguard de headless, dois testes de semáforo real, validação de[m
[32m+[m[32m`MAX_CONCORRENCIA`).[m
[32m+[m
[32m+[m[32m**Pendências / riscos não resolvidos agora (justificativa: mudança pequena[m
[32m+[m[32me reversível > mudança grande sem necessidade comprovada):**[m
[32m+[m[32m- Playwright está pinado em `1.48.0` (`requirements.txt`); versão atual é[m
[32m+[m[32m  bem mais nova. Vale considerar atualizar o Chromium bundled por segurança[m
[32m+[m[32m  do navegador, mas isso muda comportamento de renderização/timing — não[m
[32m+[m[32m  fiz isso sem poder testar ao vivo contra o site real.[m
[32m+[m[32m- `carregar_tarefa_de_json()` abre qualquer caminho passado por[m
[32m+[m[32m  `sys.argv[1]` sem validar que fica dentro de uma pasta esperada. Hoje é[m
[32m+[m[32m  baixo risco (CLI local, operador confiável); revisar quando o Worker[m
[32m+[m[32m  passar a receber tarefas vindas do `web`/Supabase (Fase 4) — nesse ponto[m
[32m+[m[32m  o caminho do arquivo deixa de ser controlado só por quem roda o comando.[m
[32m+[m[32m- Sem política de limpeza de screenshots antigos em `downloads/` — volume[m
[32m+[m[32m  esperado é baixo hoje, não implementei rotação/expiração agora.[m
[32m+[m
[32m+[m[32m## Alteração anterior[m
[32m+[m
[32m+[m[32mO "fio condutor" completo foi ligado: até agora `src/flows/emissao.py`[m
[32m+[m[32mexistia mas nenhum ponto de entrada o chamava. Três mudanças:[m
[32m+[m
[32m+[m[32m1. **`src/flows/emissao.py` convertido de Playwright Sync pra Async**[m
[32m+[m[32m   (era a única peça do projeto ainda em Sync — `docs/ARCHITECTURE.md`[m
[32m+[m[32m   proíbe misturar Page Sync com Page Async). Todas as funções agora são[m
[32m+[m[32m   `async def` com `await` nas chamadas ao Playwright. Única exceção:[m
[32m+[m[32m   `validar_antes_de_emitir()` continua síncrona de propósito (só faz[m
[32m+[m[32m   `input()` protegido por lock, não toca no Playwright) — mas com uma nota[m
[32m+[m[32m   nova no código: como a orquestração agora roda tudo numa única thread[m
[32m+[m[32m   (event loop asyncio, não mais ThreadPoolExecutor), um `input()`[m
[32m+[m[32m   bloqueante nessa função trava o loop inteiro sozinho enquanto espera[m
[32m+[m[32m   resposta — o lock de RF14 virou redundante nesse cenário, mas foi[m
[32m+[m[32m   mantido por precaução. Vale revisar quando essa função for de fato[m
[32m+[m[32m   chamada pelo fluxo orquestrado com mais de um cliente.[m
[32m+[m[32m2. **`carregar_tarefa_de_json()` nova em `emissao.py`** — lê[m
[32m+[m[32m   `tarefa_real.json` e monta o dataclass `Tarefa` (emitente, destinatário,[m
[32m+[m[32m   itens). Ignora o campo `_comentario` do template. Falha explicitamente[m
[32m+[m[32m   (`TypeError`) se faltar um campo obrigatório — não inventa valor.[m
[32m+[m[32m3. **`main.py` e `src/config.py`: nova flag `TESTAR_PREENCHIMENTO_COMPLETO`**[m
[32m+[m[32m   — quando `true` (e exige `TESTAR_NAVEGACAO_EMISSAO=true`, validado em[m
[32m+[m[32m   `carregar_config()`), depois de navegar até a emissão o worker carrega[m
[32m+[m[32m   `tarefa_real.json` e chama, em sequência: `aceitar_consentimento` →[m
[32m+[m[32m   `selecionar_emitente` → `preencher_destinatario` →[m
[32m+[m[32m   `preencher_identificacao_operacao` → `avancar_local_retirada` →[m
[32m+[m[32m   `preencher_produtos` → `preencher_transporte`. **Para antes de[m
[32m+[m[32m   `validar_antes_de_emitir()`/`emitir()` de propósito** — este teste é só[m
[32m+[m[32m   de preenchimento, nunca emite nota de verdade.[m
[32m+[m
[32m+[m[32mTestes novos (sem navegador, só lógica): `tests/test_carregar_tarefa.py`[m
[32m+[m[32m(carrega o próprio `tarefa_real.json.template` do repo, garante que ele[m
[32m+[m[32mcontinua válido, testa campo obrigatório faltando) e `tests/test_config.py`[m
[32m+[m[32m(a validação cruzada das duas flags).[m
[32m+[m
[32m+[m[32mComando pra rodar o teste ao vivo agora:[m
[32m+[m
[32m+[m[32m```powershell[m
[32m+[m[32m$env:SMOKE_TEST="true"[m
[32m+[m[32m$env:TESTAR_NAVEGACAO_EMISSAO="true"[m
[32m+[m[32m$env:TESTAR_PREENCHIMENTO_COMPLETO="true"[m
[32m+[m[32m$env:CLIENTES_ATIVOS="CLIENTE_A"[m
[32m+[m[32m$env:HEADLESS="false"[m
[32m+[m[32mpython main.py tarefa_real.json[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32mTeste executado (sem navegador):[m
[32m+[m
[32m+[m[32m    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider[m
[32m+[m
[32m+[m[32mResultado: 19 testes aprovados (12 anteriores + 7 novos). Validação real[m
[32m+[m[32mcontra o site — inclusive dos dois pontos em aberto já registrados no[m
[32m+[m[32m`RECON.md` (indicador de IE do destinatário, e o próprio "Emitir") —[m
[32m+[m[32mdepende do teste ao vivo.[m
[32m+[m
[32m+[m[32m## Alteração anterior[m
[32m+[m
[32m+[m[32mReconhecimento ao vivo (20/08) avançou de "checkbox de consentimento" até o[m
[32m+[m[32mfim da etapa de Produtos, e `worker/src/flows/emissao.py` foi atualizado com[m
[32m+[m[32mos seletores confirmados. Resumo do que mudou:[m
[32m+[m
[32m+[m[32m- `aceitar_consentimento` e `selecionar_emitente`: reconfirmados sem[m
[32m+[m[32m  alteração de seletor.[m
[32m+[m[32m- `preencher_destinatario`: seletor do campo de CEP corrigido de[m
[32m+[m[32m  `div:nth-child(2)` (hipótese) para `div.slds-form-element.slds-col.slds-size_12-of-12`[m
[32m+[m[32m  (confirmado). ⚠️ Ponto em aberto: o reconhecimento ao vivo mais recente[m
[32m+[m[32m  foi direto do clique em "CNPJ" para o campo de Inscrição Estadual, sem[m
[32m+[m[32m  passar pela seleção explícita de "Contribuinte ICMS (informar a IE do[m
[32m+[m[32m  destinatário)" que o código ainda faz. Mantido por ora (única coisa já[m
[32m+[m[32m  confirmada antes), mas se o próximo teste ao vivo travar nesse clique, é[m
[32m+[m[32m  esse o primeiro suspeito — não remover sem observar a tela.[m
[32m+[m[32m- `preencher_identificacao_operacao`: Tipo de Operação, Finalidade da[m
[32m+[m[32m  Emissão e Indicador de Presença deixaram de ser `logger.warning`[m
[32m+[m[32m  (placeholder) e passaram a ser preenchidos de verdade. Os três são[m
[32m+[m[32m  `<select>` comuns (não combobox SLDS) com caminhos estruturais quase[m
[32m+[m[32m  idênticos entre si no DOM real — por isso foi criado um helper[m
[32m+[m[32m  (`_selecionar_select_por_opcao_ancora`) que localiza cada `<select>` pelo[m
[32m+[m[32m  texto de uma `<option>` única daquele combobox (ex: "Entrada" só existe[m
[32m+[m[32m  no combobox de Tipo de Operação), em vez de confiar em nth-child.[m
[32m+[m[32m- Produtos: descoberta importante — a etapa não é uma tela única, tem DOIS[m
[32m+[m[32m  "Avançar" internos (Dados do Produto → Avançar → ICMS → Avançar), e só[m
[32m+[m[32m  depois do segundo é que aparece o botão "Adicionar Produto" pra próximo[m
[32m+[m[32m  item. `preencher_item()` e `preencher_produtos()` foram reestruturados[m
[32m+[m[32m  pra refletir isso. Campo de busca de produto confirmado: é o "Código do[m
[32m+[m[32m  Produto" (não "Descrição"), a descrição vem automática.[m
[32m+[m[32m- `preencher_transporte`: implementado de verdade (antes levantava[m
[32m+[m[32m  `DadosFiscaisIncompletos` de propósito). Seletor do `<select>` de[m
[32m+[m[32m  Modalidade do Frete confirmado, value "3".[m
[32m+[m
[32m+[m[32mTeste executado após a alteração (sem navegador, só sintaxe + suíte[m
[32m+[m[32mexistente, que não cobre os seletores novos):[m
[32m+[m
[32m+[m[32m    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider[m
[32m+[m
[32m+[m[32mResultado: 12 testes aprovados (nenhum teste novo cobre os seletores desta[m
[32m+[m[32malteração — validação real só acontece no próximo teste ao vivo).[m
[32m+[m
[32m+[m[32mPróximo passo: rodar `SMOKE_TEST` completo (ou um teste dedicado) até o[m
[32m+[m[32mbotão de emissão — sem clicar nele — com `CLIENTE_A`, observando se os dois[m
[32m+[m[32mpontos em aberto acima (indicador de IE do destinatário e os três selects de[m
[32m+[m[32midentificação da operação) se comportam como esperado.[m
[32m+[m
[32m+[m[32m## Alteração anterior[m
 [m
 O primeiro seletor da navegação falhou no teste ao vivo porque o elemento[m
 atual é o link "Produtor Rural" (`a.mais`) e não o antigo seletor estrutural[m
[1mdiff --git a/docs/PASSAGEM_PARA_CLAUDE.txt b/docs/PASSAGEM_PARA_CLAUDE.txt[m
[1mdeleted file mode 100644[m
[1mindex 560f3c6..0000000[m
[1m--- a/docs/PASSAGEM_PARA_CLAUDE.txt[m
[1m+++ /dev/null[m
[36m@@ -1,203 +0,0 @@[m
[31m-PASSAGEM DE CONTEXTO — PROJETO NF DISTRIBUIÇÃO[m
[31m-Data: 18/08/2026[m
[31m-[m
[31m-1. OBJETIVO DO PROJETO[m
[31m-[m
[31m-O projeto NF Distribuição deverá receber tarefas de emissão de nota fiscal,[m
[31m-preencher o sistema NFP-e da Receita PR e, no futuro, integrar-se ao[m
[31m-aplicativo, Supabase, fila de tarefas e armazenamento de PDF/XML.[m
[31m-[m
[31m-A unidade de execução é uma TAREFA DE EMISSÃO, não um cliente. Uma tarefa[m
[31m-deve informar emitente, destinatário, itens, valores e demais dados fiscais.[m
[31m-O modelo esperado entre emitentes e destinatários é N:N.[m
[31m-[m
[31m-[m
[31m-2. DOCUMENTOS E REGRAS PARA LER PRIMEIRO[m
[31m-[m
[31m-Antes de alterar qualquer código, ler:[m
[31m-[m
[31m-  - docs/AI-CONTEXT.md[m
[31m-  - docs/ARCHITECTURE.md[m
[31m-  - docs/HANDOFF.md[m
[31m-  - este arquivo[m
[31m-[m
[31m-As mesmas regras estão em AGENTS.MD e CLAUDE.MD. Em especial:[m
[31m-[m
[31m-  - não versionar .env e nunca colocar credenciais no código;[m
[31m-  - verificar mudanças existentes antes de editar;[m
[31m-  - não mudar a arquitetura sem registrar a decisão;[m
[31m-  - executar teste proporcional à alteração e registrar o resultado;[m
[31m-  - não automatizar emissão definitiva antes da etapa de validação humana.[m
[31m-[m
[31m-[m
[31m-3. ALTERAÇÃO ARQUITETURAL JÁ REALIZADA[m
[31m-[m
[31m-O Worker usava Playwright Sync com Browser criado na thread principal e[m
[31m-ThreadPoolExecutor para atender vários clientes. Essa combinação produziu:[m
[31m-[m
[31m-  greenlet.error: Cannot switch to a different thread[m
[31m-[m
[31m-Por isso a arquitetura do navegador foi migrada para:[m
[31m-[m
[31m-  async_playwright()[m
[31m-      -> 1 Browser Chromium[m
[31m-      -> N BrowserContexts independentes[m
[31m-      -> 1 Page por tarefa/contexto[m
[31m-      -> asyncio.gather() para concorrência[m
[31m-[m
[31m-Cada BrowserContext possui cookies, localStorage e autenticação próprios.[m
[31m-Ele é a fronteira obrigatória de isolamento entre tarefas. Uma falha em uma[m
[31m-tarefa deve retornar ResultadoProcessamento com erro e não cancelar as[m
[31m-demais.[m
[31m-[m
[31m-NÃO retornar para Sync Playwright + ThreadPoolExecutor nem compartilhar um[m
[31m-BrowserContext entre tarefas sem uma justificativa técnica documentada.[m
[31m-[m
[31m-[m
[31m-4. O QUE FOI ALTERADO NO CÓDIGO[m
[31m-[m
[31m-worker/src/orquestrador.py[m
[31m-[m
[31m-  - Foi convertido para a API Async do Playwright.[m
[31m-  - processar_tarefas_em_paralelo_async() abre um Chromium.[m
[31m-  - _processar_uma_tarefa() cria e fecha um BrowserContext por tarefa.[m
[31m-  - asyncio.gather() executa tarefas de forma concorrente.[m
[31m-  - Há um wrapper síncrono processar_tarefas_em_paralelo(), que usa[m
[31m-    asyncio.run() para manter a chamada da main simples.[m
[31m-[m
[31m-worker/src/auth.py[m
[31m-[m
[31m-  - realizar_login() foi convertido para async.[m
[31m-  - Faz navegação à URL de login, preenche CPF/usuário e senha, clica em[m
[31m-    Login e confirma a sessão aguardando o seletor #icons.[m
[31m-  - navegar_ate_emissao() também foi convertida para async, mas ainda não[m
[31m-    foi exercitada no fluxo Async real.[m
[31m-[m
[31m-worker/main.py[m
[31m-[m
[31m-  - Foi criado o smoke test Async (SMOKE_TEST=true).[m
[31m-  - teste_autenticacao() cria uma Page no contexto próprio, obtém a[m
[31m-    credencial pelo identificador e chama realizar_login().[m
[31m-  - O teste não navega, não preenche uma nota e não emite nada.[m
[31m-[m
[31m-worker/src/flows/emissao.py[m
[31m-[m
[31m-  - Ainda usa Playwright Sync e, portanto, NÃO pode receber uma Page Async.[m
[31m-  - Ainda há etapas/seletoras pendentes. Alguns dados fiscais confirmados[m
[31m-    foram documentados; dados ou seletores não confirmados devem falhar de[m
[31m-    modo explícito, nunca ser inventados.[m
[31m-[m
[31m-[m
[31m-5. TESTES QUE JÁ PASSARAM[m
[31m-[m
[31m-Teste 1: um cliente[m
[31m-[m
[31m-  SMOKE_TEST=true[m
[31m-  CLIENTES_ATIVOS=CLIENTE_A[m
[31m-  HEADLESS=false[m
[31m-  python main.py tarefa_real.json[m
[31m-[m
[31m-Resultado: BrowserContext criado, login na Receita PR confirmado e contexto[m
[31m-encerrado sem erro.[m
[31m-[m
[31m-Teste 2: três clientes em paralelo[m
[31m-[m
[31m-  SMOKE_TEST=true[m
[31m-  CLIENTES_ATIVOS=CLIENTE_A,CLIENTE_B,CLIENTE_C[m
[31m-  HEADLESS=false[m
[31m-  python main.py tarefa_real.json[m
[31m-[m
[31m-Resultado observado:[m
[31m-[m
[31m-  CLIENTE_A -> contexto criado -> login confirmado[m
[31m-  CLIENTE_B -> contexto criado -> login confirmado[m
[31m-  CLIENTE_C -> contexto criado -> login confirmado[m
[31m-[m
[31m-O log mostra os três fluxos sendo iniciados e concluídos concorrentemente.[m
[31m-O isolamento por contexto está implementado e a autenticação passou para os[m
[31m-três identificadores configurados.[m
[31m-[m
[31m-O que AINDA NÃO foi provado visualmente: que a página pós-login de cada[m
[31m-contexto exibe a identidade esperada de A, B e C. A próxima melhoria de[m
[31m-teste deve registrar/validar um elemento de identidade apresentado pelo site[m
[31m-após o login, sem registrar CPF, senha ou outros dados sensíveis no log.[m
[31m-[m
[31m-[m
[31m-6. SITUAÇÃO ATUAL E ALERTA IMPORTANTE[m
[31m-[m
[31m-O projeto está numa migração gradual. O fluxo de autenticação e a[m
[31m-orquestração são Async; emissao.py permanece Sync. Não misturar os dois[m
[31m-tipos de Page.[m
[31m-[m
[31m-Também há uma condição atual em worker/main.py que deve ser tratada antes[m
[31m-de voltar ao fluxo real:[m
[31m-[m
[31m-  - a chamada ao orquestrador Async está fora do bloco `if smoke_test`;[m
[31m-  - logo, ela é executada mesmo quando SMOKE_TEST não está ativo;[m
[31m-  - há um `return` logo após o processamento Async, portanto o código do[m
[31m-    fluxo real Sync abaixo dele está inalcançável;[m
[31m-  - além disso, aquele fluxo antigo chama funções que já são async como se[m
[31m-    fossem síncronas.[m
[31m-[m
[31m-Não corrigir isso com uma migração ampla ou improvisada. Primeiro decidir e[m
[31m-implementar explicitamente o comportamento de cada modo:[m
[31m-[m
[31m-  a) SMOKE_TEST=true: somente login Async;[m
[31m-  b) modo normal: por enquanto falhar com mensagem clara, ou manter um[m
[31m-     caminho Sync compatível separado; e[m
[31m-  c) futuro: fluxo completo Async, somente após converter cada etapa.[m
[31m-[m
[31m-Depois, criar/rodar teste que confirme o modo escolhido. Registrar a decisão[m
[31m-em docs/AI-CONTEXT.md e docs/HANDOFF.md.[m
[31m-[m
[31m-[m
[31m-7. PRÓXIMOS PASSOS RECOMENDADOS[m
[31m-[m
[31m-Executar um passo por vez, em ambiente visível quando for necessário[m
[31m-verificar a interface da Receita PR:[m
[31m-[m
[31m-  1. Validar no login a identidade pós-autenticação por contexto.[m
[31m-  2. Corrigir/testar a separação entre SMOKE_TEST e fluxo normal em main.py.[m
[31m-  3. Testar navegar_ate_emissao() de forma Async para um cliente.[m
[31m-  4. Repetir a navegação Async para A, B e C em paralelo.[m
[31m-  5. Converter e testar consentimento.[m
[31m-  6. Converter e testar seleção do emitente.[m
[31m-  7. Converter e testar destinatário, identificação, retirada, produtos e[m
[31m-     transporte, sempre uma etapa de cada vez.[m
[31m-  8. Manter validação humana antes da emissão.[m
[31m-  9. Só após testes suficientes: automatizar emissão e download de PDF/XML.[m
[31m-[m
[31m-Antes de cada etapa, confirmar seletores no sistema real. Preferir id,[m
[31m-label, placeholder, role e texto ao invés de seletores estruturais longos.[m
[31m-Não usar valores fiscais apenas para 'fazer o fluxo passar'.[m
[31m-[m
[31m-[m
[31m-8. COLABORAÇÃO ENTRE CLAUDE CODE E CODEX[m
[31m-[m
[31m-Os dois podem trabalhar no mesmo projeto, mas não devem editar os mesmos[m
[31m-arquivos simultaneamente no mesmo diretório de trabalho. Isso pode causar[m
[31m-sobrescrita, testes sobre código em alteração e decisões inconsistentes.[m
[31m-[m
[31m-Enquanto o envio for manual, enviar ao Claude pelo menos:[m
[31m-[m
[31m-  - AGENTS.MD[m
[31m-  - CLAUDE.MD[m
[31m-  - docs/AI-CONTEXT.md[m
[31m-  - docs/ARCHITECTURE.md[m
[31m-  - docs/HANDOFF.md[m
[31m-  - docs/PASSAGEM_PARA_CLAUDE.txt[m
[31m-[m
[31m-Ao solicitar uma alteração, informar qual agente está responsável e esperar[m
[31m-ele terminar. Antes de repassar ao outro, enviar os arquivos alterados e o[m
[31m-resultado do teste. O agente que encerrar uma alteração deve atualizar[m
[31m-docs/HANDOFF.md com: alteração, motivo, teste executado, resultado e próximo[m
[31m-passo.[m
[31m-[m
[31m-[m
[31m-9. LIMITES DE SEGURANÇA[m
[31m-[m
[31m-O sistema trata emissão fiscal: efeitos são reais e possivelmente[m
[31m-irreversíveis. Durante o desenvolvimento, parar antes de emitir, permitir[m
[31m-conferência humana e preservar evidência em logs. Nunca armazenar[m
[31m-credenciais, documentos fiscais ou dados pessoais em exemplos, commits ou[m
[31m-mensagens de log.[m
[1mdiff --git a/worker/.env.example b/worker/.env.example[m
[1mindex 2841b42..3261b81 100644[m
[1m--- a/worker/.env.example[m
[1m+++ b/worker/.env.example[m
[36m@@ -19,6 +19,19 @@[m [mINSPECIONAR="true"[m
 # consentimento, não preenche nota e não emite nada.[m
 TESTAR_NAVEGACAO_EMISSAO="false"[m
 [m
[32m+[m[32m# Quando true, além de navegar até a emissão, preenche o formulário inteiro[m
[32m+[m[32m# (consentimento, emitente, destinatário, identificação da operação,[m
[32m+[m[32m# produtos, transporte) usando os dados de tarefa_real.json. NUNCA clica em[m
[32m+[m[32m# "Emitir" — para nesse ponto de propósito. Exige TESTAR_NAVEGACAO_EMISSAO=true.[m
[32m+[m[32mTESTAR_PREENCHIMENTO_COMPLETO="false"[m
[32m+[m
[32m+[m[32m# Opcional. Limita quantos BrowserContexts (abas/sessões) ficam abertos ao[m
[32m+[m[32m# mesmo tempo. Sem definir, não há limite (hoje equivale a len(CLIENTES_ATIVOS),[m
[32m+[m[32m# já que só 3 foram testados em paralelo). Defina isso quando o worker[m
[32m+[m[32m# crescer pra dezenas/centenas de tarefas por execução, pra não estourar[m
[32m+[m[32m# CPU/RAM do servidor abrindo um Chromium com N abas simultâneas de uma vez.[m
[32m+[m[32m# MAX_CONCORRENCIA="5"[m
[32m+[m
 # Um bloco por cliente — login é o CPF do EMITENTE (não do cliente/destinatário).[m
 # Nunca commitar este arquivo preenchido.[m
 CLIENTE_A_LOGIN=""[m
[1mdiff --git a/worker/HANDOFF.md b/worker/HANDOFF.md[m
[1mdeleted file mode 100644[m
[1mindex d67ac3e..0000000[m
[1m--- a/worker/HANDOFF.md[m
[1m+++ /dev/null[m
[36m@@ -1,195 +0,0 @@[m
[31m-# Handoff — Estado Atual[m
[31m-[m
[31m-## Última alteração[m
[31m-[m
[31m-Reconhecimento ao vivo (20/08) avançou de "checkbox de consentimento" até o[m
[31m-fim da etapa de Produtos, e `worker/src/flows/emissao.py` foi atualizado com[m
[31m-os seletores confirmados. Resumo do que mudou:[m
[31m-[m
[31m-- `aceitar_consentimento` e `selecionar_emitente`: reconfirmados sem[m
[31m-  alteração de seletor.[m
[31m-- `preencher_destinatario`: seletor do campo de CEP corrigido de[m
[31m-  `div:nth-child(2)` (hipótese) para `div.slds-form-element.slds-col.slds-size_12-of-12`[m
[31m-  (confirmado). ⚠️ Ponto em aberto: o reconhecimento ao vivo mais recente[m
[31m-  foi direto do clique em "CNPJ" para o campo de Inscrição Estadual, sem[m
[31m-  passar pela seleção explícita de "Contribuinte ICMS (informar a IE do[m
[31m-  destinatário)" que o código ainda faz. Mantido por ora (única coisa já[m
[31m-  confirmada antes), mas se o próximo teste ao vivo travar nesse clique, é[m
[31m-  esse o primeiro suspeito — não remover sem observar a tela.[m
[31m-- `preencher_identificacao_operacao`: Tipo de Operação, Finalidade da[m
[31m-  Emissão e Indicador de Presença deixaram de ser `logger.warning`[m
[31m-  (placeholder) e passaram a ser preenchidos de verdade. Os três são[m
[31m-  `<select>` comuns (não combobox SLDS) com caminhos estruturais quase[m
[31m-  idênticos entre si no DOM real — por isso foi criado um helper[m
[31m-  (`_selecionar_select_por_opcao_ancora`) que localiza cada `<select>` pelo[m
[31m-  texto de uma `<option>` única daquele combobox (ex: "Entrada" só existe[m
[31m-  no combobox de Tipo de Operação), em vez de confiar em nth-child.[m
[31m-- Produtos: descoberta importante — a etapa não é uma tela única, tem DOIS[m
[31m-  "Avançar" internos (Dados do Produto → Avançar → ICMS → Avançar), e só[m
[31m-  depois do segundo é que aparece o botão "Adicionar Produto" pra próximo[m
[31m-  item. `preencher_item()` e `preencher_produtos()` foram reestruturados[m
[31m-  pra refletir isso. Campo de busca de produto confirmado: é o "Código do[m
[31m-  Produto" (não "Descrição"), a descrição vem automática.[m
[31m-- `preencher_transporte`: implementado de verdade (antes levantava[m
[31m-  `DadosFiscaisIncompletos` de propósito). Seletor do `<select>` de[m
[31m-  Modalidade do Frete confirmado, value "3".[m
[31m-[m
[31m-Teste executado após a alteração (sem navegador, só sintaxe + suíte[m
[31m-existente, que não cobre os seletores novos):[m
[31m-[m
[31m-    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider[m
[31m-[m
[31m-Resultado: 12 testes aprovados (nenhum teste novo cobre os seletores desta[m
[31m-alteração — validação real só acontece no próximo teste ao vivo).[m
[31m-[m
[31m-Próximo passo: rodar `SMOKE_TEST` completo (ou um teste dedicado) até o[m
[31m-botão de emissão — sem clicar nele — com `CLIENTE_A`, observando se os dois[m
[31m-pontos em aberto acima (indicador de IE do destinatário e os três selects de[m
[31m-identificação da operação) se comportam como esperado.[m
[31m-[m
[31m-## Alteração anterior[m
[31m-[m
[31m-O primeiro seletor da navegação falhou no teste ao vivo porque o elemento[m
[31m-atual é o link "Produtor Rural" (`a.mais`) e não o antigo seletor estrutural[m
[31m-com classe `menos`. Ele foi substituído por `get_by_role("link",[m
[31m-name="Produtor Rural", exact=True)`, que não depende de posição no menu.[m
[31m-[m
[31m-Executar novamente com somente `CLIENTE_A`; não avançar para o teste de três[m
[31m-logins até confirmar a navegação com uma conta.[m
[31m-[m
[31m-Não foi localizada uma regra pública da Receita PR com limite de logins por[m
[31m-IP. Durante desenvolvimento, evitar execuções repetidas e paralelas sem[m
[31m-necessidade. Concorrência em produção será tratada como parâmetro[m
[31m-conservador, a ser confirmado em testes controlados.[m
[31m-[m
[31m-O teste seguinte confirmou o clique no primeiro menu, mas não confirmou a[m
[31m-tela de emissão. A navegação agora registra cada passo, aguarda a URL do[m
[31m-domínio NFP-e e espera diretamente o checkbox dentro de `#div-consentimento`.[m
[31m-Executar novamente com `CLIENTE_A` para confirmar o caminho completo.[m
[31m-[m
[31m-## Alteração anterior[m
[31m-[m
[31m-A navegação Async até a tela de emissão foi ligada ao smoke test de forma[m
[31m-opcional. Com `TESTAR_NAVEGACAO_EMISSAO=true`, cada tarefa autenticada segue[m
[31m-o caminho Produtor Rural -> NFP-e -> Emissão e confirma a tela aguardando[m
[31m-`#div-consentimento`. O teste não marca consentimento, não preenche campos e[m
[31m-não emite nota.[m
[31m-[m
[31m-Falta executar este modo ao vivo, primeiro com `CLIENTE_A` e somente depois[m
[31m-com A/B/C em paralelo.[m
[31m-[m
[31m-Validação executada em 19/08/2026:[m
[31m-[m
[31m-    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider[m
[31m-[m
[31m-Resultado: 12 testes aprovados.[m
[31m-[m
[31m-## Alteração anterior[m
[31m-[m
[31m-Foi adicionada validação opcional de identidade pós-login. Quando[m
[31m-`CLIENTE_X_IDENTIDADE_ESPERADA` está definido no `.env`, o Worker procura[m
[31m-esse texto na área autenticada e falha apenas naquela tarefa se ele não for[m
[31m-encontrado. O valor esperado não é escrito nos logs.[m
[31m-[m
[31m-Ainda falta executar este teste contra o portal com os textos reais exibidos[m
[31m-por cada conta. O próximo passo permanece testar a navegação Async até a[m
[31m-emissão para um cliente.[m
[31m-[m
[31m-Também foi corrigido um teste de depuração para não herdar[m
[31m-`INSPECIONAR=true` do `.env` local; a suíte deve produzir o mesmo resultado[m
[31m-em qualquer máquina.[m
[31m-[m
[31m-Validação executada em 19/08/2026:[m
[31m-[m
[31m-    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider[m
[31m-[m
[31m-Resultado: 10 testes aprovados.[m
[31m-[m
[31m-## Alteração anterior[m
[31m-[m
[31m-`worker/main.py` foi reorganizado para separar explicitamente o smoke test[m
[31m-Async do fluxo fiscal completo. Sem `SMOKE_TEST=true`, o Worker encerra sem[m
[31m-executar automação fiscal. Isso remove o caminho Sync incompatível e evita[m
[31m-chamar funções Async como se fossem Sync durante a migração.[m
[31m-[m
[31m-Os testes do orquestrador foram atualizados para a interface Async atual e[m
[31m-verificam o fechamento do contexto tanto em sucesso quanto em falha.[m
[31m-[m
[31m-Validação executada em 18/08/2026:[m
[31m-[m
[31m-    worker/.venv/Scripts/python.exe -m pytest tests -v[m
[31m-[m
[31m-Resultado: 7 testes aprovados.[m
[31m-[m
[31m-Também foi adicionada `docs/COLABORACAO.md`, com convenção de autoria humana,[m
[31m-branches e uso seguro de Codex/Claude Code.[m
[31m-[m
[31m-## Alteração anterior[m
[31m-[m
[31m-Migramos o orquestrador de:[m
[31m-[m
[31m-    Sync Playwright + ThreadPoolExecutor[m
[31m-[m
[31m-para:[m
[31m-[m
[31m-    Async Playwright[m
[31m-    +[m
[31m-    1 Browser[m
[31m-    +[m
[31m-    N BrowserContexts[m
[31m-    +[m
[31m-    asyncio.gather()[m
[31m-[m
[31m-## Por que?[m
[31m-[m
[31m-O Browser Sync estava sendo criado na thread principal e utilizado[m
[31m-em threads do ThreadPoolExecutor, provocando:[m
[31m-[m
[31m-    greenlet.error:[m
[31m-    Cannot switch to a different thread[m
[31m-[m
[31m-## O que foi testado?[m
[31m-[m
[31m-### Smoke test[m
[31m-[m
[31m-1 Browser + 1 Context + 1 login[m
[31m-[m
[31m-✅[m
[31m-[m
[31m-### Concorrência[m
[31m-[m
[31m-1 Browser + 3 Contexts + 3 logins[m
[31m-[m
[31m-✅[m
[31m-[m
[31m-## O que NÃO foi alterado ainda?[m
[31m-[m
[31m-`flows/emissao.py` ainda contém funções baseadas na Sync API.[m
[31m-[m
[31m-Não tentar passar `Page` Async para funções Sync.[m
[31m-[m
[31m-## Próximo passo[m
[31m-[m
[31m-1. Confirmar identidade autenticada de A/B/C.[m
[31m-2. Migrar `navegar_ate_emissao()` para Async.[m
[31m-3. Testar A.[m
[31m-4. Testar A+B+C.[m
[31m-5. Migrar consentimento.[m
[31m-6. Continuar etapa por etapa.[m
[31m-[m
[31m-## Regra de colaboração[m
[31m-[m
[31m-Antes de alterar código:[m
[31m-[m
[31m-    git status[m
[31m-    git diff[m
[31m-[m
[31m-Após alterar:[m
[31m-[m
[31m-    testar[m
[31m-    documentar[m
[31m-    atualizar este arquivo[m
[31m-[m
[31m-Não assumir que uma alteração feita por outro agente está ausente.[m
[31m-[m
[31m-Ler `docs/AI-CONTEXT.md` antes de tomar decisões arquiteturais.[m
[1mdiff --git a/worker/RECON.md b/worker/RECON.md[m
[1mindex f08e081..c774ae3 100644[m
[1m--- a/worker/RECON.md[m
[1m+++ b/worker/RECON.md[m
[36m@@ -25,6 +25,16 @@[m
 > **Dica:** com `INSPECIONAR=true` no `.env` (já é o padrão do[m
 > `.env.example`), toda etapa que falhar abre o **Playwright Inspector**[m
 > sozinho, parado exatamente naquele ponto.[m
[32m+[m[32m>[m
[32m+[m[32m> **⚠️ Cuidado operacional pro próximo teste ao vivo (`TESTAR_PREENCHIMENTO_COMPLETO=true`):**[m
[32m+[m[32m> cada execução provavelmente cria uma operação/rascunho novo no sistema[m
[32m+[m[32m> fiscal, mesmo sem clicar em "Emitir". Não foi reconhecido ainda (nem[m
[32m+[m[32m> deveria ser inventado sem testar ao vivo primeiro) se existe um jeito de[m
[32m+[m[32m> **retomar** uma operação já iniciada via "Consultar" em vez de sempre[m
[32m+[m[32m> abrir uma nova. Até isso ser confirmado: evite rodar o teste completo[m
[32m+[m[32m> muitas vezes seguidas na mesma sessão, e dê uma olhada manual em[m
[32m+[m[32m> "Consultar" de vez em quando pra ver se estão sobrando rascunhos abertos[m
[32m+[m[32m> no sistema real. Isso é só uma precaução de processo — não um bloqueio.[m
 [m
 ---[m
 [m
[1mdiff --git a/worker/main.py b/worker/main.py[m
[1mindex 45fdac6..6da3662 100644[m
[1m--- a/worker/main.py[m
[1m+++ b/worker/main.py[m
[36m@@ -1,8 +1,11 @@[m
 """Ponto de entrada do Worker durante a migração para Playwright Async.[m
 [m
 Enquanto a migração está em andamento, este ponto de entrada executa somente[m
[31m-o smoke test de autenticação Async. O fluxo fiscal completo permanece[m
[31m-desabilitado até que todas as etapas sejam convertidas e testadas.[m
[32m+[m[32mtestes controlados sobre Async Playwright: autenticação, navegação até a[m
[32m+[m[32memissão e (opcionalmente) o preenchimento completo do formulário — sem[m
[32m+[m[32mnunca clicar em "Emitir". O fluxo fiscal completo automatizado (emissão de[m
[32m+[m[32mverdade) permanece desabilitado até que todas as etapas sejam validadas ao[m
[32m+[m[32mvivo.[m
 """[m
 [m
 from __future__ import annotations[m
[36m@@ -15,15 +18,36 @@[m [mfrom playwright.async_api import BrowserContext[m
 [m
 from src.auth import navegar_ate_emissao, realizar_login[m
 from src.config import Config, carregar_config, carregar_credencial[m
[32m+[m[32mfrom src.flows import emissao as fluxo_emissao[m
[32m+[m[32mfrom src.flows.emissao import Tarefa[m
 from src.orquestrador import processar_tarefas_em_paralelo[m
 from src.utils.logging import configurar_logger[m
 [m
 [m
[32m+[m[32masync def preencher_formulario_completo(page, tarefa: Tarefa, logger) -> None:[m
[32m+[m[32m    """[m
[32m+[m[32m    RF13 passos 4-10 — parte da tela de emissão (já alcançada por[m
[32m+[m[32m    navegar_ate_emissao) e vai até o fim de Transporte. NÃO chama[m
[32m+[m[32m    validar_antes_de_emitir() nem emitir() — este teste é só de[m
[32m+[m[32m    preenchimento, a etapa de emissão de verdade continua fora do escopo[m
[32m+[m[32m    até ser explicitamente decidida e testada à parte (docs/ARCHITECTURE.md[m
[32m+[m[32m    — "limite operacional atual").[m
[32m+[m[32m    """[m
[32m+[m[32m    await fluxo_emissao.aceitar_consentimento(page, logger)[m
[32m+[m[32m    await fluxo_emissao.selecionar_emitente(page, tarefa.emitente, logger)[m
[32m+[m[32m    await fluxo_emissao.preencher_destinatario(page, tarefa.destinatario, logger)[m
[32m+[m[32m    await fluxo_emissao.preencher_identificacao_operacao(page, tarefa, logger)[m
[32m+[m[32m    await fluxo_emissao.avancar_local_retirada(page, logger)[m
[32m+[m[32m    await fluxo_emissao.preencher_produtos(page, tarefa, logger)[m
[32m+[m[32m    await fluxo_emissao.preencher_transporte(page, tarefa, logger)[m
[32m+[m
[32m+[m
 async def teste_autenticacao([m
     tarefa_id: str,[m
     context: BrowserContext,[m
     config: Config,[m
     logger,[m
[32m+[m[32m    tarefa: Tarefa | None,[m
 ) -> None:[m
     """Valida Context -> Page -> login -> confirmação, sem emitir nota."""[m
 [m
[36m@@ -45,6 +69,20 @@[m [masync def teste_autenticacao([m
             await navegar_ate_emissao(page, logger)[m
             logger.info("[%s] TESTE DE NAVEGAÇÃO ATÉ EMISSÃO OK", tarefa_id)[m
 [m
[32m+[m[32m            if config.testar_preenchimento_completo:[m
[32m+[m[32m                if tarefa is None:[m
[32m+[m[32m                    raise RuntimeError([m
[32m+[m[32m                        f"[{tarefa_id}] TESTAR_PREENCHIMENTO_COMPLETO=true mas nenhuma "[m
[32m+[m[32m                        "tarefa foi carregada — isso não deveria acontecer (bug em main())."[m
[32m+[m[32m                    )[m
[32m+[m[32m                logger.info("[%s] Iniciando preenchimento completo (sem emitir)", tarefa_id)[m
[32m+[m[32m                await preencher_formulario_completo(page, tarefa, logger)[m
[32m+[m[32m                logger.info([m
[32m+[m[32m                    "[%s] PREENCHIMENTO COMPLETO OK — parado antes de 'Emitir' "[m
[32m+[m[32m                    "(não implementado/testado de propósito)",[m
[32m+[m[32m                    tarefa_id,[m
[32m+[m[32m                )[m
[32m+[m
         # Mantém a página visível brevemente para conferência manual.[m
         if not config.headless:[m
             await asyncio.sleep(5)[m
[36m@@ -52,20 +90,21 @@[m [masync def teste_autenticacao([m
         await page.close()[m
 [m
 [m
[31m-def executar_smoke_test(config: Config, logger) -> int:[m
[32m+[m[32mdef executar_smoke_test(config: Config, logger, tarefa: Tarefa | None) -> int:[m
     """Executa o teste Async para todos os clientes ativos configurados."""[m
 [m
     async def callback_autenticacao([m
         tarefa_id: str,[m
         context: BrowserContext,[m
     ) -> None:[m
[31m-        await teste_autenticacao(tarefa_id, context, config, logger)[m
[32m+[m[32m        await teste_autenticacao(tarefa_id, context, config, logger, tarefa)[m
 [m
     resultados = processar_tarefas_em_paralelo([m
         tarefas_ids=list(config.clientes_ativos),[m
         processar_tarefa=callback_autenticacao,[m
         logger=logger,[m
         headless=config.headless,[m
[32m+[m[32m        max_concorrencia=config.max_concorrencia,[m
     )[m
 [m
     for resultado in resultados:[m
[36m@@ -103,8 +142,13 @@[m [mdef main() -> int:[m
         )[m
         return 2[m
 [m
[32m+[m[32m    tarefa: Tarefa | None = None[m
[32m+[m[32m    if config.testar_preenchimento_completo:[m
[32m+[m[32m        logger.info("TESTAR_PREENCHIMENTO_COMPLETO=true — carregando %s", tarefa_path)[m
[32m+[m[32m        tarefa = fluxo_emissao.carregar_tarefa_de_json(tarefa_path)[m
[32m+[m
     logger.info("SMOKE_TEST=true — testando Async Playwright + autenticação")[m
[31m-    return executar_smoke_test(config, logger)[m
[32m+[m[32m    return executar_smoke_test(config, logger, tarefa)[m
 [m
 [m
 if __name__ == "__main__":[m
[1mdiff --git a/worker/src/auth.py b/worker/src/auth.py[m
[1mindex 0b75309..6199615 100644[m
[1m--- a/worker/src/auth.py[m
[1m+++ b/worker/src/auth.py[m
[36m@@ -119,17 +119,27 @@[m [masync def realizar_login([m
         credencial.cliente_id,[m
     )[m
 [m
[31m-    await page.locator([m
[31m-        SELETOR_CAMPO_USUARIO[m
[31m-    ).fill([m
[31m-        credencial.login[m
[31m-    )[m
[32m+[m[32m    # RNF02: se o Playwright falhar exatamente nestas duas linhas (elemento[m
[32m+[m[32m    # sumiu, timeout etc.), a mensagem de erro do Playwright pode, em[m
[32m+[m[32m    # algumas versões, ecoar o valor que estava sendo digitado no log de[m
[32m+[m[32m    # chamadas. Por isso o try/except abaixo troca a exceção por uma[m
[32m+[m[32m    # mensagem própria, sem encadear a original (`from None`) e sem nunca[m
[32m+[m[32m    # formatar `str(exc)` — CPF e senha nunca chegam a este ponto do log.[m
[32m+[m[32m    try:[m
[32m+[m[32m        await page.locator(SELETOR_CAMPO_USUARIO).fill(credencial.login)[m
[32m+[m[32m    except Exception:[m
[32m+[m[32m        raise FalhaAutenticacao([m
[32m+[m[32m            f"[{credencial.cliente_id}] Falha ao preencher o campo de usuário "[m
[32m+[m[32m            f"({SELETOR_CAMPO_USUARIO}) — elemento não encontrado ou timeout."[m
[32m+[m[32m        ) from None[m
 [m
[31m-    await page.get_by_placeholder([m
[31m-        "Senha"[m
[31m-    ).fill([m
[31m-        credencial.senha[m
[31m-    )[m
[32m+[m[32m    try:[m
[32m+[m[32m        await page.get_by_placeholder("Senha").fill(credencial.senha)[m
[32m+[m[32m    except Exception:[m
[32m+[m[32m        raise FalhaAutenticacao([m
[32m+[m[32m            f"[{credencial.cliente_id}] Falha ao preencher o campo de senha "[m
[32m+[m[32m            "— elemento não encontrado ou timeout."[m
[32m+[m[32m        ) from None[m
 [m
     await page.get_by_role([m
         "button",[m
[1mdiff --git a/worker/src/config.py b/worker/src/config.py[m
[1mindex 20d08da..91177ef 100644[m
[1m--- a/worker/src/config.py[m
[1m+++ b/worker/src/config.py[m
[36m@@ -23,6 +23,14 @@[m [mclass CredencialCliente:[m
     senha: str[m
     identidade_esperada: str | None = None[m
 [m
[32m+[m[32m    def __repr__(self) -> str:[m
[32m+[m[32m        # RNF02: dataclass por padrão gera um __repr__ que expõe TODOS os[m
[32m+[m[32m        # campos em texto puro — incluindo senha e o CPF de login. Isso é[m
[32m+[m[32m        # perigoso porque um dev (humano ou IA) pode logar/formatar este[m
[32m+[m[32m        # objeto inteiro sem perceber (ex: `logger.info(f"Falha: {credencial}")`)[m
[32m+[m[32m        # e vazar a senha pro arquivo de log. Sobrescrito explicitamente.[m
[32m+[m[32m        return f"CredencialCliente(cliente_id={self.cliente_id!r}, login='***', senha='***')"[m
[32m+[m
 [m
 @dataclass(frozen=True)[m
 class Config:[m
[36m@@ -34,12 +42,45 @@[m [mclass Config:[m
     clientes_ativos: tuple[str, ...][m
     inspecionar: bool[m
     testar_navegacao_emissao: bool[m
[32m+[m[32m    # RF13 passos 4-10 — preenche até Transporte (sem clicar Emitir). Exige[m
[32m+[m[32m    # testar_navegacao_emissao=true, porque depende de já estar na tela de[m
[32m+[m[32m    # emissão. Validado em carregar_config() abaixo.[m
[32m+[m[32m    testar_preenchimento_completo: bool[m
[32m+[m[32m    # Limite opcional de contextos/abas simultâneos. None = sem limite (hoje[m
[32m+[m[32m    # equivalente a len(clientes_ativos), já que só 3 foram testados). Existe[m
[32m+[m[32m    # pra quando o worker crescer de 3 pra N tarefas num servidor com CPU/RAM[m
[32m+[m[32m    # limitados — configurar explicitamente via MAX_CONCORRENCIA no .env.[m
[32m+[m[32m    max_concorrencia: int | None[m
 [m
 [m
 def carregar_config() -> Config:[m
     clientes_raw = os.getenv("CLIENTES_ATIVOS", "CLIENTE_A,CLIENTE_B,CLIENTE_C")[m
     clientes_ativos = tuple(c.strip() for c in clientes_raw.split(",") if c.strip())[m
 [m
[32m+[m[32m    testar_navegacao_emissao = os.getenv("TESTAR_NAVEGACAO_EMISSAO", "false").lower() == "true"[m
[32m+[m[32m    testar_preenchimento_completo = ([m
[32m+[m[32m        os.getenv("TESTAR_PREENCHIMENTO_COMPLETO", "false").lower() == "true"[m
[32m+[m[32m    )[m
[32m+[m
[32m+[m[32m    if testar_preenchimento_completo and not testar_navegacao_emissao:[m
[32m+[m[32m        raise RuntimeError([m
[32m+[m[32m            "TESTAR_PREENCHIMENTO_COMPLETO=true exige TESTAR_NAVEGACAO_EMISSAO=true "[m
[32m+[m[32m            "(o preenchimento parte da tela de emissão, que só é alcançada por esse "[m
[32m+[m[32m            "outro teste)."[m
[32m+[m[32m        )[m
[32m+[m
[32m+[m[32m    max_concorrencia_raw = os.getenv("MAX_CONCORRENCIA")[m
[32m+[m[32m    max_concorrencia: int | None = None[m
[32m+[m[32m    if max_concorrencia_raw:[m
[32m+[m[32m        try:[m
[32m+[m[32m            max_concorrencia = int(max_concorrencia_raw)[m
[32m+[m[32m        except ValueError as exc:[m
[32m+[m[32m            raise RuntimeError([m
[32m+[m[32m                f"MAX_CONCORRENCIA precisa ser um número inteiro, recebeu: {max_concorrencia_raw!r}"[m
[32m+[m[32m            ) from exc[m
[32m+[m[32m        if max_concorrencia < 1:[m
[32m+[m[32m            raise RuntimeError(f"MAX_CONCORRENCIA precisa ser >= 1, recebeu: {max_concorrencia}")[m
[32m+[m
     return Config([m
         sistema_fiscal_url=_obrigatorio("SISTEMA_FISCAL_URL"),[m
         headless=os.getenv("HEADLESS", "false").lower() == "true",[m
[36m@@ -48,9 +89,9 @@[m [mdef carregar_config() -> Config:[m
         log_dir=os.getenv("LOG_DIR", "./logs"),[m
         clientes_ativos=clientes_ativos,[m
         inspecionar=os.getenv("INSPECIONAR", "false").lower() == "true",[m
[31m-        testar_navegacao_emissao=([m
[31m-            os.getenv("TESTAR_NAVEGACAO_EMISSAO", "false").lower() == "true"[m
[31m-        ),[m
[32m+[m[32m        testar_navegacao_emissao=testar_navegacao_emissao,[m
[32m+[m[32m        testar_preenchimento_completo=testar_preenchimento_completo,[m
[32m+[m[32m        max_concorrencia=max_concorrencia,[m
     )[m
 [m
 [m
[1mdiff --git a/worker/src/orquestrador.py b/worker/src/orquestrador.py[m
[1mindex 974def2..c5d5e6c 100644[m
[1m--- a/worker/src/orquestrador.py[m
[1m+++ b/worker/src/orquestrador.py[m
[36m@@ -16,6 +16,7 @@[m [mfrom __future__ import annotations[m
 [m
 import asyncio[m
 import logging[m
[32m+[m[32mfrom contextlib import nullcontext[m
 from dataclasses import dataclass[m
 from typing import Awaitable, Callable[m
 [m
[36m@@ -45,61 +46,69 @@[m [masync def _processar_uma_tarefa([m
     browser: Browser,[m
     processar_tarefa: ProcessarTarefa,[m
     logger: logging.Logger,[m
[32m+[m[32m    semaphore: asyncio.Semaphore | None = None,[m
 ) -> ResultadoProcessamento:[m
 [m
     context: BrowserContext | None = None[m
 [m
[31m-    try:[m
[31m-        logger.info([m
[31m-            "[%s] Criando contexto independente",[m
[31m-            tarefa_id,[m
[31m-        )[m
[32m+[m[32m    # RNF: concorrência hoje é limitada só pelo tamanho de CLIENTES_ATIVOS[m
[32m+[m[32m    # (3 testados). Pra crescer de 3 pra N tarefas num servidor sem abrir N[m
[32m+[m[32m    # Chromiums simultâneos, MAX_CONCORRENCIA (opcional) limita quantas[m
[32m+[m[32m    # tarefas têm um BrowserContext aberto ao mesmo tempo — as demais[m
[32m+[m[32m    # esperam a vez, sem serem canceladas nem perder isolamento (RF24).[m
[32m+[m[32m    # Sem configurar nada, o comportamento é idêntico ao de antes (sem limite).[m
[32m+[m[32m    async with (semaphore if semaphore is not None else nullcontext()):[m
[32m+[m[32m        try:[m
[32m+[m[32m            logger.info([m
[32m+[m[32m                "[%s] Criando contexto independente",[m
[32m+[m[32m                tarefa_id,[m
[32m+[m[32m            )[m
 [m
[31m-        # Cada tarefa possui sua própria sessão.[m
[31m-        context = await browser.new_context()[m
[32m+[m[32m            # Cada tarefa possui sua própria sessão.[m
[32m+[m[32m            context = await browser.new_context()[m
 [m
[31m-        logger.info([m
[31m-            "[%s] Contexto criado",[m
[31m-            tarefa_id,[m
[31m-        )[m
[32m+[m[32m            logger.info([m
[32m+[m[32m                "[%s] Contexto criado",[m
[32m+[m[32m                tarefa_id,[m
[32m+[m[32m            )[m
 [m
[31m-        await processar_tarefa([m
[31m-            tarefa_id,[m
[31m-            context,[m
[31m-        )[m
[32m+[m[32m            await processar_tarefa([m
[32m+[m[32m                tarefa_id,[m
[32m+[m[32m                context,[m
[32m+[m[32m            )[m
 [m
[31m-        logger.info([m
[31m-            "[%s] Concluído com sucesso",[m
[31m-            tarefa_id,[m
[31m-        )[m
[32m+[m[32m            logger.info([m
[32m+[m[32m                "[%s] Concluído com sucesso",[m
[32m+[m[32m                tarefa_id,[m
[32m+[m[32m            )[m
 [m
[31m-        return ResultadoProcessamento([m
[31m-            tarefa_id=tarefa_id,[m
[31m-            sucesso=True,[m
[31m-        )[m
[32m+[m[32m            return ResultadoProcessamento([m
[32m+[m[32m                tarefa_id=tarefa_id,[m
[32m+[m[32m                sucesso=True,[m
[32m+[m[32m            )[m
 [m
[31m-    except Exception as exc:[m
[31m-        logger.exception([m
[31m-            "[%s] Falha isolada",[m
[31m-            tarefa_id,[m
[31m-        )[m
[32m+[m[32m        except Exception as exc:[m
[32m+[m[32m            logger.exception([m
[32m+[m[32m                "[%s] Falha isolada",[m
[32m+[m[32m                tarefa_id,[m
[32m+[m[32m            )[m
 [m
[31m-        return ResultadoProcessamento([m
[31m-            tarefa_id=tarefa_id,[m
[31m-            sucesso=False,[m
[31m-            erro=str(exc),[m
[31m-            tipo_erro=type(exc).__name__,[m
[31m-        )[m
[32m+[m[32m            return ResultadoProcessamento([m
[32m+[m[32m                tarefa_id=tarefa_id,[m
[32m+[m[32m                sucesso=False,[m
[32m+[m[32m                erro=str(exc),[m
[32m+[m[32m                tipo_erro=type(exc).__name__,[m
[32m+[m[32m            )[m
 [m
[31m-    finally:[m
[31m-        if context is not None:[m
[31m-            try:[m
[31m-                await context.close()[m
[31m-            except Exception:[m
[31m-                logger.exception([m
[31m-                    "[%s] Erro ao fechar contexto",[m
[31m-                    tarefa_id,[m
[31m-                )[m
[32m+[m[32m        finally:[m
[32m+[m[32m            if context is not None:[m
[32m+[m[32m                try:[m
[32m+[m[32m                    await context.close()[m
[32m+[m[32m                except Exception:[m
[32m+[m[32m                    logger.exception([m
[32m+[m[32m                        "[%s] Erro ao fechar contexto",[m
[32m+[m[32m                        tarefa_id,[m
[32m+[m[32m                    )[m
 [m
 [m
 async def processar_tarefas_em_paralelo_async([m
[36m@@ -107,11 +116,16 @@[m [masync def processar_tarefas_em_paralelo_async([m
     processar_tarefa: ProcessarTarefa,[m
     logger: logging.Logger,[m
     headless: bool = False,[m
[32m+[m[32m    max_concorrencia: int | None = None,[m
 ) -> list[ResultadoProcessamento]:[m
 [m
     if not tarefas_ids:[m
         return [][m
 [m
[32m+[m[32m    semaphore = asyncio.Semaphore(max_concorrencia) if max_concorrencia else None[m
[32m+[m[32m    if max_concorrencia:[m
[32m+[m[32m        logger.info("Concorrência limitada a %d contexto(s) simultâneo(s)", max_concorrencia)[m
[32m+[m
     async with async_playwright() as playwright:[m
 [m
         logger.info([m
[36m@@ -131,6 +145,7 @@[m [masync def processar_tarefas_em_paralelo_async([m
                         browser=browser,[m
                         processar_tarefa=processar_tarefa,[m
                         logger=logger,[m
[32m+[m[32m                        semaphore=semaphore,[m
                     )[m
                     for tarefa_id in tarefas_ids[m
                 )[m
[36m@@ -147,6 +162,7 @@[m [mdef processar_tarefas_em_paralelo([m
     processar_tarefa: ProcessarTarefa,[m
     logger: logging.Logger,[m
     headless: bool = False,[m
[32m+[m[32m    max_concorrencia: int | None = None,[m
 ) -> list[ResultadoProcessamento]:[m
     """[m
     Wrapper síncrono para manter a main.py simples.[m
[36m@@ -160,5 +176,6 @@[m [mdef processar_tarefas_em_paralelo([m
             processar_tarefa=processar_tarefa,[m
             logger=logger,[m
             headless=headless,[m
[32m+[m[32m            max_concorrencia=max_concorrencia,[m
         )[m
     )[m
\ No newline at end of file[m
[1mdiff --git a/worker/src/utils/debug.py b/worker/src/utils/debug.py[m
[1mindex 951ad78..091191c 100644[m
[1m--- a/worker/src/utils/debug.py[m
[1m+++ b/worker/src/utils/debug.py[m
[36m@@ -1,9 +1,16 @@[m
 """[m
[31m-Ferramentas de depuração pro fluxo de reconhecimento ao vivo (amanhã).[m
[32m+[m[32mFerramentas de depuração pro fluxo de reconhecimento ao vivo.[m
 [m
 O objetivo aqui é reduzir o custo de "onde exatamente travou e por quê"[m
 quando um seletor ainda não confirmado quebrar — que é o tipo de falha[m
 esperado nesta fase (RNF07 — observabilidade).[m
[32m+[m
[32m+[m[32mConvertido para Async em 20/08, junto com o resto do fluxo fiscal — este[m
[32m+[m[32mmódulo não é chamado por nenhum outro ainda (fica pronto pra quando as[m
[32m+[m[32metapas do fluxo passarem a usar rodar_etapa()), mas precisa estar em Async[m
[32m+[m[32mpra não virar uma armadilha: chamar page.screenshot()/page.pause() em Sync[m
[32m+[m[32msobre uma Page Async simplesmente não funciona (a chamada sem await retorna[m
[32m+[m[32muma coroutine nunca executada, sem erro óbvio).[m
 """[m
 from __future__ import annotations[m
 [m
[36m@@ -12,45 +19,62 @@[m [mimport logging[m
 import os[m
 import re[m
 [m
[31m-from playwright.sync_api import Page[m
[32m+[m[32mfrom playwright.async_api import Page[m
 [m
 [m
[31m-def rodar_etapa(nome: str, page: Page, logger: logging.Logger, download_dir: str, fn, *args, **kwargs):[m
[32m+[m[32masync def rodar_etapa(nome: str, page: Page, logger: logging.Logger, download_dir: str, fn, *args, **kwargs):[m
     """[m
     Envolve uma etapa do fluxo (ex: preencher_destinatario) com logging[m
     consistente, screenshot automático em caso de falha, e — se[m
[31m-    INSPECIONAR=true no .env — abre o Playwright Inspector bem no ponto do[m
[31m-    erro, pronto pra você clicar no elemento certo e copiar o seletor[m
[31m-    gerado, sem precisar reconstruir o cenário manualmente.[m
[32m+[m[32m    INSPECIONAR=true no .env e o navegador NÃO estiver headless — abre o[m
[32m+[m[32m    Playwright Inspector bem no ponto do erro.[m
[32m+[m
[32m+[m[32m    `fn` deve ser uma função async; é chamada como `await fn(*args, **kwargs)`.[m
     """[m
     logger.info(f"→ Etapa: {nome}")[m
     try:[m
[31m-        resultado = fn(*args, **kwargs)[m
[32m+[m[32m        resultado = await fn(*args, **kwargs)[m
         logger.info(f"✓ Etapa concluída: {nome}")[m
         return resultado[m
     except Exception as e:[m
         logger.error(f"✗ Etapa falhou: {nome} — {e}")[m
[31m-        _salvar_screenshot_erro(page, nome, download_dir, logger)[m
[32m+[m[32m        await _salvar_screenshot_erro(page, nome, download_dir, logger)[m
[32m+[m
[32m+[m[32m        headless = os.getenv("HEADLESS", "false").lower() == "true"[m
[32m+[m[32m        inspecionar = os.getenv("INSPECIONAR", "false").lower() == "true"[m
 [m
[31m-        if os.getenv("INSPECIONAR", "false").lower() == "true":[m
[32m+[m[32m        if inspecionar and headless:[m
[32m+[m[32m            # Servidor/VM não tem tela: o Inspector precisa de uma janela de[m
[32m+[m[32m            # navegador interativa pra funcionar. Sem essa checagem, isso[m
[32m+[m[32m            # travaria a tarefa indefinidamente esperando um humano que[m
[32m+[m[32m            # nunca vai aparecer, em produção — pior ainda numa VM (RF24:[m
[32m+[m[32m            # falha de uma tarefa não deveria travar as demais, mas um[m
[32m+[m[32m            # page.pause() pendurado consome o recurso do contexto por tempo[m
[32m+[m[32m            # indeterminado).[m
[32m+[m[32m            logger.warning([m
[32m+[m[32m                "INSPECIONAR=true mas HEADLESS=true — ignorando (o Inspector "[m
[32m+[m[32m                "precisa de navegador visível). Deixe HEADLESS=false pra "[m
[32m+[m[32m                "depurar interativamente."[m
[32m+[m[32m            )[m
[32m+[m[32m        elif inspecionar:[m
             logger.warning([m
                 f"INSPECIONAR=true — abrindo o Playwright Inspector na etapa "[m
                 f"'{nome}'. Clique no elemento certo pra ver/copiar o seletor "[m
                 "gerado (aba 'Explore'), depois clique ▶ Resume no Inspector "[m
                 "pra deixar a exceção original seguir seu curso normal."[m
             )[m
[31m-            page.pause()[m
[32m+[m[32m            await page.pause()[m
 [m
         raise[m
 [m
 [m
[31m-def _salvar_screenshot_erro(page: Page, nome_etapa: str, download_dir: str, logger: logging.Logger) -> None:[m
[32m+[m[32masync def _salvar_screenshot_erro(page: Page, nome_etapa: str, download_dir: str, logger: logging.Logger) -> None:[m
     os.makedirs(download_dir, exist_ok=True)[m
     slug = re.sub(r"[^a-z0-9]+", "-", nome_etapa.lower()).strip("-")[m
     timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")[m
     caminho = os.path.join(download_dir, f"erro_{slug}_{timestamp}.png")[m
     try:[m
[31m-        page.screenshot(path=caminho, full_page=True)[m
[32m+[m[32m        await page.screenshot(path=caminho, full_page=True)[m
         logger.info(f"Screenshot da falha salvo em: {caminho}")[m
     except Exception as e:  # noqa: BLE001 — screenshot é auxiliar, não pode derrubar o fluxo[m
         logger.warning(f"Não foi possível salvar screenshot: {e}")[m
[1mdiff --git a/worker/tests/test_auth.py b/worker/tests/test_auth.py[m
[1mindex 850cdd8..7bbaef0 100644[m
[1m--- a/worker/tests/test_auth.py[m
[1m+++ b/worker/tests/test_auth.py[m
[36m@@ -85,3 +85,31 @@[m [mdef test_sem_configuracao_nao_procura_identidade():[m
     )[m
 [m
     assert pagina.texto_procurado is None[m
[32m+[m
[32m+[m
[32m+[m[32mdef test_repr_da_credencial_nunca_expoe_login_nem_senha():[m
[32m+[m[32m    """[m
[32m+[m[32m    RNF02: dataclass gera __repr__ por padrão expondo todos os campos —[m
[32m+[m[32m    isso foi sobrescrito em CredencialCliente pra nunca vazar login/senha[m
[32m+[m[32m    se alguém logar/formatar o objeto inteiro por engano.[m
[32m+[m[32m    """[m
[32m+[m[32m    credencial = CredencialCliente([m
[32m+[m[32m        cliente_id="CLIENTE_A",[m
[32m+[m[32m        login="12345678900",[m
[32m+[m[32m        senha="minha-senha-secreta",[m
[32m+[m[32m    )[m
[32m+[m
[32m+[m[32m    texto = repr(credencial)[m
[32m+[m
[32m+[m[32m    assert "12345678900" not in texto[m
[32m+[m[32m    assert "minha-senha-secreta" not in texto[m
[32m+[m[32m    assert "CLIENTE_A" in texto[m
[32m+[m[32m    assert "***" in texto[m
[32m+[m
[32m+[m
[32m+[m[32mdef test_str_da_credencial_tambem_nao_expoe_segredo():[m
[32m+[m[32m    # str() cai no __repr__ quando __str__ não é definido — confirma que[m
[32m+[m[32m    # não existe um caminho alternativo (ex: __str__ próprio) vazando o dado.[m
[32m+[m[32m    credencial = CredencialCliente(cliente_id="CLIENTE_B", login="000", senha="segredo")[m
[32m+[m[32m    assert "segredo" not in str(credencial)[m
[32m+[m[32m    assert "000" not in str(credencial)[m
[1mdiff --git a/worker/tests/test_debug.py b/worker/tests/test_debug.py[m
[1mindex c5942ce..36cd3ca 100644[m
[1m--- a/worker/tests/test_debug.py[m
[1m+++ b/worker/tests/test_debug.py[m
[36m@@ -1,8 +1,9 @@[m
 """[m
 Testa rodar_etapa() sem precisar de um navegador real — usa um objeto[m
[31m-"page" falso que só sabe fazer screenshot e pausar, pra checar a lógica de[m
[31m-logging/screenshot/pause sem depender do Playwright de verdade.[m
[32m+[m[32m"page" falso (Async) que só sabe fazer screenshot e pausar, pra checar a[m
[32m+[m[32mlógica de logging/screenshot/pause sem depender do Playwright de verdade.[m
 """[m
[32m+[m[32mimport asyncio[m
 import logging[m
 import os[m
 import tempfile[m
[36m@@ -17,10 +18,10 @@[m [mclass PageFalsa:[m
         self.screenshots = [][m
         self.pausado = False[m
 [m
[31m-    def screenshot(self, path, full_page=True):[m
[32m+[m[32m    async def screenshot(self, path, full_page=True):[m
         self.screenshots.append(path)[m
 [m
[31m-    def pause(self):[m
[32m+[m[32m    async def pause(self):[m
         self.pausado = True[m
 [m
 [m
[36m@@ -30,10 +31,18 @@[m [mdef _logger_silencioso() -> logging.Logger:[m
     return logger[m
 [m
 [m
[32m+[m[32masync def _ok():[m
[32m+[m[32m    return 42[m
[32m+[m
[32m+[m
[32m+[m[32masync def _falha(mensagem: str = "seletor não encontrado"):[m
[32m+[m[32m    raise RuntimeError(mensagem)[m
[32m+[m
[32m+[m
 def test_etapa_bem_sucedida_nao_tira_screenshot_nem_pausa():[m
     page = PageFalsa()[m
     with tempfile.TemporaryDirectory() as tmp:[m
[31m-        resultado = rodar_etapa("etapa ok", page, _logger_silencioso(), tmp, lambda: 42)[m
[32m+[m[32m        resultado = asyncio.run(rodar_etapa("etapa ok", page, _logger_silencioso(), tmp, _ok))[m
 [m
     assert resultado == 42[m
     assert page.screenshots == [][m
[36m@@ -43,14 +52,12 @@[m [mdef test_etapa_bem_sucedida_nao_tira_screenshot_nem_pausa():[m
 def test_etapa_com_falha_tira_screenshot_e_repropaga_excecao(monkeypatch):[m
     # O comportamento esperado deste teste independe do .env local.[m
     monkeypatch.delenv("INSPECIONAR", raising=False)[m
[32m+[m[32m    monkeypatch.delenv("HEADLESS", raising=False)[m
     page = PageFalsa()[m
 [m
[31m-    def falha():[m
[31m-        raise RuntimeError("seletor não encontrado")[m
[31m-[m
     with tempfile.TemporaryDirectory() as tmp:[m
         with pytest.raises(RuntimeError, match="seletor não encontrado"):[m
[31m-            rodar_etapa("etapa com falha", page, _logger_silencioso(), tmp, falha)[m
[32m+[m[32m            asyncio.run(rodar_etapa("etapa com falha", page, _logger_silencioso(), tmp, _falha))[m
 [m
         assert len(page.screenshots) == 1[m
         assert os.path.dirname(page.screenshots[0]) == tmp[m
[36m@@ -61,28 +68,44 @@[m [mdef test_etapa_com_falha_tira_screenshot_e_repropaga_excecao(monkeypatch):[m
 [m
 def test_etapa_com_falha_e_inspecionar_true_chama_pause(monkeypatch):[m
     monkeypatch.setenv("INSPECIONAR", "true")[m
[32m+[m[32m    monkeypatch.delenv("HEADLESS", raising=False)  # default é "false" (headed)[m
     page = PageFalsa()[m
 [m
[31m-    def falha():[m
[31m-        raise RuntimeError("boom")[m
[31m-[m
     with tempfile.TemporaryDirectory() as tmp:[m
         with pytest.raises(RuntimeError):[m
[31m-            rodar_etapa("etapa", page, _logger_silencioso(), tmp, falha)[m
[32m+[m[32m            asyncio.run(rodar_etapa("etapa", page, _logger_silencioso(), tmp, _falha))[m
 [m
     assert page.pausado is True[m
 [m
 [m
[32m+[m[32mdef test_inspecionar_true_mas_headless_true_nao_chama_pause(monkeypatch):[m
[32m+[m[32m    """[m
[32m+[m[32m    Guard novo (20/08): num servidor/VM headless, page.pause() ficaria[m
[32m+[m[32m    esperando um humano que nunca aparece — trava a tarefa indefinidamente.[m
[32m+[m[32m    Com HEADLESS=true, INSPECIONAR deve ser ignorado (só logar um aviso).[m
[32m+[m[32m    """[m
[32m+[m[32m    monkeypatch.setenv("INSPECIONAR", "true")[m
[32m+[m[32m    monkeypatch.setenv("HEADLESS", "true")[m
[32m+[m[32m    page = PageFalsa()[m
[32m+[m
[32m+[m[32m    with tempfile.TemporaryDirectory() as tmp:[m
[32m+[m[32m        with pytest.raises(RuntimeError):[m
[32m+[m[32m            asyncio.run(rodar_etapa("etapa", page, _logger_silencioso(), tmp, _falha))[m
[32m+[m
[32m+[m[32m    assert page.pausado is False[m
[32m+[m[32m    assert len(page.screenshots) == 1  # screenshot continua acontecendo normalmente[m
[32m+[m
[32m+[m
 def test_screenshot_falho_nao_impede_excecao_original_de_propagar():[m
     class PageQuebrada(PageFalsa):[m
[31m-        def screenshot(self, path, full_page=True):[m
[32m+[m[32m        async def screenshot(self, path, full_page=True):[m
             raise OSError("disco cheio")[m
 [m
     page = PageQuebrada()[m
 [m
[31m-    def falha():[m
[32m+[m[32m    async def _falha_valor():[m
         raise ValueError("erro real da etapa")[m
 [m
     with tempfile.TemporaryDirectory() as tmp:[m
         with pytest.raises(ValueError, match="erro real da etapa"):[m
[31m-            rodar_etapa("etapa", page, _logger_silencioso(), tmp, falha)[m
[32m+[m[32m            asyncio.run(rodar_etapa("etapa", page, _logger_silencioso(), tmp, _falha_valor))[m
[1mdiff --git a/worker/tests/test_orquestrador.py b/worker/tests/test_orquestrador.py[m
[1mindex deefbc5..792cf62 100644[m
[1m--- a/worker/tests/test_orquestrador.py[m
[1m+++ b/worker/tests/test_orquestrador.py[m
[36m@@ -66,3 +66,69 @@[m [mdef test_falha_da_tarefa_retorna_resultado_e_fecha_contexto():[m
     assert resultado.tipo_erro == "RuntimeError"[m
     assert resultado.erro == "login falhou"[m
     assert browser.contextos[0].fechado is True[m
[32m+[m
[32m+[m
[32m+[m[32mdef test_sem_semaphore_tarefas_rodam_de_verdade_em_paralelo():[m
[32m+[m[32m    """[m
[32m+[m[32m    Comportamento de hoje (sem MAX_CONCORRENCIA configurado): nada limita[m
[32m+[m[32m    quantos contextos ficam abertos ao mesmo tempo — os 3 picos simultâneos[m
[32m+[m[32m    já validados manualmente (CLIENTE_A/B/C) continuam possíveis.[m
[32m+[m[32m    """[m
[32m+[m[32m    em_andamento: list[int] = [][m
[32m+[m[32m    picos: list[int] = [][m
[32m+[m
[32m+[m[32m    async def tarefa_lenta(tarefa_id: str, context: ContextoFalso) -> None:[m
[32m+[m[32m        em_andamento.append(1)[m
[32m+[m[32m        picos.append(len(em_andamento))[m
[32m+[m[32m        await asyncio.sleep(0.05)[m
[32m+[m[32m        em_andamento.pop()[m
[32m+[m
[32m+[m[32m    browser = BrowserFalso()[m
[32m+[m
[32m+[m[32m    async def rodar():[m
[32m+[m[32m        return await asyncio.gather([m
[32m+[m[32m            *([m
[32m+[m[32m                _processar_uma_tarefa(f"T{i}", browser, tarefa_lenta, _logger_silencioso())[m
[32m+[m[32m                for i in range(3)[m
[32m+[m[32m            )[m
[32m+[m[32m        )[m
[32m+[m
[32m+[m[32m    resultados = asyncio.run(rodar())[m
[32m+[m
[32m+[m[32m    assert all(r.sucesso for r in resultados)[m
[32m+[m[32m    assert max(picos) == 3, "sem limite configurado, as 3 tarefas deveriam rodar juntas"[m
[32m+[m
[32m+[m
[32m+[m[32mdef test_com_semaphore_limita_contextos_simultaneos():[m
[32m+[m[32m    """[m
[32m+[m[32m    MAX_CONCORRENCIA=1: mesmo pedindo 3 tarefas de uma vez, no máximo 1[m
[32m+[m[32m    contexto deve estar aberto em cada instante — as outras esperam a vez,[m
[32m+[m[32m    sem serem canceladas (todas devem terminar com sucesso).[m
[32m+[m[32m    """[m
[32m+[m[32m    em_andamento: list[int] = [][m
[32m+[m[32m    picos: list[int] = [][m
[32m+[m
[32m+[m[32m    async def tarefa_lenta(tarefa_id: str, context: ContextoFalso) -> None:[m
[32m+[m[32m        em_andamento.append(1)[m
[32m+[m[32m        picos.append(len(em_andamento))[m
[32m+[m[32m        await asyncio.sleep(0.05)[m
[32m+[m[32m        em_andamento.pop()[m
[32m+[m
[32m+[m[32m    browser = BrowserFalso()[m
[32m+[m
[32m+[m[32m    async def rodar():[m
[32m+[m[32m        semaphore = asyncio.Semaphore(1)[m
[32m+[m[32m        return await asyncio.gather([m
[32m+[m[32m            *([m
[32m+[m[32m                _processar_uma_tarefa(f"T{i}", browser, tarefa_lenta, _logger_silencioso(), semaphore)[m
[32m+[m[32m                for i in range(3)[m
[32m+[m[32m            )[m
[32m+[m[32m        )[m
[32m+[m
[32m+[m[32m    resultados = asyncio.run(rodar())[m
[32m+[m
[32m+[m[32m    assert len(resultados) == 3[m
[32m+[m[32m    assert all(r.sucesso for r in resultados), "nenhuma tarefa deveria ser cancelada, só esperar a vez"[m
[32m+[m[32m    assert max(picos) == 1, "com MAX_CONCORRENCIA=1, nunca deveria haver 2 contextos abertos ao mesmo tempo"[m
[32m+[m[32m    assert len(browser.contextos) == 3, "as 3 tarefas ainda deveriam rodar, uma de cada vez"[m
[32m+[m[32m    assert all(c.fechado for c in browser.contextos)[m
