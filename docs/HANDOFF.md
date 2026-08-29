# Handoff — Estado Atual

## Estado autoritativo — 28/08/2026

> Esta seção substitui afirmações de estado das continuações históricas abaixo.
> O restante do arquivo preserva decisões e reconhecimentos anteriores, mas
> contagens e “próximos passos” antigos não descrevem mais o código atual.

### Entregue no código

- Web responsivo com cadastros, distribuição idempotente por lote, tarefas,
  notas, roteiro de motorista e relatórios operacionais.
- Sessão administrativa HMAC, bloqueio por inatividade, Server Actions
  protegidas, validação de entrada e cabeçalhos de segurança.
- Migrações `0001`–`0010` aplicadas no banco de teste. `0008` adiciona
  snapshot/hash, idempotência, token, protocolo e unicidades; `0009` corrige o
  retorno ambíguo de `reserva_token`. `EXECUTE` público foi revogado.
- Snapshot da tarefa gravado atomicamente: versão, payload e SHA-256 entram no
  mesmo comando, compatível com a constraint da migration `0008`.
- Worker Async com 1 Browser e até 3 contextos; fonte banco ligada ao `main.py`,
  pool TLS, reserva atômica, token fencing, heartbeat e transições seguras.
- Modo ensaio reserva/valida e devolve a `PENDENTE`, limpando lease/token e
  restituindo a tentativa. Falha de contrato/hash/credencial vai para
  `AGUARDANDO_CONFERENCIA`.
- Modo processado de homologação liga banco → Playwright → `EMITINDO` → XML
  `cStat=100` → nota + tarefa `EMITIDA`. Resultado incerto não ganha retry.
- XML/DANFE são baixados e validados; arquivos ficam locais e privados. Storage
  remoto ainda não existe.
- Papel local `nf_worker_local` criado com acesso mínimo, credencial somente no
  `.env` ignorado e auditoria `papelWorkerSeguro: true`. Nenhum segredo foi
  impresso ou versionado.
- Primeiro round-trip real da fila concluído: 1 tarefa foi reservada, teve
  snapshot/hash/credencial validados e voltou a `PENDENTE`, sem navegador e sem
  emissão. O pool async usa cache de prepared statements desligado para ser
  compatível com o pooler transacional.
- Diagnóstico operacional estruturado em `codigo_erro`. A tela de tarefas mostra
  causa e solução em linguagem simples; erros seguros recebem **Tentar
  novamente**, enquanto snapshot divergente aponta para uma nova distribuição
  e incerteza fiscal permanece bloqueada. As visões agora são Pendentes, Em
  andamento, Atenção, Concluídas e Canceladas; erro pré-emissão pode ser movido
  para Canceladas sem apagar histórico.
- Ciclos conectados posteriores confirmaram login, identidade, navegação,
  destinatário e identificação da operação. Nenhuma tentativa chegou a
  `EMITINDO`. A SPA mantém etapas anteriores no DOM; o Worker agora seleciona o
  Avançar da operação por contexto, aguarda retirada/entrega renderizar e marca
  explicitamente os dois rádios “Não”. A âncora final foi corrigida, mas essa
  última alteração ainda não teve reteste ao vivo.
- Com `INSPECIONAR=true`, falha pré-emissão salva HTML/PNG privados na pasta
  ignorada `worker/downloads/`; no fluxo normal a opção permanece desligada e
  não adiciona captura nem espera.

### Evidências atuais

- Worker: **157 testes passando**.
- Web: **81 testes em 14 arquivos passando**.
- `npx tsc --noEmit`, `npm run build` e `git diff --check` passaram.
- `npm audit --omit=dev`: 0 vulnerabilidades conhecidas.
- Banco: migrações sincronizadas, canal TLS/fila OK e papel exclusivo seguro.
  Existem 0 tarefas pendentes; 000006–000009 ficaram em `ERRO` pré-emissão.
- O responsável confirmou que os 3 produtos atuais são fictícios, apesar de
  passarem nas validações estruturais. Não repetir 000009. O próximo passo é
  cadastrar produtos reais, conferir seus códigos internos NFP-e e criar uma
  distribuição nova.

### Continuação autônoma — cadastros e tarefas operacionais

- Emitente aceita CPF ou CNPJ com dígitos verificadores; inscrição estadual é
  opcional. `emitentes.cnpj` permanece como nome físico legado para evitar uma
  migração cosmética no gate crítico de integração.
