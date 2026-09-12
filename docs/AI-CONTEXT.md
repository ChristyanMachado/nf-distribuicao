# AI Context — NF Distribuição

## Fila de impressão automática preparada localmente — 12/09/2026

O Worker terá uma fila separada de impressão de roteiro por distribuição. A
implementação local só reserva lote cujas tarefas e notas estejam integralmente
autorizadas; qualquer resultado incompleto bloqueia a impressão. Depois do
marco de envio à impressora, uma falha não recebe retry automático: vai para
conferência humana, para não duplicar papel em reboot. A impressora pode ser
local ou de rede pelo nome Windows. A migration `0017_impressao_roteiros.sql`
foi aplicada no Supabase com grants mínimos (sem leitura/execução para anon);
o endpoint e Worker ainda aguardam publicação/instalação e ensaio de impressora.

## Refinamento local de trocas e roteiro — 12/09/2026

- O único roteiro em `/entregas` foi ajustado para leitura e compartilhamento
  por celular. O botão continua usando a impressão nativa para imprimir **ou
  salvar PDF**; não há segunda versão nem biblioteca de PDF. O documento usa
  cartões por mercado e mantém `Normal` e `Troca` em colunas separadas. No CSS
  de impressão, o PDF segue o mesmo formato estreito (`105 mm × 190 mm`).
- `quantidadeDistribuida` é a quantidade **total** da entrega, incluindo troca;
  a quantidade faturável é o total menos a troca. O formulário passou a usar
  esse rótulo e explica a regra no próprio campo.
- Trocas são validadas e agregadas em milésimos no servidor. A soma `0,1 + 0,2`
  chega ao SQL como `0,300`, sem erro de ponto flutuante. O cadastro também
  persiste a quantidade com três casas.
- Limitação conhecida: registrar troca é aditivo e ainda não possui lançamento
  idempotente/auditável. Após uma falha de rede, conferir o saldo antes de
  enviar de novo. Isso exige decisão de modelo para lançamento, não uma trava
  visual. Validação local: 153 testes Web e `tsc --noEmit` passaram.
- Nenhum deploy, alteração remota, Worker ou efeito fiscal ocorreu nesta rodada.

## Saldo de trocas confirmado, local e não publicado — 12/09/2026

Troca é saldo físico por **produto + mercado**, compartilhado entre emitentes
habilitados para aquele mercado. Usar parte da troca reduz somente a parcela
usada e preserva o restante. A implementação local acrescenta
`fiscal.trocas_mercado`, tela `/trocas` para somar devoluções físicas ao saldo,
consulta no formulário e baixa atômica no `processarDistribuicao`; uma tentativa
com saldo insuficiente faz a transação inteira falhar. Repetição de lote não
repete trocas já baixadas. A migration `0016_trocas_mercado.sql` foi aplicada
com autorização explícita ao Supabase em 12/09/2026. Verificação: tabela
presente, sem SELECT para `anon`, `authenticated` ou `nf_worker_vm`. Não houve
deploy nem escrita no Worker. 151 testes Web e TypeScript passaram.

O snapshot do Drizzle não acompanha todas as migrations manuais históricas:
`db:generate` normal tentou recriar objetos existentes e foi descartado. A
migration foi criada com o modo `--custom` do próprio Drizzle. Não regenerar
automaticamente até reconciliar snapshots/journal; o runtime de migration usa
o journal e o SQL local. Graphify incremental atualizado: 1.751 nós, 4.051
relações, 128 comunidades.

## Lote 10 e próximo refinamento operacional — 12/09/2026

Uma contingência local autorizada processou a distribuição 10: quatro notas
AUTORIZADA em primeira tentativa, com XML/DANFE confirmados no Storage privado.
VM continuou `NOLOGIN`; a fila terminou sem tarefas pendentes ou ativas.

O próximo objetivo de UX é orientar o formulário por mercado, não por produto.
Há uma reorganização visual local em `DistribuicaoForm.tsx`: totais físicos de
produto primeiro, depois cartões de mercado contendo os produtos e campos
separados de quantidade normal/troca. Não houve mudança no contrato/Worker.

Trocas históricas seguem o cálculo fiscal `quantidadeFaturavel =
quantidadeDistribuida - quantidadeTroca`; o saldo prévio está localmente
implementado conforme a seção acima, mas aguarda migration remota. Relatório
mobile também depende de escolher se o motorista acessará link
autenticado, artefato para baixar ou uma visualização pública limitada.

## Contingência e revisão final — 11/09/2026

Emissão urgente do lote 9 concluída pela versão anterior `dda2227`, isolada em
`dist/graalyst-worker-local`: quatro AUTORIZADA, primeira tentativa, PDF/XML
armazenados. Credenciais existentes reutilizadas sem alteração; processo encerrado,
sem serviço agendado. Ver `CONTINGENCIA-LOTE-9-2026-09-11.md`. VM continua NOLOGIN.

A revisão independente encontrou incompatibilidades na migration coordenada ainda
não publicada: ordem real de persistência da autorização, estado final dos documentos,
transições com lease NULL e posse da limpeza. Corrigidas localmente; roteiro SQL
ampliado aprovado no QA com rollback integral em 11/09, após bloqueio temporário
de permissão. 310 testes Python, 150 Web, TypeScript e parser PowerShell passaram.
**Não promover antes do ensaio Windows/múltiplos executores autenticados.**
SET ROLE em uma transação de QA não comprova concorrência real entre máquinas.

