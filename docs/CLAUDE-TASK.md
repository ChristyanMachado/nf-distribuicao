# Ordem de continuidade para Claude — 05/09/2026

## Papel

Atue como revisor/implementador auxiliar. O Codex mantém a integração principal
e o responsável humano decide commits. Não presuma autoria, não faça push e não
altere arquitetura ou migrações aplicadas sem registrar e justificar.

## Antes de agir

1. Leia `AGENTS.md` quando disponível, `CLAUDE.MD`, `AI-CONTEXT.md`,
   `ARCHITECTURE.md`, `HANDOFF.md`, `COLABORACAO.md`, `SECURITY.md` e
   `CONTRATO-WEB-WORKER.md`.
2. Confira branch, `git status` e diff. Preserve alterações existentes.
3. Considere `0001`–`0013` já aplicadas no banco de teste. `0013` foi validada
   em 05/09/2026; `0014` continua adiada e não deve ser aplicada. Ela toca
   funções do sistema de ponto compartilhado e exige teste desse
   sistema. Em outro banco, rode primeiro a verificação pré-0008.
4. Se `graphify-out/graph.json` existir, use uma consulta focada para trabalho
   transversal ou de impacto incerto. Em correção pequena com arquivos já
   conhecidos, vá direto ao código, testes e diff. Siga `GRAPHIFY.md`, limite a
   saída e confirme toda conclusão no código real. Se o mapa não existir, ele é
   opcional: não bloqueie o trabalho nem peça credenciais para gerá-lo.

## Estado que deve ser preservado

- Playwright Async: 1 Browser + N `BrowserContext`s, máximo técnico atual 3.
- Produção fiscal bloqueada; somente host HTTPS exato de homologação.
- Fonte banco já ligada ao `main.py`; ensaio sem navegador devolve `PENDENTE`.
- Processamento completo só com todas as flags, visível e primeiro com uma
  tarefa. Resultado incerto exige conferência, nunca retry automático.
- Snapshot v1/payload/hash é imutável e gravado atomicamente.
- Credenciais não entram no Web, payload, Git, relatório ou logs.
- Emitente aceita CPF ou CNPJ, IE opcional e apenas referência de credencial.
  Não transforme essa referência em campos de login/senha no Web.
- Clientes, emitentes e produtos são desativados logicamente; não apague
  histórico em cascata. Tarefas possuem cinco visões e agrupamento por lote.
- As transições da orquestração banco já possuem testes diretos para sucesso,
  falha pré-emissão e resultado incerto pós-`EMITINDO`; preserve esses gates.

## Próxima tarefa prioritária

As telas `/tarefas` e `/notas` já possuem atualização automática adaptativa de
10s durante estados ativos, com pausa em aba oculta. Não substitua por Supabase
Realtime direto enquanto o navegador não possuir uma sessão Supabase autorizada
e o schema fiscal permanecer privado. A solução atual passou em testes, tipos e
build. Próxima validação humana: observar transições sem F5 no celular.

O reteste posterior aprovou a correção de Transporte no portal: 2,40s,
autorização, XML/DANFE e Storage concluídos pela VM. Recuperação histórica
também aprovada. Não reabrir esse diagnóstico sem nova evidência. Prioridades:
atualização automática moderada nas telas operacionais, piloto com outros
emitentes/clientes e medição de RAM/CPU durante Chromium. A janela observada no
banco no ensaio foi 00–10h e o polling da VM é 30s.

Atualização do ensaio na VM: falha pré-emissão após selecionar frete. Corrigida
a enumeração instável de botões em preencher_transporte, usando locator
dinâmico e confirmação de resumo. 239 testes e dois cenários Chromium reais
(local e VM) passaram; correção já implantada. Aguardar reteste no portal antes
de afirmar causa resolvida. Não instalar VNC nem reemitir automaticamente a
tarefa anterior; logs agora distinguem clique e confirmação do resumo.

Deploy atualizado em 05/09: Worker já iniciado na VM, com identidade exclusiva,
auditoria de canal/privilégios e healthcheck aprovados. Concorrência 1, polling
30s, homologação e janela 00–06h. Não repetir provisionamento ou implantação.
Próximo gate: validar uma operação pelo Web processada na VM e medir memória
com Chromium. Preservar a 0014 adiada. Os parágrafos de preparação abaixo são
históricos e não significam que o serviço ainda está parado.

Antes de qualquer alteração fiscal, preserve a janela operacional aplicada pela
migration `0013`. Não aplicar `0014` sem autorização humana explícita e
sem combinar um teste do login/gestão de usuários do sistema de ponto. A
auditoria ao vivo confirmou que o schema `fiscal` não tem grants de tabela para
`anon`/`authenticated`; não habilitar RLS ou grants adicionais às cegas.

Revise e ajude a validar o circuito conectado de recuperação já implementado:
`/notas` → `fiscal.recuperacoes_documentos` → Worker Consulta - TESTE → XML
validado → DANFE → Storage → botões Web. A fila tem lease/token próprios, uma
linha por nota e não pode atualizar nem reabrir a tarefa de emissão. Documentos
originais duram 30 dias; recuperados duram exatamente 7 dias.