- A tela explica com exemplo como `credencial_referencia` aponta para
  `<REFERENCIA>_LOGIN` e `<REFERENCIA>_SENHA` no Worker. Senha não foi adicionada
  ao Web nem ao banco.
- Clientes e emitentes ganharam desativação/reativação lógica. A desativação é
  recusada se existir tarefa aberta, protegendo o processamento e o histórico.
- Produtos também podem ser editados, desativados e reativados. A lista
  principal mostra apenas ativos; inativos ficam recolhidos em `Desativados`.
  Produto presente em tarefa aberta não pode ser desativado.
- Formulários passaram a mostrar validações como “CNPJ inválido” dentro da
  página. Erros inesperados ficam genéricos e detalhes internos não vazam.
- Tarefas foram separadas em Pendentes, Em andamento, Atenção, Concluídas e
  Canceladas, com contadores e agrupamento por lote. Registros antigos sem lote
  são agrupados por data com rótulo explícito de ausência do número.
- Cancelamento concorrente ou inválido também retorna feedback amigável no
  cartão, sem Runtime Error do Next.js.
- Validação: **71 testes Web em 12 arquivos**, TypeScript e build de produção.
  Inspeção local em 390×844 de `/emitentes`, `/clientes`, `/produtos` e
  `/tarefas`: sem rolagem horizontal, abas e ações acessíveis. Nenhum cadastro
  foi alterado no ensaio visual.

### Continuação autônoma — diagnóstico fiel antes do round-trip

- `db:verify-integration` deixou de verificar apenas tamanho de documentos:
  agora aplica os mesmos dígitos verificadores de CPF/CNPJ usados no Web.
- Cliente só conta como vinculado quando existe ao menos um emitente ativo;
  produto só está pronto quando sua regra fiscal também está ativa.
- O script continua somente-leitura, não consulta login/senha e nunca imprime
  CPF, CNPJ, URL ou dados fiscais; falhas retornam apenas o tipo do erro.
- Teste real somente-leitura em 27/08: 2 clientes ativos (1 incompleto), 1
  emitente ativo/incompleto, 3 produtos prontos, 0 tarefas pendentes, 5 lotes
  numerados, contrato/função/remoção de `PUBLIC EXECUTE` confirmados.
- Validação: **75 testes Web em 13 arquivos**, TypeScript e build passaram.

### Ferramenta local de contexto — Graphify

- Graphify oficial `graphifyy` 0.9.50 foi instalado fora dos ambientes de
  produção, em `.tools/graphify`, com o complemento SQL.
- O mapa `--code-only` foi atualizado após esta rodada: 121 fontes, 1.030 nós,
  2.331 relações e 75 comunidades.
- A auditoria inicial não encontrou `.env`, downloads, logs, tarefa real ou
  caminhos pessoais nos artefatos pesquisados.
- `.tools/` e `graphify-out/` estão ignorados. Não foram ativados backend
  semântico, modo estrito, hooks, watch ou MCP.
- Uso, reinstalação e handoff seguro estão documentados em `GRAPHIFY.md`.
- A política foi calibrada por eficiência: usar em trabalho transversal,
  arquitetura, segurança, banco, integração ou impacto incerto; dispensar em
  edição pequena com arquivos já conhecidos. Atualizar o mapa somente quando
  relações de código mudarem.
- A adoção inicial do Graphify não alterou código funcional. A continuação
  abaixo acrescenta somente testes de orquestração, sem mudar o Worker.

### Continuação autônoma — testes da orquestração da fila

- `worker/tests/test_main.py` passou a cobrir diretamente as duas funções que
  ligam `main.py` à fonte PostgreSQL, sem navegador ou banco real.
- Contrato e credencial válidos voltam a `PENDENTE` sem consumir tentativa;
  credencial ausente vai para `AGUARDANDO_CONFERENCIA`.
- Falha antes de `EMITINDO` é registrada como `ERRO`. Falha depois dessa
  transição exige `AGUARDANDO_CONFERENCIA`, sem registrar autorização.
- O caminho autorizado comprova o repasse de chave, número e protocolo junto
  ao token vigente da reserva.
- Validação desta continuação: 10 testes focados, **150 testes Worker**,
  `compileall` e `git diff --check` passaram. Nenhum seletor Playwright mudou.

### Continuação autônoma — prontidão e menor privilégio