## Executores físicos com fallback — 10/09/2026

Implementação local em curso na branch `codex/christyan-workers-coordenados`.
Contrato/validação em `WORKERS-COORDENADOS.md`; instalação em
`WORKER-WINDOWS-SERVIDOR.md`. Modo opt-in, registry autenticado por papel individual,
heartbeat 30s/validade 120s, prioridade PC > PC2 > VM, fencing de boot e token,
fronteira externa persistida e parada/atualização controlada no Windows.
Não ativado em produção; não instalar serviço fiscal na estação de desenvolvimento.
Testes SQL em QA usam rollback e não equivalem a ensaio concorrente entre PCs.

## Contingência operável no Windows — 10/09/2026

Modo operador local preparado, sem Docker e sem agendamento: consulta o lote,
confirma uma vez e chama o Worker existente com concorrência 1. Bloqueia VM
habilitada/sessão/tarefa ativa/tentativa anterior e aceita apenas IDs exibidos.
Segredos ficam fora do pacote. Ver `OPERADOR-WINDOWS.md`. Ainda exige ensaio de
instalação limpa; `nf_worker_vm` permanece NOLOGIN.

## Incidente prioritário — 10/09/2026

Contingência local do lote 7 concluída: três notas autorizadas na primeira
tentativa, XML/DANFE armazenados e processo encerrado. Atenção: papel
`nf_worker_vm` permanece NOLOGIN para isolamento; não existe serviço local
agendado. Recuperar operação da madrugada exige handoff explícito e diagnóstico
da VM inacessível por SSH. Ver `INCIDENTE-WORKER-2026-09-10.md`.

## Revisão vigente de lapidação — 09/09/2026

Prioridade vigente: `HOMOLOGACAO.md`. Projeto de QA criado e estrutura/seed
preparados, conexão Web ainda pendente; não usar banco real para validar envio.
Guardas de isolamento e confirmação pós-envio implementadas localmente.

Continuação e validação analítica: `VALIDACAO-LAPIDACAO-2026-09-09.md`.
143 testes Web/build aprovados; conferência móvel em navegador realizada sem
envio. Rascunho e destinos só de trocas reforçados. Relatório por escala e cast
de status corrigidos localmente. Produção consultada ainda em `7e6c318`.
Data Analytics disponível; não confundir instalação com novos dados manuais.

Consultar `AUDITORIA-LAPIDACAO-2026-09-09.md` e o ROADMAP reconciliado.
Métricas de 3 notas são comparação exploratória, não economia comprovada por
equivalência de itens/preparação. Código local desta rodada ainda não publicado;
histórico abaixo conserva os contextos originais. Não inferir validação visual
ou fiscal a partir de build/testes.

## Objetivo

Preferência do responsável: recomendar modelo e intensidade ao iniciar cada
novo trabalho, com justificativa curta, sem bloquear execução por troca.
Consultar `MODELOS-IA.md`; não prometer economia não medida ou equivalência
entre modelos. Para tarefa continuada, repetir apenas quando mudar o escopo.

Contexto autoritativo para pessoas e IAs. Antes de alterar código, ler também
`ARCHITECTURE.md`, `HANDOFF.md` e `COLABORACAO.md` e conferir o diff atual.

O produto organiza distribuições diárias e automatiza NFP-e. O Web cadastra e
gera tarefas; o banco mantém snapshots imutáveis e a fila; o Worker reserva e
executa cada tarefa em um `BrowserContext` independente.

## Métricas honestas por escala — 08/09/2026

- O tempo do Worker por lote é calculado por timestamps reais: da primeira
  tarefa iniciada à última concluída. Lotes reprocessados ficam fora da métrica
  de velocidade porque `iniciado_em` preserva a primeira tentativa para
  auditoria. Os novos KPIs adicionais são tempo médio por nota e por item,
  ponderados pelas notas/itens de todos os lotes limpos.
- O benchmark manual conhecido (337 s) representa somente uma distribuição de
  3 notas em 25/08/2026. A economia estimada não pode ser extrapolada para
  lotes de outro tamanho; portanto somente lotes com 3 notas entram nesse
  acumulado. Lotes de 5 notas seguem medidos como tempo real, sem alegação de
  economia até existir benchmark humano equivalente. Novos benchmarks devem
  registrar tamanho do lote, itens, emitentes/clientes e versão da referência.
- Cancelamento posterior muda `fiscal.notas.status`, não a tarefa concluída.
  Relatórios usam o estado fiscal da nota quando disponível: nota cancelada não
  compõe bruto/rankings/notas vigentes e é mostrada separadamente de `ERRO`, que
  continua reservado a falha técnica do Worker. Não inferir culpa do sistema a
  partir de cancelamento operacional.
- A conferência final de distribuição agora expõe também preço unitário e
  subtotal por item, com alerta visual não bloqueante se o preço divergir do
  último praticado para produto/mercado. Não criou confirmação extra nem altera
  snapshots, fila ou emissão.
- O campo histórico `distribuicoes.preco_promocional`, já existente no schema,
  passou a ser utilizado: quando o operador marca um preço divergente como
  promocional, o valor permanece no snapshot fiscal, mas não substitui a
  sugestão de preço normal da próxima distribuição. A marcação só aparece para
  preço alterado e é opcional; voltar ao preço de referência a remove.
- Validação local: 121 testes Web, TypeScript e build Next.js aprovados. Falta
  apenas validação visual humana no Vercel/celular; não houve mudança remota.

