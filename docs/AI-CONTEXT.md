# AI Context — NF Distribuição

## Objetivo

Contexto autoritativo para pessoas e IAs. Antes de alterar código, ler também
`ARCHITECTURE.md`, `HANDOFF.md` e `COLABORACAO.md` e conferir o diff atual.

O produto organiza distribuições diárias e automatiza NFP-e. O Web cadastra e
gera tarefas; o banco mantém snapshots imutáveis e a fila; o Worker reserva e
executa cada tarefa em um `BrowserContext` independente.

## Estado validado em 05/09/2026

- Tarefas e recuperações agora atualizam automaticamente enquanto houver
  trabalho ativo, em ciclos de 10s, pausados em aba oculta e encerrados ao
  concluir. Não foi concedido acesso Realtime ao schema fiscal: a sessão Web
  atual não preserva o JWT Supabase no navegador. Reavaliar Broadcast privado
  somente quando Supabase Auth/RLS estiverem de ponta a ponta.

- O primeiro ciclo fiscal completo na VM foi validado após a correção da
  transição de Transporte: AUTORIZADA, XML/DANFE privados e valores conferidos.
  Uma recuperação histórica também completou pela VM e restaurou o par por 7
  dias. Assim, o circuito remoto completo está comprovado em homologação.
  Polling atual: 30s; concorrência: 1. A janela foi ajustada pelo Web para
  00–10h durante o ensaio. Listagens ainda exigem navegação/recarga para buscar
  o estado novo; atualização automática é melhoria de UX pendente.

- Atualização autoritativa: Worker agora em execução na VM via Compose,
  homologação, concorrência 1, polling 30s, recuperação 24h e janela fiscal
  00–06h. Configuração transferida com autorização explícita e modo 600;
  auditoria de privilégios/canal passou dentro do container, sem reservas.
  Healthcheck passou; faltam ensaio fiscal completo na VM e medição sob carga.
  Relatos abaixo de serviço parado representam a preparação anterior.

- A VM piloto foi criada na Oracle em Vinhedo com Ubuntu 22.04 x86_64 e a
  forma Always Free `VM.Standard.E2.1.Micro` (1 GB). O bootstrap reproduzível
  `worker/scripts/preparar_vm_ubuntu.sh` foi executado com sucesso: 4 GB de
  swap, Docker 29.8, Compose 5.5, fuso `America/Sao_Paulo`, atualizações
  automáticas e firewall com somente SSH de entrada. O acesso usa chave,
  `PasswordAuthentication` já está desativado e nenhum Worker foi iniciado.
  Por causa da memória física limitada, o piloto deve permanecer headless e
  com `MAX_CONCORRENCIA=1`; medir RAM/swap antes de aceitar mais tarefas. A
  imagem `graalyst-worker:homologacao` foi construída na VM e a prova isolada
  abriu um Chromium dentro do container com rede desativada, filesystem
  somente leitura e capabilities removidas (`runtimePlaywright=true`). Depois
  do teste, havia cerca de 568 MiB disponíveis e 81 MiB usados na swap. Nenhum
  `.env`, login ou dado fiscal foi enviado e nenhum serviço ficou em execução.

- A marca confirmada do produto é **Graalyst**. O ícone oficial foi aplicado
  ao login e à navegação do Web; não confundir com nomes de emitentes presentes
  em dados ou testes históricos.

- Web: cadastros, distribuição por lote, tarefas, notas, roteiro de entrega e
  relatórios operacionais; interface responsiva e fluxo diário reduzido.
- Worker: Playwright Async, 1 Browser + até 3 contextos isolados. Login,
  preenchimento, autorização em homologação e download de XML/DANFE já foram
  demonstrados ao vivo. Produção permanece bloqueada.
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
- Migrações `0001` a `0013` estão aplicadas no banco de teste. A `0013` foi
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
- Validação local: **239 testes Worker**, **101 testes Web**, 3 testes do
  preflight de deploy, TypeScript e build de produção passaram.
- O serviço persistente permanece disponível 24 horas para limpeza, retomada de
  upload e recuperação histórica. Apenas a reserva de novas emissões usa a
  janela configurável no Web e persistida no banco, padrão `00:00–06:00` em
  `America/Sao_Paulo`; fora dela nenhuma tarefa fiscal é reservada. O corte só
  impede novos inícios: tarefa já reservada continua até terminar. A mudança é
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
    destino fiscal e só oferece relações ativas já habilitadas no cadastro.

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
5. Repetir o fluxo conectado com até 3 tarefas/contextos simultâneos, medindo
   CPU/RAM, isolamento, tempo e fronteiras da janela; depois adicionar alertas.
6. Validar a limpeza isolada da migration `0011` num documento de teste vencido. Manter a flag desligada até esse
   ensaio; produção segue bloqueada até autenticação/autorização definitiva,
   backup, recuperação e piloto humano aprovado.

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