- A Home ganhou checklist de preparação fiscal com links de um toque para
  emitentes, clientes e produtos pendentes. CNPJ/CEP/IE usam exatamente os
  mesmos validadores do salvamento, incluindo dígitos verificadores do CNPJ.
- Emitentes e clientes mostram em cada cartão o que falta para gerar tarefas.
- A tela Distribuição filtra produtos fiscalmente incompletos e não abre o
  formulário quando nenhum cliente está pronto, evitando trabalho descartado.
- `error.tsx` e `loading.tsx` oferecem recuperação segura e feedback mobile em
  falha ou rede lenta; nenhum erro interno/banco é mostrado ao usuário.
- `WORKER_ID` e formato de `WORKER_DATABASE_URL` foram endurecidos sem incluir a
  URL em mensagens. O verificador do canal agora responde JSON sanitizado.
- `scripts/verificar_privilegios_banco.py` comprova privilégios obrigatórios e
  rejeita acesso excessivo, inclusive leitura de login/senha legados.
- `web/scripts/provisionar-worker-role.sql.template` concede somente leitura e
  colunas de escrita necessárias; continua não aplicado e não contém senha.
- Inspeção visual mobile concluída em viewport 390×844: checklist, bloqueio da
  Distribuição, alvos de toque e barra inferior ficaram legíveis e sem rolagem
  horizontal. Ainda convém repetir em celular físico no piloto.
- A primeira versão do checklist abriu quatro consultas extras e chegou a 71 s
  no ambiente local. Os campos de prontidão foram consolidados em um único
  round-trip sem credenciais; a Home voltou a HTTP 200 em ~0,95 s no ensaio
  local.

### Próximo gate

1. Completar o emitente no Web; o cliente COOPERATIVA observado já está pronto.
2. Criar uma distribuição nova e rodar `npm run db:verify-integration`.
3. Ensaio da fonte banco com processamento desligado, concorrência 1; esperado:
   reserva, validação e retorno a `PENDENTE`.
4. Depois, com autorização explícita, processamento completo em homologação
   visível de uma tarefa; conferir nota, metadados e arquivos.
5. Só então testar até 3 contextos e avançar para Storage/scheduler/VM.

### Comandos de validação

```powershell
cd web
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev
npm run db:verify-integration
npm run db:verify-security

# Antes de aplicar 0008 em outro banco:
npm run db:verify-pre-0008
npm run db:migrate

cd ..\worker
.\.venv\Scripts\python.exe -m pytest tests -v
.\.venv\Scripts\python.exe -m compileall main.py src scripts tests
.\.venv\Scripts\python.exe -m scripts.verificar_canal_banco --env-file .env
.\.venv\Scripts\python.exe -m scripts.verificar_privilegios_banco --env-file .env
```

Não executar o script de canal pelo caminho direto: ele deve ser chamado como
módulo para que `src` seja resolvido corretamente.

### Travas que não podem ser relaxadas

Ambiente `teste`; host HTTPS exato revalidado no clique; navegador visível no
primeiro ensaio; flags separadas de navegação, preenchimento e emissão; fonte
banco exige integração, URL e Worker ID; processamento exige todas as flags;
primeiro ciclo conectado usa concorrência 1 (teto técnico 3); lease vencido e
resultado pós-clique incerto sempre exigem conferência humana. Produção segue
bloqueada.

---

## Histórico de continuações

## Revisão de segurança — 25/08/2026

Foi concluída uma varredura de segurança no Web, no contrato Web → Worker,
na configuração do Worker e nas dependências. Alterações principais:

- `web/src/proxy.ts` cria uma trava Basic Auth provisória em produção e fecha
  o acesso com `503` quando as variáveis obrigatórias não estão configuradas;
- `next.config.ts` aplica CSP e cabeçalhos contra iframe, interpretação de
  conteúdo e uso indevido de recursos do dispositivo;
- Server Actions agora validam UUIDs, datas, comprimentos, números finitos,
  limites de volume, duplicidades e relações antes de gravar;
- URLs de PDF/XML são aceitas somente quando HTTPS, bloqueando esquemas como
  `javascript:` e `data:`;
- o Web deixou de coletar, gravar e projetar login/senha fiscal. Emitentes
  guardam apenas `credencial_referencia`, resolvida futuramente no Worker;