## Quick wins Web — 08/09/2026

- A pesquisa de produtos da distribuição aceita setas e Enter, e a confirmação
  de envio permite iniciar uma nova distribuição sem navegar de volta. O
  compartilhamento de documento passou a informar cópia/compartilhamento bem
  sucedido ou falha operacional sem confundir o cancelamento nativo do usuário
  com erro. Não há alteração de banco, Worker ou fluxo fiscal.
- Validação local: TypeScript, 117 testes Web e build Next.js aprovados.
  A checagem visual automática depende de `agent-browser`, indisponível nesta
  estação; validar os três comportamentos no Vercel/celular antes do deploy.

## Incidente prioritário de cancelamento — 08/09/2026

- Nova divergência em produção: o portal exibiu `<span>Autorizada</span>` para
  a nota localizada, mas o Worker recusou antes do clique. A leitura antiga
  buscava a segunda célula de toda a página e escolhia a última ocorrência; não
  havia garantia de vínculo com a linha dos documentos consultados nem log do
  texto encontrado. A correção local ancora status e ações na mesma linha que
  contém DANFE e XML, normaliza apenas diferenças de apresentação e registra
  bruto, normalizado e classificação. Estados não exatos continuam bloqueados.
  Validação local: 279 testes Worker. A correção `c394132` foi publicada e
  instalada na VM, cujo container voltou saudável; ainda aguarda uma tentativa
  humana autorizada. Não executar o cancelamento automaticamente.

- Uma nota real em produção permaneceu `Autorizada` depois de o Worker localizar
  a nota e preencher o motivo. A versão antiga apagou a exceção original, mas o
  intervalo de 0,3 s e a ordem do código provam que não houve confirmação do
  clique nem espera pela resposta. O defeito demonstrável era exigir novamente
  o caminho `/consulta` depois que o formulário podia mudar a rota da SPA; o
  locator global do botão também não excluía cópias responsivas. O teste falso
  não simulava nenhum desses estados. A exceção pré-clique era encapsulada
  incorretamente como resultado incerto.
- A correção local mantém a rota exata para a pesquisa e, dentro do formulário,
  valida HTTPS + host exato do ambiente + controles esperados, com o botão
  ancorado ao formulário do motivo. Falhas certas
  antes do clique viram `CANCELAMENTO_NAO_ENVIADO`; somente interrupção iniciada
  no clique ou falta da mensagem oficial produz `AGUARDANDO_CONFERENCIA`.
- O log preserva etapa, clique confirmado, causa original sanitizada e timeout.
  O Web permite nova tentativa de um resultado incerto somente após o operador
  declarar que conferiu a Receita e viu a nota Autorizada. Antes de reenviar, o
  Worker pesquisa de novo e reconcilia `Cancelada` sem repetir o efeito fiscal.
- A janela operacional já convertia UTC para `America/Sao_Paulo`; somente o
  texto do log dependia do container. O formatador agora usa São Paulo e mostra
  o offset `-03:00`, sem alterar a regra de admissão de emissões.
- Validação local: 274 testes Worker, 117 testes Web, TypeScript e build Next.js.
  A correção foi publicada no GitHub em `adb82fa`, acionando o deploy do Web,
  e os quatro arquivos alterados do Worker foram instalados e reconstruídos na
  VM Oracle em 08/09; o container voltou saudável. Não houve migration,
  escrita remota nem novo cancelamento. Próximo gate é uma tentativa manual
  controlada, somente após nova confirmação operacional de que a nota continua
  Autorizada.

## Estado validado em 06/09/2026

- A primeira distribuição legítima de produção foi criada, mas suas duas
  tentativas falharam com segurança antes do destinatário e sem emissão. A VM
  ainda usa `d8bb52f`. Diagnóstico controlado comprovou uma corrida da SPA:
  clicar em Avançar imediatamente após selecionar o emitente deixava o portal
  em `/emitir/emitente`; após 3 s, a mesma ação abriu
  `/emitir/destinatario`. O erro original era o timeout do primeiro locator
  `CNPJ`, ocultado pelo wrapper de `main.py:1119`; os dados do destinatário
  ainda não haviam sido lidos. A correção local estabiliza apenas essa
  fronteira e confirma a âncora de Destinatário antes de prosseguir. A revisão
  `cabf9a4` foi instalada na VM com autorização, após backup e auditorias; o
  container está saudável e sem reinícios. Produção permanece preparada, mas
  não validada ponta a ponta até o reprocessamento legítimo.