As migrations `0011` e `0012` foram aplicadas no banco de teste em 02/09 pelo
migrator oficial do runtime. O papel `nf_worker_local` foi reprovisionado e a
auditoria passou sem privilégios ausentes ou excessivos. O teste humano de
ponta a ponta também passou com duas notas recuperadas em execuções separadas.
O próximo trabalho principal é instalar a configuração secreta e validar o
canal do container/VM sem consumir fila involuntária. A VM Oracle Micro já existe e o bootstrap versionado
foi executado: 1 GB físico, 4 GB de swap, Docker/Compose, firewall, fuso e
atualizações automáticas. Nenhum Worker foi iniciado. Trate-a como piloto,
mantenha concorrência 1 e não copie a credencial PostgreSQL local para ela. A
imagem foi construída e o Chromium abriu dentro do container com rede
desativada (`runtimePlaywright=true`). A identidade `nf_worker_vm` já foi criada
e auditada com privilégios fiscais mínimos; a credencial ainda está somente no
arquivo local ignorado pelo Git. Faltam transferência segura, auditoria na VM
e healthcheck do serviço sem tarefa.
O serviço já separa recuperação/limpeza 24h do início
de novas emissões. A janela padrão `00:00–06:00` é editável no Web, fica no
banco e é lida a cada ciclo. Não substitua essa política por cron que desligue
o serviço: o botão de recuperação deve continuar atendido fora da madrugada e
uma nota reservada antes do corte deve sempre terminar.

Ao orientar o deploy:

1. raiz Vercel deve ser `web/`; segredos apenas no painel e Preview isolado;
2. Worker não expõe porta e usa uma identidade PostgreSQL exclusiva;
3. auditar papel/canal antes de `docker compose up`;
4. confirmar ausência de tarefa involuntária, pois o serviço reserva ao subir;
5. começar com concorrência 1 e nunca trocar `AMBIENTE_EMISSAO` para normal.

O round-trip conectado está comprovado em homologação. As 000010 e 000011 foram
autorizadas com pausa humana; a 000012 foi autorizada automaticamente depois de
o Worker passar a aguardar a tela-resumo do último produto. Não substitua essa
espera por `sleep` nem remova a validação do domínio de homologação.

1. revisar a recuperação, especialmente idempotência, corrida limpeza/fila,
   validação do XML antes do DANFE e assinatura server-only;
2. não ativar sem teste humano; nunca pedir chaves ou credenciais no chat;
3. preservar a recuperação de upload interrompido sem reemitir nota e o teste
   de até 3 tarefas simultâneas com isolamento por contexto;
4. confirmar que o checklist Web e os bloqueios antecipados continuam
   coerentes com as validações das Server Actions e preservam a consulta
   agregada de prontidão; não voltar a várias consultas na Home;
5. preservar o tratamento de erros dentro dos formulários e a desativação
   lógica; falhas internas nunca devem aparecer na interface;
6. adicionar apenas testes unitários/integrados sem navegador que cubram falhas
   reais encontradas;
7. atualizar `HANDOFF.md` se houver mudança material.

Não habilite modo estrito, hooks, watch, MCP ou backend semântico do Graphify.
Não envie nem versione o grafo inteiro; para handoff, prefira uma saída curta da
consulta junto dos arquivos reais e do diff.

Preserve `ACESSO_PORTAL_NEGADO` como defesa e o modo opcional
`PAUSAR_ANTES_TRANSPORTE` apenas para diagnóstico visível e sempre em conjunto
com `INSPECIONAR=true`. O fluxo normal deve
permanecer sem Inspector e sincronizado por evidências da interface.

## Validação e entrega

Rode Worker tests, Web tests, TypeScript, build e `git diff --check`. Não afirme
que o round-trip fiscal funciona sem o teste humano. Entregue um resumo curto
com: arquivos alterados, motivo, testes, riscos residuais e próximo passo.

O formulário `/distribuicao` agora admite vários destinos fiscais para o mesmo
mercado: cada destino é o par cliente + emitente e gera sua própria tarefa no
mesmo lote. Preserve a seleção automática do primeiro emitente (caminho comum
com poucos cliques), a possibilidade de adicionar/remover outros emitentes e a
validação server-side que rejeita somente o par duplicado. Próximo teste humano:
um produto dividido entre Cooperativa — Patrick e Cooperativa — Wagner, em
homologação, conferindo duas tarefas/notas e o relatório do mesmo lote.

O fluxo visual tem duas etapas: selecionar mercados e, apenas nos selecionados,
gerenciar emitentes. O rascunho começa vazio; selecionar um mercado adiciona o
primeiro emitente, desmarcá-lo remove todas as suas linhas, e produtos não podem
ser adicionados sem mercado. Preserve essa prevenção contra notas acidentais.

O roteiro impresso foi convertido em documento operacional: controles e texto
explicativo não são impressos; há sequência de paradas, identificação da rota,
campos de motorista/veículo e conferência opcional. Endereço, trocas, valores e
conferência são filtros, com valores ocultos por padrão. Para o motorista, o
mesmo produto destinado ao mesmo mercado por emitentes distintos é consolidado
em uma linha. Não implementar rota automática usando somente CEP.

Os KPIs operacionais usam duração real por lote (primeiro início até última
conclusão). A economia deixou de aplicar o tempo automático fixo de 42,18 s:
agora compara cada lote mensurável ao benchmark humano de 337 s e mostra a
quantidade de distribuições medidas. Não contar lotes sem timestamps nem
economia negativa.