- a migração `0004_credencial_fora_do_web.sql` foi aplicada e validada no
  banco de teste: coluna e índice único presentes; 1 emitente preservado e 0
  referências configuradas. As colunas antigas continuam temporariamente no
  banco de teste, mas não são lidas/escritas pela aplicação;
- o contrato v1 rejeita payloads excessivos/adulterados, UUIDs inválidos,
  `NaN`/infinito, opções fiscais desconhecidas e mais de 200 itens;
- o Worker só aceita a URL HTTPS oficial da Receita/PR, limita clientes e
  concorrência, neutraliza injeção de linhas em logs e restringe permissões
  de logs/screenshots quando o sistema operacional permite;
- `npm audit --omit=dev`: 0 vulnerabilidades conhecidas de produção.

Validação final desta rodada: **44 testes Web**, **61 testes Worker**,
`tsc --noEmit`, build de produção e `git diff --check` passaram. O fluxo
Playwright e seus seletores não foram alterados.

Riscos que ainda bloqueiam produção: substituir Basic Auth por autenticação
individual/autorização; migrar e remover as colunas legadas de credencial;
RLS/menor privilégio; Storage privado com URLs assinadas; rate limiting/WAF;
retenção de artefatos; lease/idempotência da emissão. Checklist completo em
`docs/SECURITY.md`.

Também foi criado o produtor interno v1 no Web: ele projeta uma tarefa
`PENDENTE`, normaliza CNPJ/CEP, exige todos os campos fiscais e fixa
`ambiente: teste`. Não é Server Action pública e ainda não é consumido pelo
Worker. A migração `0005_identificador_emitente_nfpe.sql` adiciona o valor da
opção do emitente sem segredo e foi aplicada ao banco de teste; o registro
existente permanece pendente até o reconhecimento humano.

Próximo código que não depende de novos seletores: estados, tentativas e lease
atômica. Próximo passo humano no site fiscal: preencher os identificadores dos
emitentes e reconhecer a tela final em homologação sem clicar em **Emitir**.

## Continuação — tela final e downloads reconhecidos em 25/08/2026

- Após Transporte, **Avançar** leva ao Resumo; o botão final tem nome visível
  `Emitir`.
- Após emissão manual em homologação, foram observados `Baixar XML` e
  `Visualizar DANFE`. O segundo baixa diretamente um PDF chamado
  genericamente `DANFE.pdf`.
- `baixar_documentos()` agora usa `page.expect_download()` e botões por role
  + nome exato; XML e DANFE passam a ser salvos com nome próprio baseado na
  tarefa. O `BrowserContext` aceita downloads explicitamente.
- O modo padrão segue sem emissão. Um modo controlado foi ligado ao `main.py`
  depois desta observação; ainda faltam seletor/texto da resposta
  autorizada/rejeitada e os dados do Resumo para que sucesso não seja inferido
  apenas pela existência de botões/downloads.
- Validação desta continuação: **63 testes Worker**, `compileall` e
  `git diff --check` passaram.

## Continuação — emissão controlada pronta para teste

- `TESTAR_EMISSAO_HOMOLOGACAO=true` liga o circuito
  preenchimento → conferência humana → Emitir → XML → DANFE.
- Há bloqueio em configuração e no instante do clique: ambiente precisa ser
  `teste`, host precisa ser exatamente o da homologação e `HEADLESS=false`.
  A emissão de homologação aceita até 3 clientes/contextos simultâneos, com
  `MAX_CONCORRENCIA=3`.
- Downloads inválidos, vazios, acima de 20 MB ou com assinatura incompatível
  são recusados e removidos.
- O navegador permanece aberto após o download para captura do status
  Autorizada/Rejeitada. Passo a passo em
  `docs/TESTE-WORKER-HOMOLOGACAO.md`.
- A autorização observada ao vivo é `<span class="autorizada">AUTORIZADA</span>`.
  O Worker agora exige classe + texto exato antes de iniciar XML/DANFE; não
  infere mais sucesso apenas pela presença dos botões de download.
- Teste ao vivo em 25/08/2026: emissão em homologação autorizada, XML e DANFE
  capturados com sucesso. Não há mais prompt antes do clique: a flag explícita
  de homologação e as travas técnicas autorizam o teste. Após os downloads, o
  contexto fecha automaticamente.
- Sem `AUTORIZADA`, o Worker não baixa documentos e salva HTML + captura local
  de diagnóstico na pasta ignorada `worker/downloads/`, sem incluir o conteúdo
  fiscal no log.