- A transição fiscal para produção está implementada localmente e protegida
  por ambiente no snapshot, correspondência obrigatória Web/Worker, validação
  do host imediatamente antes dos efeitos fiscais e flags mutuamente
  exclusivas. O Web exibe selo Teste/Produção. Emissão normal usa `Emissão` no
  host `nfae.fazenda.pr.gov.br`; consulta normal usa a opção `Consulta` no mesmo
  host. Em 06/09, um ensaio local somente de leitura confirmou ao vivo a rota,
  o host, o emitente e o filtro vazio, sem pesquisar ou produzir efeito fiscal.
  O roteiro autoritativo é `PRODUCAO-FISCAL.md`. Em 06/09, o Vercel recebeu
  `AMBIENTE_EMISSAO=normal`, o redeploy da revisão `46ee06e` ficou `Ready` e a
  VM foi promovida para `normal`; o container está saudável e registra
  `Worker persistente iniciado no ambiente normal`. O primeiro corte mantém
  `MAX_CONCORRENCIA=1` e `PROCESSAR_CANCELAMENTOS_FISCAIS=false`. Falta a prova
  final: a primeira distribuição real legítima, criada e conferida
  conscientemente pelo operador. Não existe operação artificial de baixo risco
  autorizada. Produção está **preparada, ainda não validada ponta a ponta**.
  O operador já conferiu no ambiente normal os três emitentes e quatro produtos
  ativos. O escopo e a evidência da limpeza autorizada estão em
  `LIMPEZA-INICIO-PRODUCAO.md`.
  Em 06/09, a limpeza autorizada foi concluída: histórico de lotes, tarefas,
  notas, filas e os 44 objetos fiscais de homologação ficaram em zero; a
  sequência foi reiniciada para que o próximo lote seja 1. Foram preservados
  6 produtos, 5 clientes, 3 emitentes, 20 preços por cliente, 1 regra e 1
  configuração. A exclusão temporária foi publicada pela revisão `eea91d9` e o
  deploy ficou `Ready`; o responsável concluiu a remoção manual dos cadastros
  fictícios. A auditoria final registra 4 produtos ativos, 4 clientes ativos,
  3 emitentes ativos e nenhuma fila ou histórico fiscal. O Worker voltou
  `healthy` em ambiente `normal`, com cancelamentos habilitados; a fila
  permaneceu vazia após a partida.

- Cancelamento fiscal RF23 está implementado e testado localmente. Há
  fila própria `fiscal.cancelamentos_fiscais`, motivo editável, idempotência,
  lease/token e prova obrigatória na resposta atual pelo texto oficial. O
  Worker não recarrega a SPA depois de Confirmar, pois isso descarta o resultado
  transitório observado. Antes do clique, a situação da linha é consultada e
  `Cancelada` encerra o fluxo sem reenviar o comando. Resultado
  pós-clique sem prova fica para conferência e nunca é repetido automaticamente.
  `0015_cancelamento_fiscal.sql` foi aplicada e auditada em 05/09/2026;
  `0014` continua adiada, fora do journal, e nenhum objeto do sistema de ponto
  foi modificado. O cancelamento confirmado altera somente a nota e a fila:
  a tarefa de emissão continua concluída. `/notas` separa notas ativas e
  canceladas, ainda agrupadas pela distribuição.
- Os commits `59625c8` e `2d41b80` estão na `main`. O deploy de produção
  `dpl_9Eab4AbSVz2dCUdp5BXNXnVowg1B` foi confirmado como `READY` na Vercel,
  com o domínio `nf-distribuicao.vercel.app`. A etapa passou em 251 testes
  Worker, 108 testes Web, build Next.js e `compileall`.
- A versão de código `d8bb52f` do Worker foi instalada na VM Oracle preservando
  o `.env` secreto; `46ee06e` acrescenta apenas documentação. As auditorias
  dentro da imagem aprovaram o canal e os privilégios mínimos do papel
  `nf_worker_vm`. Após a limpeza das filas, o processamento de cancelamentos foi
  habilitado. Isso não cria cancelamento: o pedido só nasce após o operador
  revisar o motivo e confirmar explicitamente no Web; resultado incerto nunca
  recebe repetição automática.

- Reunião posterior: ver `REUNIAO-2026-09-05-RELATO.md` (relato reconciliado
  com transcrição parcial 000–005; parte perdida não inferida). Próximos pedidos: notas agrupadas por lote,
  cancelamento fiscal separado, recuperação de senha e novo benchmark realista.
  Manter homologação; início de produção ainda requer confirmação explícita.
  Financeiro será repositório independente com hub futuro. Não alterar Ponto.
  Negociação comercial está em `docs/privado/`, ignorado pelo Git.
  As prioridades foram implementadas localmente: confirmação persistente,
  notas agrupadas, rótulos claros e impressão compacta. A janela agora conclui
  o lote iniciado, mas essa regra ainda precisa de ensaio na VM.
  Cancelamento manual em homologação pode exigir reconciliação de estado.

- Tarefas e recuperações agora atualizam automaticamente enquanto houver
  trabalho ativo, em ciclos de 10s, pausados em aba oculta e encerrados ao
  concluir. Não foi concedido acesso Realtime ao schema fiscal: a sessão Web
  atual não preserva o JWT Supabase no navegador. Reavaliar Broadcast privado
  somente quando Supabase Auth/RLS estiverem de ponta a ponta.

- O Worker drena tarefas sequenciais sem aguardar o polling entre elas. O
  intervalo de 5s vale apenas para fila vazia; concorrência permanece 1 e as
  esperas/validações da Receita permanecem intactas.
  A drenagem está implantada na VM.
  `Recebido por` permanece opcional via filtro de conferência do roteiro.

- O primeiro ciclo fiscal completo na VM foi validado após a correção da
  transição de Transporte: AUTORIZADA, XML/DANFE privados e valores conferidos.
  Uma recuperação histórica também completou pela VM e restaurou o par por 7
  dias. Assim, o circuito remoto completo está comprovado em homologação.
  Polling atual: 5s; concorrência: 1. O intervalo caiu de 30s após o log mostrar
  cerca de 31s ociosos entre notas sequenciais; nenhum clique fiscal foi acelerado.
  O ensaio com concorrência 2 foi revertido: duas
  tarefas autenticaram, mas ambas expiraram durante a abertura dos menus da Receita;
  a terceira, executada sozinha logo depois, foi autorizada e armazenada normalmente.
  A janela foi ajustada pelo Web para
  00–10h durante o ensaio. Listagens ainda exigem navegação/recarga para buscar
  o estado novo; atualização automática é melhoria de UX pendente.

- Atualização autoritativa: Worker em execução na VM via Compose, ambiente
  normal, concorrência 1, polling 5s, recuperação 24h e janela fiscal lida do
  banco. Configuração transferida com autorização explícita e modo 600;
  auditoria de privilégios/canal passou dentro do container. O healthcheck
  passou após a virada. Cancelamentos estão desativados neste primeiro corte.
  Relatos abaixo de homologação ou serviço parado representam etapas anteriores.

- A VM piloto foi criada na Oracle em Vinhedo com Ubuntu 22.04 x86_64 e a
  forma Always Free `VM.Standard.E2.1.Micro` (1 GB). O bootstrap reproduzível
  `worker/scripts/preparar_vm_ubuntu.sh` foi executado com sucesso: 4 GB de
  swap, Docker 29.8, Compose 5.5, fuso `America/Sao_Paulo`, atualizações
  automáticas e firewall com somente SSH de entrada. O acesso usa chave,
  `PasswordAuthentication` já está desativado e nenhum Worker foi iniciado.
  Por causa da memória física limitada, o piloto permanece headless e está em
  configuração conservadora com `MAX_CONCORRENCIA=1`. O teste com valor 2 causou
  timeouts simultâneos nos menus da Receita, sem queda ou reinício do container. A
  imagem `graalyst-worker:homologacao` foi construída na VM e a prova isolada
  abriu um Chromium dentro do container com rede desativada, filesystem
  somente leitura e capabilities removidas (`runtimePlaywright=true`). Depois
  do teste, havia cerca de 568 MiB disponíveis e 81 MiB usados na swap. Nenhum
  `.env`, login ou dado fiscal foi enviado e nenhum serviço ficou em execução.

- A marca confirmada do produto é **Graalyst**. Em 06/09/2026, a marca recebeu
  ativos próprios para favicon e instalação móvel: PNG transparente sem sombra,
  ICO compatível e manifest explícito. O primeiro pacote tinha duas regressões
  de instalação: manifest protegido pelo login e resposta 500 por `id` no
  `manifest.ts`; ambos foram corrigidos e validados localmente com `200` e MIME
  correto. A variante aprovada é a mais detalhada, indicada como "esquerda".
  Não há service worker nem cache próprio; ver `IDENTIDADE-PWA.md`. Não
  confundir a marca com nomes de emitentes presentes em dados ou testes
  históricos.

- Web: cadastros, distribuição por lote, tarefas, notas, roteiro de entrega e
  relatórios operacionais; interface responsiva e fluxo diário reduzido.
- Worker: Playwright Async, 1 Browser + até 3 contextos isolados. Login,
  preenchimento, autorização em homologação e download de XML/DANFE já foram
  demonstrados ao vivo. O piloto de produção está implementado com
  concorrência obrigatória 1 e aguarda o checklist humano de liberação.
- A fonte de banco está ligada ao `main.py`. Com `FONTE_TAREFAS=banco` e as
  flags de integração, o modo seguro reserva, valida e devolve a tarefa a
  `PENDENTE`. Com `PROCESSAR_FILA_BANCO=true` e todas as travas de homologação,
  o código liga reserva → Playwright → `EMITINDO` → XML autorizado → `EMITIDA`.
  O modo seguro foi ensaiado com tarefa real. O ciclo conectado completo foi
  comprovado nas distribuições 000010–000012: banco → reserva → Playwright →
  `EMITINDO` → autorização → XML/DANFE → nota e tarefa `EMITIDA`.
- XML só é aceito com estrutura NF-e, chave de 44 dígitos, número, protocolo e
  `cStat=100`. PDF precisa começar com `%PDF-`. O upload privado está
  implementado, configurado e validado ao vivo: o primeiro XML/DANFE chegou ao
  bucket privado, a nota ficou disponível no Web e o PDF foi baixado com sucesso.
- Migrações `0001` a `0013` e `0015` estão aplicadas no banco de teste. A `0013` foi
  aplicada e validada em 05/09/2026: linha única `00:00–06:00`, leitura mínima
  do Worker e `search_path=pg_catalog` na função de reserva. A `0014` permanece
  explicitamente adiada porque altera funções do sistema de ponto. `0008` adiciona
  idempotência do lote, snapshot `payload_worker` + SHA-256, token de reserva,
  protocolo e unicidades. `0009` corrige a ambiguidade do retorno
  `reserva_token`. `EXECUTE` público da função de reserva está revogado.
- `0010` adiciona `codigo_erro`: o Worker registra uma causa sanitizada por
  etapa e o Web mostra “o que aconteceu” + “o que fazer”. O botão **Tentar
  novamente** aparece somente para falhas pré-emissão permitidas por lista
  fechada; resultado fiscal incerto nunca volta à fila.
- Validação local mais recente: **262 testes Worker** e **110 testes Web**
  passaram; build Next.js, TypeScript, `compileall` e preflight testado também
  passaram. O preflight operacional local só permanece bloqueado porque o
  `.env` de desenvolvimento não contém as credenciais `APP_*` do Vercel.