- A nomenclatura local de XML/DANFE agora usa tipo, nome curto do mercado (ou
  razão social), emissor, número da distribuição e data. `0006` adiciona o
  contador sequencial dos lotes e `tarefas.lote_id`, para que o número oficial
  venha do banco e não seja inventado no Worker. A migração foi aplicada e
  verificada: 5 lotes numerados, colunas presentes e 8 tarefas pendentes
  antigas sem lote preservadas para revisão; polling segue desligado para elas.
  No teste local A/B/C, `CLIENTE_X_NOME_EMITENTE` identifica corretamente o
  emissor de cada contexto sem armazenar segredo no Web.
- O cadastro Web de mercados passou a exigir todos os dados fiscais hoje
  confirmados e ganhou edição dos registros existentes.
- O cadastro de emitentes também exige CNPJ, IE, referência da credencial e
  identificador NFP-e; registros existentes podem ser completados em
  `/emitentes`, sem guardar login ou senha no Web.
- Validação local final: **77 testes Worker**, **46 testes Web**, `compileall`,
  `tsc --noEmit`, `git diff --check` e
  build de produção passaram.

Próximo gate: executar uma emissão em homologação seguindo o roteiro. Somente
depois do resultado real implementar polling/reserva atômica do banco e envio
de documentos ao Storage, para não misturar diagnóstico do Playwright com o
da integração distribuída.

## Integração Web → banco → Worker — fundação preparada

- A migração `0007_fila_worker_lease.sql` cria tentativas, lease, erro
  sanitizado, índice de fila e `fiscal.reservar_tarefas_worker`.
- `worker/src/fonte_tarefas.py` reserva tarefas e projeta os joins do banco no
  contrato v1. A biblioteca `asyncpg` só é importada quando a fonte é usada.
- A fonte ainda não está ligada ao `main.py`/Playwright: primeiro aplicar a
  migração e executar uma reserva/leitura de homologação sem emitir; então
  implementar o retorno de status e Storage.
- Somente `PENDENTE` com `lote_id` é elegível. Reserva expirada não é repetida
  automaticamente, pois a Receita pode ter autorizado a nota antes da queda.
- Validação local: **79 testes Worker**, **46 testes Web**, `tsc --noEmit` e
  `git diff --check` passaram. Instalar `asyncpg==0.30.0` no venv antes do
  primeiro teste conectado.

## Continuação — ensaio controlado da fila

- O `main.py` ganhou o modo explícito `FONTE_TAREFAS=banco`, protegido também
  por `TESTAR_INTEGRACAO_BANCO=true`, `WORKER_DATABASE_URL` e `WORKER_ID`.
- Nesse modo ele reserva até o limite de concorrência, valida o contrato e
  confirma a referência de credencial local sem exibir segredo. Não abre
  Chromium e não emite: o status vai para `AGUARDANDO_CONFERENCIA`.
- A próxima tarefa para teste deve ser nova, com `lote_id` e cadastro fiscal
  completo. As oito tarefas antigas permanecem inelegíveis. Antes do primeiro
  ensaio, colocar no `.env` do Worker uma credencial de banco exclusiva e o
  `WORKER_ID`; nunca copiar esse valor para Git ou chat.
- Validação local desta continuação: **80 testes Worker** e **46 testes Web**.
- A tela Web de tarefas também exibe tentativas, validade da reserva e a
  mensagem sanitizada retornada pelo Worker quando a tarefa está expandida.

Auditoria do banco de teste, sem exibir dados: 2 clientes ativos e os 2 ainda
estão fiscalmente incompletos; nenhum está sem vínculo de emitente. Há 1
emitente ativo sem `credencial_referencia`/`valor_select_nfpe`, 3 produtos
ativos completos e 8 tarefas pendentes. Portanto, o polling permanece
desligado: primeiro corrigir os cadastros pela nova edição em `/clientes` e
completar o emitente; tarefas antigas deverão ser revisadas antes de serem
consideradas elegíveis.

## Atualização de contexto — 24/08/2026

O marco anterior `59da6cc` implementou a relação emitente por tarefa no Web. O teste/demonstração mais recente confirmou preenchimento em homologação com múltiplos contextos, sem clicar em **Emitir**. A carga local (transmissão e outros programas) afetou a velocidade, mas falhas continuaram isoladas por contexto.

Decisões de domínio registradas em `docs/REUNIAO-2026-08-22.md`:

- execução automática de tarefas entre 00:00 e 06:00;
- relação N:N entre emitentes e clientes, escolhida por tarefa;
- preço padrão por produto+cliente, com override promocional;
- relatório operacional bruto separado do financeiro líquido futuro.

### Atenções antes da próxima implementação

1. A relação N:N foi implementada e a migração `web/src/db/migrations/0001_emitente_por_tarefa.sql` foi aplicada ao banco de teste. Ela mantém `clientes.emitente_id` apenas como legado. Os logins de emitentes não foram alterados.
2. O Worker ainda usa dados hardcoded para a demonstração. Priorizar contrato de tarefa + carregamento do banco/fila em vez de adicionar novos valores fixos.
3. Confirmar visualmente o relatório após aplicar a migração. A causa de troca cancelada no KPI foi corrigida e coberta por teste unitário.
4. Antes de ligar a emissão, reconhecer a tela final em homologação e apenas identificar (sem clicar) o botão de emitir.
5. Não integrar Web e Worker por leitura direta improvisada. Primeiro definir e testar o contrato de tarefa, estados e reserva/retorno; ver `docs/ROADMAP.md`.

### Implementado nesta rodada — 24/08/2026

- Corrigida a separação entre smoke test e preenchimento: autenticação ou
  navegação sem `tarefa_real.json` não tenta mais alterar uma tarefa ausente.
- `CLIENTE_X_EMITENTE` deixou de ser obrigatório para login/navegação; é
  validado com mensagem clara apenas quando há preenchimento completo.
- `AMBIENTE_EMISSAO` agora é repassado por `main.py` para
  `navegar_ate_emissao()`. Assim, o valor configurado controla de fato o
  caminho de homologação/produção.
- Atualizados `.env.example` e testes unitários. Testes do Worker: **37
  passando**; `compileall` e `git diff --check` também passaram.

Próxima implementação recomendada: documentar e implementar o contrato de
leitura de tarefas Web → Worker, inicialmente com uma fonte local/testável e
sem emissão real. O detalhamento por fases está em `docs/ROADMAP.md`.

### Continuação — contrato e implantação proposta

- Criado `worker/src/contrato_tarefa.py`: valida o contrato versionado v1 e
  converte o payload seguro para o modelo fiscal, sem banco, navegador ou
  credenciais.
- Cobertos em teste: payload válido, versão desconhecida, código fiscal de
  produto ausente, endereço ausente, referência de credencial ausente, IE
  obrigatória e benefício fiscal sem código.
- Testes do Worker após esta alteração: **44 passando**, sem navegador,
  banco ou credenciais.
- Criado `docs/DEPLOYMENT.md`: recomenda Web no Vercel e Worker persistente
  em VM/container. Oracle Always Free é opção de piloto, sujeita a uma prova
  de capacidade; não confundir com uma garantia de produção.

### Continuação — regra fiscal reutilizável por produto

- Preparada a migração `0002_regras_fiscais_reutilizaveis.sql`: cria uma
  regra NFP-e inicial com os dados fiscais confirmados, associa os produtos
  existentes e preserva a regra escolhida em cada item de tarefa.
- O cadastro de produto passou a exigir código fiscal e usa automaticamente
  a regra ativa quando houver apenas uma, reduzindo cliques no celular.
- A listagem exibe a regra aplicada ao produto; o formulário virou uma coluna
  no mobile e duas colunas apenas a partir de telas maiores.
- Aplicada ao banco de teste em 24/08 junto com a migração `0003`.
- Validação local: 25 testes do Web, `tsc --noEmit` e build de produção
  passaram.

### Continuação — roteiro profissional de entrega

- Criada a página Web `/entregas`, com impressão de roteiro da **Graalys**.
  Ela agrupa cada lote por cliente e mostra CEP, produto, quantidade e
  troca; não há preços, subtotais ou faturamento nessa tela.
- A migração `0003_lotes_e_endereco_entrega.sql` cria um lote por confirmação
  de distribuição. O legado é agrupado por data apenas para manter histórico;
  novas rodadas são exatas.
- A página abre o lote mais recente por padrão, permite selecionar outro lote
  e ocultar endereço/trocas antes de imprimir. Ação de imprimir usa o diálogo
  nativo do dispositivo, inclusive em celular/tablet.