- O serviço persistente permanece disponível 24 horas para limpeza, retomada de
  upload e recuperação histórica. Apenas a reserva de novas emissões usa a
  janela configurável no Web e persistida no banco, padrão `00:00–06:00` em
  `America/Sao_Paulo`; fora dela somente tarefas pendentes do lote mais antigo
  já iniciado podem ser reservadas. O corte impede outro lote, mas conclui a
  distribuição em curso. A mudança é
  lida no ciclo seguinte, sem reiniciar a VM. `tzdata` fixa a base de fuso em
  todos os ambientes. O container já abriu o Chromium na VM; falta instalar a
  configuração operacional e provar o canal sem reservar fila involuntária.
- O bucket `documentos-fiscais` foi conferido somente por metadados: existe, é
  privado, limita tamanho e aceita PDF/XML. O papel `nf_worker_local` ganhou
  UPDATE apenas de `pdf_path`, `xml_path` e expiração; a auditoria continua sem
  privilégios obrigatórios ausentes ou excessivos.
- O Worker envia XML/DANFE em paralelo para caminhos `notas/<tarefa>/<tipo>-<sha256>`.
  Não usa upsert: conflito só é idempotente se o conteúdo remoto for idêntico.
  O Web gera URLs assinadas de 5 minutos exclusivamente no servidor.
- Antes do upload, o Worker grava um manifesto privado no volume persistente.
  Se o Storage falhar após a autorização, o ciclo seguinte recupera somente o
  XML/DANFE a partir desse manifesto e bloqueia novas emissões até concluir;
  nunca abre a Receita nem reemite a nota. A recuperação passou em testes
  locais, mas ainda aguarda ensaio em container/VM.
- A retenção padrão dos XML/DANFE emitidos é de 30 dias. A limpeza física foi
  implementada atrás de `LIMPAR_DOCUMENTOS_EXPIRADOS=false`: reserva notas
  vencidas com token/lease, apaga XML/DANFE pela API do Storage e só então
  limpa os caminhos no banco. Falha preserva as referências para nova tentativa
  e não bloqueia emissão fiscal. A migration `0011` foi aplicada em 02/09 e o
  papel mínimo foi reprovisionado/auditado; a flag continua opt-in até o ensaio.
- Consulta histórica sob demanda pelo portal é trabalho separado. Em 01/09,
  foram implementados a navegação segura HTTPS até Consulta - TESTE, a seleção
  exata do emitente por `valor_select_nfpe`, o filtro `value=1`, o campo da
  chave, o botão Consultar, “Um registro” e os ícones DANFE/XML. Em 01/09, o
  ensaio ao vivo pesquisou uma chave extraída de XML autorizado e confirmou
  exatamente um registro com as duas ações disponíveis.
  A chave já vem do XML autorizado e permanece em
  `fiscal.notas.chave_acesso`; não criar outra fonte a partir do HTML.
- Para o reconhecimento ao vivo existe um ensaio local em duas execuções. A
  primeira pausa no resumo antes de emitir e novamente depois dos downloads;
  a segunda escolhe o XML autorizado local mais recente, extrai a chave sem
  logá-la, pesquisa e pausa imediatamente após clicar em Consultar. Depois do
  Resume exige “Um registro” + ícones. Essa correspondência foi validada ao
  vivo; o gate local baixa XML primeiro e DANFE depois com
  `BAIXAR_DOCUMENTOS_CONSULTA=true`.
- A primeira tentativa de download revelou um DANFE decorativo no cabeçalho
  antes da ação da linha. Essa duplicação não é simétrica: exigir a segunda
  ocorrência do XML causou timeout antes do clique. Após exigir exatamente “Um
  registro”, o Worker usa agora a última ocorrência visível de cada ação, que
  cobre DANFE duplicado e XML único. O ensaio seguinte confirmou ao vivo os
  dois downloads e a correspondência do XML com a nota pesquisada.
- A migration `0012` e o código criam `fiscal.recuperacoes_documentos`, fila
  exclusiva por nota com `SKIP LOCKED`, lease e token próprios. O botão em
  `/notas` é idempotente e só aparece quando o par PDF/XML não está disponível.
  O Worker consulta pela chave permanente, valida primeiro o XML, baixa DANFE,
  envia ambos ao Storage e publica o par por **7 dias**. Falha nunca reabre a
  tarefa de emissão e o Web oferece uma tentativa explícita com mensagem segura.
- Teste conectado concluído pelo usuário em 02/09: duas notas foram solicitadas
  pelo Web e recuperadas em duas execuções consecutivas do Worker. Cada ciclo
  localizou a nota na Receita, validou/baixou XML e DANFE, reenviou o par ao
  Storage e restaurou os botões no Web. Nenhuma emissão estava pendente e
  nenhuma tarefa fiscal foi reaberta.
- Quantidade e preço exigem preenchimento mascarado. Nunca voltar a
  `fill(str(float))`: `2.0` podia ser interpretado como 20. O primeiro ajuste,
  com digitação sequencial e leitura após blur, foi insuficiente: em 01/09 o
  resumo autorizado ainda exibiu um zero extra. O código agora espera a reação
  inicial da máscara, seleciona todo o zero e usa `insert_text` em um evento,
  equivalente à colagem manual observada. O operador confirmou visualmente os
  valores corretos na pausa anterior à emissão; manter essa proteção e os
  testes de divergência.
  A API correta é `page.keyboard.insert_text()`, nunca `Locator.insert_text()`;
  a tentativa com o objeto errado falhou no primeiro campo e não emitiu nota.
- A consulta fixa o primeiro campo/resultado visível para lidar com cópias
  responsivas da SPA, dispensa `Tab`, registra a subetapa sem mostrar a chave e
  abre o Inspector inclusive se falhar antes do clique. O ensaio de 21:53
  validou chave, “Um registro” e as duas ações até o fim.
- Cadastros de emitente agora aceitam CPF ou CNPJ e IE opcional. A coluna
  física ainda se chama `cnpj` por compatibilidade; não criar migração apenas
  para renomeá-la durante o gate de integração.
- Clientes, emitentes e produtos podem ser desativados/reativados sem apagar histórico.
  A desativação é bloqueada enquanto houver tarefa operacional aberta.
- Produtos ativos podem ser editados no próprio cartão. Novas distribuições
  mostram somente produtos ativos; tarefas já criadas preservam seu snapshot.
- Erros esperados de formulário são mostrados na própria tela; falhas internas
  recebem mensagem genérica e não abrem a tela técnica do Next.js.
- Tarefas têm abas Pendentes, Em andamento, Atenção, Concluídas e Canceladas.
  `ERRO`/`AGUARDANDO_CONFERENCIA` não inflam Pendentes; erros pré-emissão podem
  ser movidos para Canceladas, mas incerteza fiscal continua protegida.
- A orquestração da fonte banco possui testes sem navegador para devolução segura
  a `PENDENTE`, credencial ausente, falha pré-emissão, incerteza pós-`EMITINDO`
  e registro de uma autorização confirmada com o token da reserva.
- A Home mostra um checklist fiscal calculado com as mesmas validações usadas
  no salvamento e leva diretamente ao cadastro pendente. A Distribuição não
  abre o formulário quando nenhum cliente/produto está pronto.
- O checklist usa uma única consulta agregada e foi validado visualmente em
  390×844; a Home respondeu em ~0,95 s no ensaio local após a otimização.
- Falhas temporárias do Web exibem recuperação neutra, sem detalhes técnicos e
  sem sugerir o reenvio cego de uma distribuição.
- O primeiro deploy Vercel revelou uma regressão exclusiva da autenticação
  ativa: o CSS escondia `.app-shell`, ancestral do próprio formulário. A regra
  agora oculta somente navegação lateral/cabeçalho/barra inferior e possui teste.
- Autenticação de transição por Supabase Auth foi adicionada atrás de
  `APP_AUTH_PROVIDER=supabase`. Ela reutiliza usuários do projeto compartilhado,
  mas só cria a sessão curta da aplicação depois de confirmar no próprio token
  do usuário que `public.perfis` contém `papel=gerente` e `ativo=true`. O login
  administrativo permanece como fallback até a chave publicável ser configurada.
  Recuperação de senha foi explicitamente adiada porque as contas atuais usam
  e-mails fictícios; não improvisar alteração direta em `auth.users`.
- O Worker local possui papel PostgreSQL exclusivo de menor privilégio,
  provisionado por comando explícito e salvo somente no `.env` ignorado. A
  auditoria confirmou todos os privilégios obrigatórios e nenhum excessivo.
- Asyncpg usa `statement_cache_size=0`, necessário para compatibilidade com o
  pooler transacional usado pelo banco. Verificadores retornam somente JSON
  sanitizado, sem traceback, host, usuário ou segredo.
- O verificador Web de integração agora aplica dígitos verificadores a CPF/CNPJ,
  exige vínculo com emitente ativo e regra fiscal ativa, sem imprimir documentos.

## Estado observado no banco de teste em 02/09/2026

- 1 cliente ativo e fiscalmente completo, vinculado ao emitente;
- 1 emitente ativo e completo para a integração;
- 4 produtos ativos passam nas validações estruturais. As distribuições
  000010–000012 usaram 3 produtos reais, localizados e preenchidos no portal;
- 14 tarefas `CANCELADA` e 3 tarefas `EMITIDA` visíveis no Web;
- 17 lotes numerados e 0 tarefas `PENDENTE` após o ensaio;
- canal TLS, papel restrito e função de reserva confirmados; no ensaio seguro,
  a tarefa voltou a `PENDENTE` sem emissão fiscal.
- Duas execuções com pausa manual atravessaram Transporte e foram autorizadas.
  A investigação mostrou uma corrida: depois do segundo Avançar do ICMS, a SPA
  podia manter o botão antigo visível por alguns milissegundos.
- O Worker agora aguarda a tela-resumo pelo botão `Adicionar Produto` antes de
  localizar o Avançar para Transporte. A 000012 validou essa sincronização sem
  Inspector nem espera fixa: produtos em 4,61 s, autorização confirmada e XML/
  DANFE salvos; o processo inteiro levou cerca de 18 s.
- `ACESSO_PORTAL_NEGADO` permanece como defesa caso o portal realmente negue o
  módulo; o Web não oferece retry automático para esse código.

## Contrato e estados

- Cada confirmação de distribuição cria um lote idempotente e numerado.
- Cada tarefa nova guarda `contrato_versao=1`, `payload_worker` imutável e
  `payload_hash`; os três campos são gravados atomicamente.
- A reserva retorna `tarefa_id` e um `reserva_token` único, com lease entre 60
  e 3600 segundos. Toda renovação/transição exige o token vigente.
- Ensaio seguro bem-sucedido: valida contrato/hash/credencial e devolve a
  tarefa a `PENDENTE`, limpando lease/token e restituindo a tentativa.
- Contrato, hash ou referência inválidos: `AGUARDANDO_CONFERENCIA`.
- Incerteza depois do clique fiscal ou lease vencido nunca entra novamente em
  retry automático; exige conferência humana para evitar nota duplicada.