- Validação local: 26 testes do Web, TypeScript e build de produção passaram.
- As migrações `0002` e `0003` foram aplicadas e conferidas no banco de
  teste: 1 regra fiscal, 5 lotes históricos e zero produto/item/
  disponibilidade sem a referência nova.
- Após feedback operacional, o roteiro foi simplificado: usa CEP e número
  existente; não adiciona campos de endereço no cadastro de cliente.

### Implementado nesta rodada — 22/08/2026

- tabela N:N `cliente_emitentes`, com migração dos vínculos antigos;
- `tarefas.emitente_id`, gravado no momento da distribuição;
- tarefas pendentes agora são agrupadas por cliente + emitente + data;
- cadastro de cliente permite habilitar múltiplos emitentes;
- distribuição exige a escolha de emitente para cada cliente com quantidade faturável;
- listagem de tarefas exibe o emitente escolhido;
- 25 testes unitários, verificação de tipos e build de produção passaram.

`npm run db:generate` e `npm run db:migrate` continuam falhando nesta máquina
devido ao erro do sistema operacional (`uv_os_get_passwd ... ENOMEM`). A
migração foi aplicada por um executor direto que usa a mesma transação e o
mesmo histórico/hash do Drizzle, sem expor credenciais. Validação posterior:
1 emitente preservado, 2 relações cliente↔emitente e zero tarefas ou
distribuições sem emitente.

Também foi corrigido o cálculo de **Perdido em trocas**: trocas associadas a
tarefa cancelada não entram mais no KPI. A correção grava o emitente na
distribuição, relaciona distribuição→tarefa no relatório e filtra
`CANCELADA` no cálculo.

---

Última alteração — preenchimento completo da NFP-e em homologação validado

O teste ao vivo de 21/08/2026 foi concluído com sucesso no ambiente de TESTE (homologação), sem clicar em Emitir.

Resultado validado ao vivo

O fluxo completo de preenchimento percorreu:

Login → Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE → Consentimento → Emitente → Destinatário → Identificação da operação → Local de retirada/entrega → Produtos → ICMS → tela Adicionar Produto/Avançar → Transporte

Foram validados:

1 produto: preenchimento completo até Transporte.

2 produtos: mesmo fluxo, usando Adicionar Produto entre os itens, com sucesso.

Transporte: Modalidade do Frete = 3 selecionado e Avançar executado com sucesso.

O fluxo termina antes de validar_antes_de_emitir() / emitir() de propósito.

Log final validado:

PREENCHIMENTO COMPLETO OK — parado antes de 'Emitir' (não implementado/testado de propósito)
Concluído com sucesso
AUTENTICAÇÃO OK

Principais correções implementadas durante o reconhecimento ao vivo

1. Destinatário / CEP e número

O CEP dispara uma atualização dinâmica da seção de endereço e pode recriar/apagar o campo Número. O fluxo validado ficou:

CEP → Tab → aguarda loading → 1s → localiza Número novamente → preenche Número → valida valor → Avançar

O indicador de carregamento observado foi:

#app > div.slds-align_absolute-center.loading

Não usar Enter no CEP: durante os testes, Enter podia submeter o formulário em vez de apenas disparar a atualização.

2. Produto / Código do Produto

O seletor genérico input.default-input.slds-input[aria-controls] encontrou três autocompletes visíveis e foi abandonado.

O seletor final usa o label como âncora:

label("Código do Produto") → pai → input.default-input.slds-input

Fluxo validado:

click → fill(código) → ArrowDown → Enter

3. Campos do produto

Foi confirmado que Unidade Comercial, Quantidade Comercial e Valor Unitário Comercial são três campos distintos no mesmo layout. Não usar nth-child genérico para quantidade/valor.

Os campos passaram a ser localizados pelo respectivo label:

Unidade Comercial → autocomplete → ArrowDown + Enter

Quantidade Comercial → input do bloco do label

Valor Unitário Comercial → input do bloco do label

4. Benefício fiscal

Localização pelo legend Possui benefício fiscal? e seleção de Sim dentro do bloco.

Código do benefício pelo label Código de Benefício Fiscal na UF e input do bloco correspondente.

Valor usado e validado no ambiente de teste: PR810128.

5. ICMS

Ambos os campos passaram a usar label → pai → select.slds-select:

Situação Tributária ICMS → value 40

Origem da mercadoria → value 0

6. Fluxo real de múltiplos produtos

Foi corrigida uma interpretação anterior do fluxo. A etapa de Produtos possui uma tela intermediária depois do segundo Avançar de cada item:

Produto
  ↓ Avançar
ICMS
  ↓ Avançar
Tela: Adicionar Produto / Avançar
  ├─ outro produto → Adicionar Produto → próximo Produto
  └─ último produto → Avançar → Transporte

Portanto:

preencher_item() preenche um único produto e termina na tela Adicionar Produto / Avançar.

preencher_produtos() decide se chama Adicionar Produto ou se clica Avançar para Transporte.

Esse comportamento foi validado com dois produtos reais de teste.

7. Botão Avançar nas etapas de Produto

As etapas de produto podem apresentar mais de um botão Avançar em alguns estados. Foi criado fluxo específico para produtos, em vez de alterar o helper global usado nas demais etapas.

8. Transporte

O campo foi validado pelo padrão:

label("Modalidade do Frete") → pai → select.slds-select

Valor testado:

3 = Transporte Próprio por conta do Remetente

Também foi necessário tratar o Avançar da etapa de transporte separadamente porque a tela pode conter mais de um botão com o mesmo nome em alguns estados.

Regra de seletores consolidada

O reconhecimento ao vivo confirmou que os componentes desse formulário reutilizam classes e estruturas. A estratégia que funcionou melhor foi:

label/legend → elemento pai → input/select

Para autocompletes:

label → pai → input → click → fill → ArrowDown → Enter

Evitar cadeias longas de nth-child sempre que um label, role, texto ou outro atributo estável estiver disponível.

Ambiente de teste

AMBIENTE_EMISSAO=teste continua sendo o padrão.

Caminho:

Login → Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE

O fluxo usa o ambiente de homologação da Receita PR e o teste atual não executa a emissão.

Estado atual do projeto

Funcionando e validado ao vivo:

autenticação

navegação até homologação

consentimento

emitente

destinatário

CEP + sincronização do endereço

número do endereço

identificação da operação

local de retirada/entrega

busca/seleção de produto

CFOP

unidade comercial

quantidade

valor unitário

benefício fiscal

código do benefício

situação tributária ICMS

origem da mercadoria

múltiplos produtos

transição para Transporte

modalidade do frete

transição após Transporte

Ainda não implementado/testado:

tela de resumo/validação fiscal final em detalhe

botão Emitir

download de PDF/XML

cancelamento

fluxo completo de emissão real

Próximo passo

Reconhecer a tela de Resumo/Validação final no ambiente de teste, documentar seus campos/validações e identificar o botão de emissão sem clicar nele.

Depois disso, implementar o fluxo de download de documentos e somente então decidir como conduzir o teste controlado de emissão.

Histórico anterior

Ambiente de TESTE (homologação) + correção de bug real

O teste ao vivo de 20/08 confirmou que tentativas no ambiente fiscal normal ficam registradas no histórico do governo mesmo sem clicar em Emitir. Por isso foi criado e ligado por padrão o ambiente de homologação (NFP-e TESTES → Emissão - TESTE).

src/auth.py: navegar_ate_emissao() ganhou ambiente: Literal["normal", "teste"] = "teste".

src/config.py: adicionada AMBIENTE_EMISSAO com default "teste".

main.py: passa o ambiente para a navegação e registra warning explícito quando está em teste.

worker/RECON.md: adicionada a seção do ambiente de teste.

O bug inicial do CNPJ também foi confirmado e corrigido: o seletor amplo pegava o radio de CPF em vez do input de CNPJ. A solução foi restringir o input com :not([type=radio]) e :visible.

Revisão de segurança, robustez e desempenho

Mantidas as correções já documentadas para:

CredencialCliente.__repr__() sem vazamento de credenciais.

mensagens protegidas em erros de preenchimento de login.

INSPECIONAR=true sem page.pause() em headless.

src/utils/debug.py convertido para Async.

MAX_CONCORRENCIA via asyncio.Semaphore.

isolamento por BrowserContext.

fechamento de contextos/browser em finally.

falha isolada de uma tarefa sem derrubar as demais.

Migração para Async Playwright

O projeto foi migrado de Sync Playwright + ThreadPoolExecutor para:

Async Playwright + 1 Browser + N BrowserContexts + asyncio.gather()

Não misturar Page Sync com Page Async.

Regra de colaboração

Antes de alterar código:

git status
git diff

Após alterar:

testar
documentar
atualizar este arquivo

Ler docs/AI-CONTEXT.md antes de decisões arquiteturais.