- Autorização comprovada pelo XML registra nota e tarefa na mesma transação.

## Regras de domínio confirmadas

1. Emitente ↔ cliente é N:N; o emitente é escolhido por tarefa/distribuição.
2. Cliente tem nome curto operacional e razão social fiscal separados.
3. Preço padrão é por produto + cliente, podendo ser substituído no lote.
4. Regra fiscal é reutilizável e associada ao produto; o item guarda a
   referência usada, sem reinterpretar tarefas antigas.
5. Um lote representa uma distribuição e também delimita o relatório do
   motorista, que não contém valores monetários.
6. Relatórios atuais são operacionais. Financeiro líquido, auditoria, RH e
   autorização multiusuário pertencem às próximas fases.
7. Novas emissões automáticas usam a janela configurada no Web, inicialmente
   00:00–06:00 em `America/Sao_Paulo`; recuperação e limpeza continuam 24h.
   O horário final nunca interrompe tarefa iniciada e ainda precisa ser validado
   no container/VM.
8. A descrição do produto é seu nome operacional e deve diferenciá-lo também
   pela unidade; o Worker continua localizando o item pelo código fiscal.
9. Sobra de quantidade é permitida somente após confirmação explícita do
   usuário. Excesso continua inválido e bloqueado.
10. Uma distribuição aceita vários emitentes para o mesmo cliente. Quantidade,
    troca e preço são informados por par cliente + emitente; cada par gera uma
    nota/tarefa separada dentro do mesmo lote. A interface chama esse par de
    destino fiscal e só oferece relações ativas já habilitadas no cadastro. O
    usuário primeiro seleciona os mercados participantes; cada seleção inclui
    automaticamente o primeiro emitente e libera os demais daquele mercado.
11. O roteiro do motorista é agrupado por mercado, independentemente do
    emitente fiscal. Se o mesmo produto vier de vários emitentes, as quantidades
    e trocas são somadas na parada. A impressão permite escolher endereço,
    trocas, valores e campos de conferência; valores começam ocultos.
12. Indicadores de duração usam `tarefas.iniciado_em` e `concluido_em`: a
    duração do lote vai do primeiro início à última conclusão. A economia soma,
    por lote medido, a diferença positiva contra o benchmark humano de 337 s;
    o antigo tempo automático fixo de 42,18 s não participa mais do cálculo.
    Como `iniciado_em` preserva a primeira tentativa, lotes com qualquer tarefa
    reprocessada ficam fora da média/economia para não contabilizar espera como
    automação ativa.

## Reunião de 29/08/2026

O registro filtrado está em `REUNIAO-2026-08-29.md`. Os principais pontos ainda
abertos são responsividade do bloco Adicionar produto, confirmação visível após
criar o lote, confirmação de sobra e coerência semântica entre os KPIs da Home
e dos Relatórios. A retenção de uma semana citada na conversa foi substituída
pela decisão posterior de 30 dias. O erro fiscal de máscara numérica observado
na reunião foi reproduzido novamente em 01/09; a nova estratégia equivalente a
Ctrl+V está implementada, mas permanece no gate de validação pré-emissão.

## Próximo gate seguro

1. Manter a migration `0014` adiada. O Advisor confirma `EXECUTE` público em
   quatro funções administrativas do sistema de ponto; corrigir somente junto
   da versão 2.0 e com teste de login/gestão de usuários desse sistema.
2. No Supabase Auth, habilitar proteção contra senhas vazadas e configurar
   CAPTCHA/rate limits; no Vercel, publicar qualquer regra WAF somente depois de
   observá-la em modo de log para evitar bloquear o cliente legítimo.
3. Transferir a configuração secreta à VM e executar primeiro as auditorias sem
   consumir a fila. Docker/Compose, imagem e Chromium já foram validados.
4. Usar exclusivamente `nf_worker_vm`, já criada e auditada; iniciar o serviço
   somente quando não houver tarefa involuntária elegível.
5. Manter a VM Micro em concorrência 1 no piloto. Reavaliar paralelismo somente
   numa máquina maior, medindo CPU/RAM, isolamento, tempo e fronteiras da janela.
6. Validar a limpeza isolada da migration `0011` num documento de teste vencido. Manter a flag desligada até esse
   ensaio; o piloto real segue condicionado à virada coordenada, backup e
   aprovação humana de `PRODUCAO-FISCAL.md`.

## Índice local de código

O Graphify 0.9.50 foi validado em 27/08/2026 como ferramenta auxiliar local,
com suporte SQL e extração `--code-only`. O mapa não é fonte de verdade, não é
versionado e não autoriza pular a leitura do código ou os testes. Regras e
comandos seguros estão em `GRAPHIFY.md`. O uso é seletivo: obrigatório quando
há impacto transversal ou incerto e dispensável em correções locais já
mapeadas, nas quais a consulta acrescentaria custo sem reduzir leitura.

## Princípios imutáveis

- Não misturar Playwright Sync e Async nem compartilhar `BrowserContext`.
- Não colocar segredos no código, Git, logs, documentos ou banco acessível ao
  Web; `.env` nunca é versionado.
- Não emitir em produção sem decisão e validação humana explícitas.
- Não repetir automaticamente uma tarefa fiscal de resultado incerto.
- Não afirmar que algo funciona sem teste proporcional ao risco.
- Toda mudança de arquitetura deve ser registrada.
- Commits usam a identidade do programador; IA é ferramenta de apoio.
